import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { spawn } from "child_process";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const PYTHON_ENGINE_PATH = path.resolve(__dirname, "python/chatbot_engine.py");

interface IncomingHistoryItem {
  role: "user" | "model";
  text: string;
}

interface PythonEngineResult {
  directReply: string | null;
  pythonToolName: string | null;
  pythonToolResult: string | null;
  augmentedSystemInstruction: string;
  pythonVersion: string;
}

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Please add it in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function runPythonEngine(payload: {
  message: string;
  history: IncomingHistoryItem[];
  systemInstruction: string;
}): Promise<PythonEngineResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [PYTHON_ENGINE_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        reject(new Error("Python engine timed out after 5 seconds."));
      }
    }, 5000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr.trim() || `Python exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as PythonEngineResult;
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Invalid output from Python engine: ${String(err)}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

function getPythonVersion(): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("python3", ["--version"]);
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf-8");
    });
    child.on("close", () => {
      resolve(out.trim() || "Python 3");
    });
    child.on("error", () => {
      resolve("Python 3");
    });
  });
}

function mapThinkingLevel(level?: string): ThinkingLevel {
  switch (level) {
    case "LOW":
      return ThinkingLevel.LOW;
    case "MEDIUM":
      return ThinkingLevel.MEDIUM;
    case "HIGH":
    default:
      return ThinkingLevel.HIGH;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/python/info", async (_req, res) => {
    try {
      const [version, engineSource] = await Promise.all([
        getPythonVersion(),
        fs.promises.readFile(PYTHON_ENGINE_PATH, "utf-8"),
      ]);
      res.json({
        version,
        enginePath: "python/chatbot_engine.py",
        engineSource,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to inspect Python runtime",
      });
    }
  });

  app.post("/api/chat", async (req, res) => {
    const { message, history, systemInstruction, thinkingLevel } = req.body ?? {};

    if (typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "Message must be a non-empty string." });
      return;
    }

    if (message.length > 16000) {
      res.status(400).json({ error: "Message exceeds maximum length of 16,000 characters." });
      return;
    }

    const sanitizedHistory: IncomingHistoryItem[] = Array.isArray(history)
      ? history
          .filter(
            (item): item is IncomingHistoryItem =>
              Boolean(item) &&
              (item.role === "user" || item.role === "model") &&
              typeof item.text === "string" &&
              item.text.trim().length > 0
          )
          .slice(-30)
      : [];

    const sysPrompt =
      typeof systemInstruction === "string" && systemInstruction.trim()
        ? systemInstruction.trim().slice(0, 4000)
        : "You are a helpful Python and AI assistant.";

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const sendEvent = (payload: Record<string, unknown>) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      const pyResult = await runPythonEngine({
        message: message.trim(),
        history: sanitizedHistory,
        systemInstruction: sysPrompt,
      });

      if (pyResult.pythonToolName && pyResult.pythonToolResult) {
        sendEvent({
          type: "tool",
          toolName: pyResult.pythonToolName,
          toolResult: pyResult.pythonToolResult,
          pythonVersion: pyResult.pythonVersion,
        });
      }

      if (pyResult.directReply) {
        sendEvent({ type: "chunk", text: pyResult.directReply });
        sendEvent({ type: "done" });
        res.end();
        return;
      }

      const ai = getGenAIClient();
      const chat = ai.chats.create({
        model: "gemini-4-hydrogen",
        config: {
          systemInstruction: pyResult.augmentedSystemInstruction,
          thinkingConfig: {
            thinkingLevel: mapThinkingLevel(
              typeof thinkingLevel === "string" ? thinkingLevel : undefined
            ),
          },
        },
        history: sanitizedHistory.map((item) => ({
          role: item.role,
          parts: [{ text: item.text }],
        })),
      });

      const streamResponse = await chat.sendMessageStream({
        message: message.trim(),
      });

      for await (const chunk of streamResponse) {
        if (res.writableEnded) break;
        const text = chunk.text;
        if (text) {
          sendEvent({ type: "chunk", text });
        }
      }

      sendEvent({ type: "done" });
      res.end();
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : "Unexpected server error";
      let friendlyMsg = rawMsg;

      if (rawMsg.includes("API_KEY_INVALID") || rawMsg.includes("PERMISSION_DENIED") || rawMsg.includes("403")) {
        friendlyMsg =
          "API key permission error. Please verify your GEMINI_API_KEY in the Settings > Secrets panel.";
      } else if (rawMsg.includes("RESOURCE_EXHAUSTED") || rawMsg.includes("429")) {
        friendlyMsg =
          "Rate limit reached (429). Please wait a moment and try again, or check your quota in Settings > Secrets.";
      }

      sendEvent({ type: "error", error: friendlyMsg });
      res.end();
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PyChat Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
