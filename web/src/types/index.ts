// Provider types
export interface Provider {
  id: string;
  name: string;
  protocol: 'openai' | 'anthropic';
  baseUrl: string;
  shimStyle: 'legacy' | 'private_v1';
  createdAt: string;
  updatedAt: string;
}

export interface ProviderInput {
  name: string;
  protocol: 'openai' | 'anthropic';
  baseUrl: string;
  shimStyle: 'legacy' | 'private_v1';
  apiKey: string;
}

// Mapping types
export interface ModelMapping {
  id: string;
  alias: string;
  providerId: string;
  providerName?: string;
  upstreamModel: string;
  supportsStreaming: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelMappingInput {
  alias: string;
  providerId: string;
  upstreamModel: string;
  supportsStreaming: boolean;
}

// Log types
export type LogStatus = 'started' | 'ok' | 'error';

export interface RequestLog {
  id: string;
  requestId: string;
  route: string;
  clientProtocol: string;
  model: string;
  upstreamModel: string | null;
  providerName: string | null;
  status: LogStatus;
  durationMs: number | null;
  detail: string | null;
  createdAt: string;
}

// API response types
export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
}

export interface BootstrapData {
  providers: Provider[];
  mappings: ModelMapping[];
  logs: RequestLog[];
}

export interface TestMappingResult {
  ok: boolean;
  providerName: string;
  upstreamModel: string;
  result: unknown;
}

export interface TestProviderResult {
  ok: boolean;
  provider: Provider;
}
