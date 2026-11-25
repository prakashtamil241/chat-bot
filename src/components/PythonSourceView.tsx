import React, { useMemo, useState } from "react";
import { Check, Copy, Download, RotateCcw } from "lucide-react";
import {
  DEFAULT_BOT_CONFIG,
  generateStandalonePythonScript,
  PERSONA_PRESETS,
} from "../data/presets";
import { BotConfig, PythonRuntimeInfo, ThinkingDepth } from "../types/chat";

interface PythonSourceViewProps {
  config: BotConfig;
  pythonInfo: PythonRuntimeInfo | null;
  onUpdateConfig: (next: BotConfig) => void;
}

const THINKING_LEVELS: { value: ThinkingDepth; label: string }[] = [
  { value: "LOW", label: "Low (Fast)" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High (Deep)" },
];

export const PythonSourceView: React.FC<PythonSourceViewProps> = ({
  config,
  pythonInfo,
  onUpdateConfig,
}) => {
  const [sourceTab, setSourceTab] = useState<"standalone" | "engine">(
    "standalone"
  );
  const [copied, setCopied] = useState(false);

  const standaloneCode = useMemo(
    () => generateStandalonePythonScript(config),
    [config]
  );

  const activeCode =
    sourceTab === "standalone"
      ? standaloneCode
      : pythonInfo?.engineSource || "# Loading backend engine source...";

  const activeFilename =
    sourceTab === "standalone" ? "chatbot.py" : "chatbot_engine.py";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleDownload = () => {
    const blob = new Blob([activeCode], { type: "text/x-python;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = activeFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleResetDefaults = () => {
    onUpdateConfig(DEFAULT_BOT_CONFIG);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">
              Python Chatbot Configuration &amp; Source
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Customize your bot parameters to update both the live workspace and the downloadable Python script.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0"
            >
              <Download className="h-4 w-4" />
              <span>Download {activeFilename}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Configuration panel */}
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-5">
            <div>
              <label
                htmlFor="bot-name-input"
                className="block text-sm font-medium text-slate-800 mb-1.5"
              >
                Bot Name
              </label>
              <input
                id="bot-name-input"
                type="text"
                value={config.botName}
                maxLength={40}
                onChange={(e) =>
                  onUpdateConfig({ ...config, botName: e.target.value })
                }
                placeholder="PyChat"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <div>
              <label
                htmlFor="persona-select"
                className="block text-sm font-medium text-slate-800 mb-1.5"
              >
                Persona Preset
              </label>
              <select
                id="persona-select"
                value={config.personaId}
                onChange={(e) => {
                  const found = PERSONA_PRESETS.find(
                    (p) => p.id === e.target.value
                  );
                  if (found) {
                    onUpdateConfig({
                      ...config,
                      personaId: found.id,
                      systemInstruction: found.systemInstruction,
                      thinkingLevel: found.thinkingLevel,
                    });
                  }
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              >
                {PERSONA_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-sm font-medium text-slate-800 mb-1.5">
                Reasoning Depth
              </span>
              <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-slate-100 p-1">
                {THINKING_LEVELS.map((level) => {
                  const active = config.thinkingLevel === level.value;
                  return (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() =>
                        onUpdateConfig({ ...config, thinkingLevel: level.value })
                      }
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                        active
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {level.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label
                htmlFor="system-instruction-textarea"
                className="block text-sm font-medium text-slate-800 mb-1.5"
              >
                System Instruction
              </label>
              <textarea
                id="system-instruction-textarea"
                rows={5}
                value={config.systemInstruction}
                maxLength={4000}
                onChange={(e) =>
                  onUpdateConfig({ ...config, systemInstruction: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h2 className="text-sm font-semibold text-slate-900 mb-2">
                Run Locally in Terminal
              </h2>
              <ol className="space-y-1.5 text-xs text-slate-600 list-decimal pl-4">
                <li>
                  Install the SDK:{" "}
                  <code className="font-mono text-slate-800">
                    pip install google-genai
                  </code>
                </li>
                <li>
                  Set your key:{" "}
                  <code className="font-mono text-slate-800">
                    export GEMINI_API_KEY=&quot;...&quot;
                  </code>
                </li>
                <li>
                  Launch the bot:{" "}
                  <code className="font-mono text-slate-800">
                    python3 chatbot.py
                  </code>
                </li>
              </ol>
            </div>
          </div>

          {/* Code preview panel */}
          <div className="lg:col-span-7 overflow-hidden rounded-xl border border-slate-200 bg-slate-950 text-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2.5">
              <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => setSourceTab("standalone")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    sourceTab === "standalone"
                      ? "bg-slate-950 text-white"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  chatbot.py (CLI)
                </button>
                <button
                  type="button"
                  onClick={() => setSourceTab("engine")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    sourceTab === "engine"
                      ? "bg-slate-950 text-white"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  chatbot_engine.py (Backend)
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-blue-400 whitespace-nowrap shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>

            <pre className="max-h-[620px] overflow-auto p-4 font-mono text-[13px] leading-relaxed text-slate-100">
              <code>{activeCode}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
