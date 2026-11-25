import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUp,
  Download,
  Menu,
  RotateCw,
  Square,
  Terminal,
} from "lucide-react";
import { ChatSidebar } from "./components/ChatSidebar";
import { MarkdownRenderer } from "./components/MarkdownRenderer";
import { PythonSourceView } from "./components/PythonSourceView";
import {
  DEFAULT_BOT_CONFIG,
  generateStandalonePythonScript,
  PERSONA_PRESETS,
} from "./data/presets";
import {
  BotConfig,
  ChatMessage,
  ChatSession,
  PythonRuntimeInfo,
  PythonToolRun,
} from "./types/chat";

const STORAGE_KEY = "pychat_studio_sessions_v1";

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function createEmptySession(config: BotConfig = DEFAULT_BOT_CONFIG): ChatSession {
  return {
    id: createId(),
    title: "New conversation",
    updatedAt: new Date().toISOString(),
    config: { ...config },
    messages: [],
  };
}

function loadInitialSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatSession[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return [createEmptySession()];
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(loadInitialSessions);
  const [activeSessionId, setActiveSessionId] = useState<string>(
    () => sessions[0]?.id ?? ""
  );
  const [activeView, setActiveView] = useState<"chat" | "python">("chat");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pythonInfo, setPythonInfo] = useState<PythonRuntimeInfo | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? sessions[0],
    [sessions, activeSessionId]
  );

  const activePersona = useMemo(
    () =>
      PERSONA_PRESETS.find((p) => p.id === activeSession?.config.personaId) ??
      PERSONA_PRESETS[0],
    [activeSession?.config.personaId]
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 25)));
    } catch {
      // Ignore storage quota errors
    }
  }, [sessions]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/python/info")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PythonRuntimeInfo | null) => {
        if (!cancelled && data) {
          setPythonInfo(data);
        }
      })
      .catch(() => {
        // Non-blocking runtime inspection
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeView === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeSession?.messages.length, isStreaming, activeView]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const updateSession = (
    sessionId: string,
    updater: (prev: ChatSession) => ChatSession
  ) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? updater(s) : s))
    );
  };

  const handleNewChat = () => {
    if (isStreaming) {
      abortRef.current?.abort();
      setIsStreaming(false);
    }
    const next = createEmptySession(activeSession?.config ?? DEFAULT_BOT_CONFIG);
    setSessions((prev) => [next, ...prev]);
    setActiveSessionId(next.id);
    setActiveView("chat");
    setInput("");
  };

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const fallback = createEmptySession();
        setActiveSessionId(fallback.id);
        return [fallback];
      }
      if (id === activeSessionId) {
        setActiveSessionId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleSelectPersona = (personaId: string) => {
    const preset = PERSONA_PRESETS.find((p) => p.id === personaId);
    if (!preset || !activeSession) return;
    updateSession(activeSession.id, (prev) => ({
      ...prev,
      config: {
        ...prev.config,
        personaId: preset.id,
        systemInstruction: preset.systemInstruction,
        thinkingLevel: preset.thinkingLevel,
      },
    }));
  };

  const handleUpdateConfig = (nextConfig: BotConfig) => {
    if (!activeSession) return;
    updateSession(activeSession.id, (prev) => ({
      ...prev,
      config: nextConfig,
    }));
  };

  const handleDownloadPythonScript = () => {
    if (!activeSession) return;
    const code = generateStandalonePythonScript(activeSession.config);
    const blob = new Blob([code], { type: "text/x-python;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "chatbot.py";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleStopStreaming = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const sendMessage = async (rawText?: string) => {
    const textToSend = (rawText ?? input).trim();
    if (!textToSend || isStreaming || !activeSession) return;

    const sessionId = activeSession.id;
    const userMsg: ChatMessage = {
      id: createId(),
      role: "user",
      text: textToSend,
      createdAt: new Date().toISOString(),
    };

    const assistantMsgId = createId();
    const placeholderAssistant: ChatMessage = {
      id: assistantMsgId,
      role: "model",
      text: "",
      createdAt: new Date().toISOString(),
    };

    const historySnapshot = activeSession.messages
      .filter((m) => !m.isError && m.text.trim().length > 0)
      .map((m) => ({ role: m.role, text: m.text }));

    const nextTitle =
      activeSession.messages.length === 0
        ? textToSend.length > 38
          ? `${textToSend.slice(0, 38)}...`
          : textToSend
        : activeSession.title;

    updateSession(sessionId, (prev) => ({
      ...prev,
      title: nextTitle,
      updatedAt: new Date().toISOString(),
      messages: [...prev.messages, userMsg, placeholderAssistant],
    }));

    if (!rawText) {
      setInput("");
    }
    setActiveView("chat");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          history: historySnapshot,
          systemInstruction: activeSession.config.systemInstruction,
          thinkingLevel: activeSession.config.thinkingLevel,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(
          errBody.error || `Server returned HTTP ${response.status}`
        );
      }

      if (!response.body) {
        throw new Error("Empty response stream from server.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const line = rawEvent
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!line) continue;

          const jsonText = line.slice(6);
          let payload: {
            type?: string;
            text?: string;
            error?: string;
            toolName?: string;
            toolResult?: string;
            pythonVersion?: string;
          };
          try {
            payload = JSON.parse(jsonText);
          } catch {
            continue;
          }

          if (payload.type === "tool" && payload.toolName && payload.toolResult) {
            const toolRun: PythonToolRun = {
              toolName: payload.toolName,
              toolResult: payload.toolResult,
              pythonVersion: payload.pythonVersion,
            };
            updateSession(sessionId, (prev) => ({
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === assistantMsgId ? { ...m, pythonTool: toolRun } : m
              ),
            }));
          } else if (payload.type === "chunk" && payload.text) {
            updateSession(sessionId, (prev) => ({
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, text: m.text + payload.text }
                  : m
              ),
            }));
          } else if (payload.type === "error") {
            throw new Error(payload.error || "Model request failed.");
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        updateSession(sessionId, (prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === assistantMsgId && !m.text.trim()
              ? { ...m, text: "Generation stopped." }
              : m
          ),
        }));
      } else {
        const msg =
          err instanceof Error ? err.message : "Failed to reach chatbot server.";
        updateSession(sessionId, (prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === assistantMsgId
              ? { ...m, text: msg, isError: true }
              : m
          ),
        }));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleComposerKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const handleRetryLast = () => {
    if (!activeSession || isStreaming) return;
    const msgs = activeSession.messages;
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    updateSession(activeSession.id, (prev) => ({
      ...prev,
      messages: prev.messages.slice(0, -2),
    }));
    void sendMessage(lastUser.text);
  };

  if (!activeSession) return null;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-slate-50 text-slate-900">
      {/* Three-Zone Top Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-8 border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden focus-visible:outline-2 focus-visible:outline-blue-600"
            aria-label="Open conversations menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <a
            href="/"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            PyChat Studio
          </a>
        </div>

        <nav
          aria-label="Workspace views"
          className="flex items-center gap-6 text-sm font-medium"
        >
          <button
            type="button"
            onClick={() => setActiveView("chat")}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600 ${
              activeView === "chat"
                ? "text-blue-700 border-b-2 border-blue-700"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Chat Workspace
          </button>
          <button
            type="button"
            onClick={() => setActiveView("python")}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600 ${
              activeView === "python"
                ? "text-blue-700 border-b-2 border-blue-700"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Python Script
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleDownloadPythonScript}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4 text-slate-600" />
            <span className="hidden sm:inline">Download chatbot.py</span>
            <span className="sm:hidden">Export .py</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Area */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ChatSidebar
          sessions={sessions}
          activeSessionId={activeSession.id}
          activePersonaId={activeSession.config.personaId}
          pythonVersion={pythonInfo?.version ?? null}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onNewChat={handleNewChat}
          onSelectSession={(id) => {
            setActiveSessionId(id);
            setActiveView("chat");
          }}
          onDeleteSession={handleDeleteSession}
          onSelectPersona={handleSelectPersona}
          onQuickCommand={(cmd) => {
            void sendMessage(cmd);
          }}
        />

        {activeView === "python" ? (
          <PythonSourceView
            config={activeSession.config}
            pythonInfo={pythonInfo}
            onUpdateConfig={handleUpdateConfig}
          />
        ) : (
          <main className="flex min-w-0 flex-1 flex-col bg-slate-50">
            {/* Scrollable Messages Viewport */}
            <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
              {activeSession.messages.length === 0 ? (
                <div className="mx-auto flex h-full max-w-2xl flex-col justify-center py-8">
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-slate-500">
                      <span>{activePersona.name}</span>
                      <span aria-hidden="true" className="mx-2">
                        ·
                      </span>
                      <span>
                        {pythonInfo?.version ?? "Python 3"} Backend
                      </span>
                    </div>
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-900 text-balance">
                      Chat with {activeSession.config.botName || "PyChat"}
                    </h1>
                    <p className="text-[15px] leading-relaxed text-slate-600 max-w-xl">
                      {activePersona.summary} Every prompt passes through{" "}
                      <code className="font-mono text-xs bg-slate-200/70 px-1.5 py-0.5 rounded text-slate-800">
                        python/chatbot_engine.py
                      </code>{" "}
                      for slash commands and safe Python evaluation before streaming responses.
                    </p>
                  </div>

                  <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {activePersona.starterPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        className="rounded-xl border border-slate-200 bg-white p-4 text-left text-sm leading-snug text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-6">
                  {activeSession.messages.map((msg, idx) => {
                    const isUser = msg.role === "user";
                    const isLastStreaming =
                      isStreaming &&
                      !isUser &&
                      idx === activeSession.messages.length - 1;

                    if (isUser) {
                      return (
                        <div key={msg.id} className="flex flex-col items-end">
                          <div className="max-w-[85%] rounded-2xl bg-slate-900 px-4 py-3 text-[15px] leading-relaxed text-white">
                            <p className="whitespace-pre-wrap break-words">
                              {msg.text}
                            </p>
                          </div>
                          <div className="mt-1.5 text-xs text-slate-500 tabular-nums">
                            <span>You</span>
                            <span aria-hidden="true" className="mx-1.5">
                              ·
                            </span>
                            <span>{formatTime(msg.createdAt)}</span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={msg.id} className="flex flex-col items-start">
                        <div
                          className={`w-full rounded-2xl border px-5 py-4 ${
                            msg.isError
                              ? "border-red-200 bg-red-50 text-red-800"
                              : "border-slate-200 bg-white text-slate-900"
                          }`}
                        >
                          {msg.pythonTool && (
                            <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                              <Terminal className="h-3.5 w-3.5 shrink-0 text-blue-700" />
                              <span className="font-medium text-slate-900 shrink-0">
                                python · {msg.pythonTool.toolName}
                              </span>
                              <span
                                aria-hidden="true"
                                className="text-slate-400 shrink-0"
                              >
                                →
                              </span>
                              <span className="truncate">
                                {msg.pythonTool.toolResult}
                              </span>
                            </div>
                          )}

                          {msg.isError ? (
                            <div className="space-y-3">
                              <div className="flex items-start gap-2.5 text-sm">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                                <span>{msg.text}</span>
                              </div>
                              <button
                                type="button"
                                onClick={handleRetryLast}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-600"
                              >
                                <RotateCw className="h-3.5 w-3.5" />
                                <span>Retry</span>
                              </button>
                            </div>
                          ) : msg.text ? (
                            <MarkdownRenderer content={msg.text} />
                          ) : (
                            <div className="flex items-center gap-2 py-1 text-sm text-slate-500">
                              <span>Generating response</span>
                              <span className="inline-flex gap-1" aria-hidden="true">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.2s]" />
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.1s]" />
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" />
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="mt-1.5 flex items-center text-xs text-slate-500 tabular-nums">
                          <span>{activeSession.config.botName || "PyChat"}</span>
                          <span aria-hidden="true" className="mx-1.5">
                            ·
                          </span>
                          <span>{activePersona.name}</span>
                          <span aria-hidden="true" className="mx-1.5">
                            ·
                          </span>
                          <span>
                            {isLastStreaming
                              ? "Streaming..."
                              : formatTime(msg.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Sticky Bottom Composer */}
            <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
              <div className="mx-auto max-w-3xl">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendMessage();
                  }}
                  className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-2 transition-colors focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/15"
                >
                  <label htmlFor="chat-composer" className="sr-only">
                    Message input
                  </label>
                  <textarea
                    id="chat-composer"
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Ask anything in Python, or try /calc, /py, /stats, /help..."
                    className="max-h-[180px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-snug text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />

                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={handleStopStreaming}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-blue-600"
                      aria-label="Stop generating"
                    >
                      <Square className="h-4 w-4 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white transition-colors hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 focus-visible:outline-2 focus-visible:outline-blue-700"
                      aria-label="Send message"
                    >
                      <ArrowUp className="h-5 w-5" />
                    </button>
                  )}
                </form>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>Enter to send · Shift+Enter for new line</span>
                  <span>
                    Commands:{" "}
                    <code className="font-mono text-slate-700">/calc</code>,{" "}
                    <code className="font-mono text-slate-700">/py</code>,{" "}
                    <code className="font-mono text-slate-700">/stats</code>,{" "}
                    <code className="font-mono text-slate-700">/help</code>
                  </span>
                </div>
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
