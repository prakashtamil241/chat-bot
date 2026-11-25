import { BotConfig, PersonaPreset } from "../types/chat";

export const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: "python-tutor",
    name: "Python Tutor",
    summary: "Clear explanations, idiomatic Python 3.11+ examples, and step-by-step debugging.",
    systemInstruction:
      "You are PyChat, a patient and practical Python 3.11+ software engineer and tutor. Write clean, well-typed, PEP 8 compliant Python code using standard library solutions where possible. Explain concepts concisely with runnable examples.",
    thinkingLevel: "MEDIUM",
    starterPrompts: [
      "Write a clean Python CLI chatbot loop with conversation history",
      "Explain Python decorators with a practical caching example",
      "/calc (144 ** 0.5) * 12 + factorial(5)",
      "How do I read and parse a large JSONL file efficiently in Python?",
    ],
  },
  {
    id: "general-assistant",
    name: "General Assistant",
    summary: "Balanced everyday helper for writing, brainstorming, research, and quick calculations.",
    systemInstruction:
      "You are a concise, thoughtful assistant backed by a Python processing layer. Give direct, well-structured answers without filler.",
    thinkingLevel: "LOW",
    starterPrompts: [
      "Summarize the pros and cons of FastAPI vs Flask for a chatbot API",
      "Draft a clear README for an open-source Python CLI tool",
      "/help",
      "Compare lists, tuples, sets, and dictionaries in a compact table",
    ],
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    summary: "Security, edge-case, and performance reviews for Python scripts and APIs.",
    systemInstruction:
      "You are a senior Python code reviewer. Focus on correctness, edge cases, time/space complexity, type annotations, and security best practices. Provide concrete refactored code.",
    thinkingLevel: "HIGH",
    starterPrompts: [
      "Review a Python function that parses untrusted JSON and writes to SQLite",
      "What are common pitfalls with asyncio.gather and exception handling?",
      "Show how to safely evaluate arithmetic expressions in Python using ast",
      "/stats",
    ],
  },
  {
    id: "data-analyst",
    name: "Data & Math Analyst",
    summary: "Quantitative analysis, statistics, regex crafting, and Python data transformations.",
    systemInstruction:
      "You are a quantitative Python analyst. Provide exact formulas, clean Python data-processing snippets using standard library modules like statistics, csv, collections, and itertools, and clear numerical breakdowns.",
    thinkingLevel: "HIGH",
    starterPrompts: [
      "/py mean([42, 58, 61, 49, 77, 64])",
      "Write a Python script using csv and collections.Counter to aggregate sales logs",
      "Build a regex in Python to extract ISO dates and currency amounts",
      "/time",
    ],
  },
];

export const DEFAULT_BOT_CONFIG: BotConfig = {
  botName: "PyChat",
  personaId: PERSONA_PRESETS[0].id,
  systemInstruction: PERSONA_PRESETS[0].systemInstruction,
  thinkingLevel: PERSONA_PRESETS[0].thinkingLevel,
};

export function generateStandalonePythonScript(config: BotConfig): string {
  const safeName = config.botName.replace(/["\\\n\r]/g, "").trim() || "PyChat";
  const escapedInstruction = config.systemInstruction
    .replace(/\\/g, "\\\\")
    .replace(/"""/g, '\\"\\"\\"');

  return `#!/usr/bin/env python3
"""
${safeName} — Standalone Python Chatbot
Requires: pip install google-genai
Usage:
    export GEMINI_API_KEY="your-api-key"
    python3 chatbot.py
"""

import ast
import math
import operator
import os
import sys
from google import genai
from google.genai import types

BOT_NAME = "${safeName}"
MODEL_NAME = "gemini-4-hydrogen"
THINKING_LEVEL = "${config.thinkingLevel}"
SYSTEM_INSTRUCTION = """${escapedInstruction}"""

SAFE_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}


def safe_calc(expr: str) -> str:
    def _eval(node: ast.AST):
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in SAFE_OPS:
            return SAFE_OPS[type(node.op)](_eval(node.left), _eval(node.right))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            return -_eval(node.operand)
        if isinstance(node, ast.Name) and node.id in {"pi": math.pi, "e": math.e}:
            return {"pi": math.pi, "e": math.e}[node.id]
        raise ValueError("Unsupported expression")

    return str(_eval(ast.parse(expr, mode="eval")))


def main() -> None:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    client = genai.Client(api_key=api_key)
    chat = client.chats.create(
        model=MODEL_NAME,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            thinking_config=types.ThinkingConfig(thinking_level=THINKING_LEVEL),
        ),
    )

    print(f"{BOT_NAME} ready ({MODEL_NAME}). Type /calc <expr>, /reset, or /exit.\\n")

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\\nGoodbye!")
            break

        if not user_input:
            continue
        if user_input.lower() in {"/exit", "/quit", "exit", "quit"}:
            print("Goodbye!")
            break
        if user_input == "/reset":
            chat = client.chats.create(
                model=MODEL_NAME,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    thinking_config=types.ThinkingConfig(thinking_level=THINKING_LEVEL),
                ),
            )
            print(f"{BOT_NAME}: Conversation history cleared.\\n")
            continue
        if user_input.startswith("/calc "):
            expr = user_input[6:].strip()
            try:
                print(f"{BOT_NAME} [Python]: {expr} = {safe_calc(expr)}\\n")
            except Exception as err:
                print(f"{BOT_NAME} [Python]: Invalid expression ({err})\\n")
            continue

        print(f"{BOT_NAME}: ", end="", flush=True)
        try:
            for chunk in chat.send_message_stream(user_input):
                if chunk.text:
                    print(chunk.text, end="", flush=True)
            print("\\n")
        except Exception as err:
            print(f"\\nError: {err}\\n")


if __name__ == "__main__":
    main()
`;
}
