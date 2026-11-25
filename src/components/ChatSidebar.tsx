import React from "react";
import { MessageSquare, Plus, Terminal, Trash2, X } from "lucide-react";
import { PERSONA_PRESETS } from "../data/presets";
import { ChatSession } from "../types/chat";

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string;
  activePersonaId: string;
  pythonVersion: string | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onSelectPersona: (personaId: string) => void;
  onQuickCommand: (command: string) => void;
}

const SLASH_COMMANDS = [
  { cmd: "/calc 2**10 + sqrt(144)", label: "/calc" },
  { cmd: "/py mean([10, 20, 30, 42])", label: "/py" },
  { cmd: "/stats", label: "/stats" },
  { cmd: "/time", label: "/time" },
  { cmd: "/help", label: "/help" },
];

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  sessions,
  activeSessionId,
  activePersonaId,
  pythonVersion,
  mobileOpen,
  onCloseMobile,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onSelectPersona,
  onQuickCommand,
}) => {
  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 md:hidden">
        <span className="text-sm font-semibold text-slate-900">Conversations</span>
        <button
          type="button"
          onClick={onCloseMobile}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="p-4 border-b border-slate-100">
        <button
          type="button"
          onClick={() => {
            onNewChat();
            onCloseMobile();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 whitespace-nowrap"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span>New Chat</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <section aria-label="Persona presets">
          <h2 className="px-2 mb-2 text-xs font-semibold text-slate-500">
            Bot Persona
          </h2>
          <div className="space-y-1">
            {PERSONA_PRESETS.map((preset) => {
              const isSelected = preset.id === activePersonaId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    onSelectPersona(preset.id);
                    onCloseMobile();
                  }}
                  className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    isSelected
                      ? "bg-blue-50 text-blue-900 font-medium"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="text-sm truncate">{preset.name}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-label="Chat history">
          <h2 className="px-2 mb-2 text-xs font-semibold text-slate-500">
            Recent Threads
          </h2>
          <div className="space-y-1">
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  className={`group flex items-center gap-1 rounded-lg transition-colors ${
                    isActive ? "bg-slate-100" : "hover:bg-slate-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSession(session.id);
                      onCloseMobile();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-blue-600 rounded-lg"
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-slate-400" />
                    <span
                      className={`truncate text-sm ${
                        isActive
                          ? "font-medium text-slate-900"
                          : "text-slate-700"
                      }`}
                    >
                      {session.title}
                    </span>
                  </button>
                  {sessions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteSession(session.id)}
                      className="mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-70 transition-colors hover:bg-slate-200 hover:text-slate-700 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-blue-600"
                      aria-label={`Delete ${session.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section aria-label="Python commands">
          <h2 className="px-2 mb-2 text-xs font-semibold text-slate-500">
            Python Commands
          </h2>
          <div className="space-y-1">
            {SLASH_COMMANDS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  onQuickCommand(item.cmd);
                  onCloseMobile();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-mono text-xs text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <Terminal className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{item.cmd}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
        {pythonVersion ? (
          <span className="font-mono tabular-nums">{pythonVersion} · stdlib engine</span>
        ) : (
          <span>Python 3 backend</span>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-[264px] shrink-0 h-full">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-50 w-[280px] max-w-[85vw] h-full">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
