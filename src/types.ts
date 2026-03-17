export type ExternalProtocol = "anthropic" | "openai";

export type Role = "system" | "user" | "assistant" | "tool";

export interface NormalizedTextPart {
  type: "text";
  text: string;
}

export interface NormalizedToolUsePart {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface NormalizedToolResultPart {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type NormalizedContentPart =
  | NormalizedTextPart
  | NormalizedToolUsePart
  | NormalizedToolResultPart;

export interface NormalizedMessage {
  role: Role;
  content: NormalizedContentPart[];
}

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface NormalizedRequest {
  protocol: ExternalProtocol;
  model: string;
  messages: NormalizedMessage[];
  systemPrompt?: string;
  tools: ToolDefinition[];
  stream: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface ProviderRecord {
  id: string;
  name: string;
  protocol: ExternalProtocol;
  baseUrl: string;
  apiKeyEncrypted: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelMappingRecord {
  id: string;
  alias: string;
  providerId: string;
  upstreamModel: string;
  supportsNativeTools: number;
  requiresXmlShim: number;
  supportsStreaming: number;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeModelConfig {
  provider: Omit<ProviderRecord, "apiKeyEncrypted"> & { apiKey: string };
  mapping: ModelMappingRecord;
}

export interface XmlToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  raw: string;
}

export interface ParserState {
  buffer: string;
  visibleText: string;
}

export interface ParsedAssistantOutput {
  text: string;
  toolCalls: XmlToolCall[];
}

export interface FinalizedRun {
  output: ParsedAssistantOutput;
  stopReason: "end_turn" | "tool_use" | "error";
}

export interface RequestLogRecord {
  id: string;
  route: string;
  model: string;
  providerName: string | null;
  status: string;
  detail: string | null;
  createdAt: string;
}
