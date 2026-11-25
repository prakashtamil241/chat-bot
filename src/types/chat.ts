export type ThinkingDepth = "LOW" | "MEDIUM" | "HIGH";

export interface PythonToolRun {
  toolName: string;
  toolResult: string;
  pythonVersion?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  createdAt: string;
  pythonTool?: PythonToolRun;
  isError?: boolean;
}

export interface BotConfig {
  botName: string;
  personaId: string;
  systemInstruction: string;
  thinkingLevel: ThinkingDepth;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  config: BotConfig;
  messages: ChatMessage[];
}

export interface PersonaPreset {
  id: string;
  name: string;
  summary: string;
  systemInstruction: string;
  thinkingLevel: ThinkingDepth;
  starterPrompts: string[];
}

export interface PythonRuntimeInfo {
  version: string;
  enginePath: string;
  engineSource: string;
}
