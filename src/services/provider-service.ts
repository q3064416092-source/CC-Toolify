import crypto from "node:crypto";
import { appConfig } from "../config.js";
import { ModelMappingRecord, ProviderRecord, RuntimeModelConfig, XmlShimStyle } from "../types.js";
import { decryptSecret, encryptSecret } from "../utils/crypto.js";
import { DatabaseService } from "./database.js";

interface ProviderInput {
  name: string;
  protocol: "anthropic" | "openai";
  baseUrl: string;
  shimStyle?: XmlShimStyle;
  apiKey?: string;
}

interface MappingInput {
  alias: string;
  providerId: string;
  upstreamModel: string;
  supportsNativeTools: boolean;
  requiresXmlShim: boolean;
  supportsStreaming: boolean;
}

export class ProviderServiceError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "ProviderServiceError";
  }
}

export class ProviderService {
  constructor(private readonly database: DatabaseService) {}

  listProviders(): ProviderRecord[] {
    return this.database.listProviders();
  }

  listMappings(): ModelMappingRecord[] {
    return this.database.listMappings();
  }

  getProvider(providerId: string): ProviderRecord | null {
    return this.database.getProviderById(providerId);
  }

  getMapping(mappingId: string): ModelMappingRecord | null {
    return this.database.getMappingById(mappingId);
  }

  createProvider(input: ProviderInput): ProviderRecord {
    const sanitized = this.sanitizeProviderInput(input, true);
    const now = new Date().toISOString();
    const record: ProviderRecord = {
      id: crypto.randomUUID(),
      name: sanitized.name,
      protocol: sanitized.protocol,
      baseUrl: sanitized.baseUrl,
      shimStyle: sanitized.shimStyle,
      apiKeyEncrypted: encryptSecret(sanitized.apiKey, appConfig.appSecret),
      createdAt: now,
      updatedAt: now
    };

    this.database.insertProvider(record);
    return record;
  }

  updateProvider(providerId: string, input: ProviderInput): ProviderRecord {
    const existing = this.database.getProviderById(providerId);
    if (!existing) {
      throw new ProviderServiceError("Upstream provider not found", 404);
    }

    const sanitized = this.sanitizeProviderInput(input, false);
    const updated: ProviderRecord = {
      ...existing,
      name: sanitized.name,
      protocol: sanitized.protocol,
      baseUrl: sanitized.baseUrl,
      shimStyle: sanitized.shimStyle,
      apiKeyEncrypted: sanitized.apiKey
        ? encryptSecret(sanitized.apiKey, appConfig.appSecret)
        : existing.apiKeyEncrypted,
      updatedAt: new Date().toISOString()
    };

    this.database.updateProvider(updated);
    return updated;
  }

  deleteProvider(providerId: string): void {
    const existing = this.database.getProviderById(providerId);
    if (!existing) {
      throw new ProviderServiceError("Upstream provider not found", 404);
    }

    if (this.database.providerHasMappings(providerId)) {
      throw new ProviderServiceError("Please delete related model mappings first", 409);
    }

    this.database.deleteProvider(providerId);
  }

  createMapping(input: MappingInput): ModelMappingRecord {
    const sanitized = this.sanitizeMappingInput(input, true);
    const now = new Date().toISOString();
    const record: ModelMappingRecord = {
      id: crypto.randomUUID(),
      alias: sanitized.alias,
      providerId: sanitized.providerId,
      upstreamModel: sanitized.upstreamModel,
      supportsNativeTools: sanitized.supportsNativeTools ? 1 : 0,
      requiresXmlShim: sanitized.requiresXmlShim ? 1 : 0,
      supportsStreaming: sanitized.supportsStreaming ? 1 : 0,
      createdAt: now,
      updatedAt: now
    };

    this.database.insertMapping(record);
    return record;
  }

  updateMapping(mappingId: string, input: MappingInput): ModelMappingRecord {
    const existing = this.database.getMappingById(mappingId);
    if (!existing) {
      throw new ProviderServiceError("Model mapping not found", 404);
    }

    const sanitized = this.sanitizeMappingInput(input, false, mappingId);
    const updated: ModelMappingRecord = {
      ...existing,
      alias: sanitized.alias,
      providerId: sanitized.providerId,
      upstreamModel: sanitized.upstreamModel,
      supportsNativeTools: sanitized.supportsNativeTools ? 1 : 0,
      requiresXmlShim: sanitized.requiresXmlShim ? 1 : 0,
      supportsStreaming: sanitized.supportsStreaming ? 1 : 0,
      updatedAt: new Date().toISOString()
    };

    this.database.updateMapping(updated);
    return updated;
  }

  deleteMapping(mappingId: string): void {
    const existing = this.database.getMappingById(mappingId);
    if (!existing) {
      throw new ProviderServiceError("Model mapping not found", 404);
    }

    this.database.deleteMapping(mappingId);
  }

  resolveModel(alias: string): RuntimeModelConfig | null {
    const row = this.database.findModelWithProvider(alias.trim());
    if (!row) {
      return null;
    }

    return {
      mapping: {
        id: row.mappingId,
        alias: row.alias,
        providerId: row.providerId,
        upstreamModel: row.upstreamModel,
        supportsNativeTools: row.supportsNativeTools,
        requiresXmlShim: row.requiresXmlShim,
        supportsStreaming: row.supportsStreaming,
        createdAt: row.mappingCreatedAt,
        updatedAt: row.mappingUpdatedAt
      },
      provider: {
        id: row.providerRealId,
        name: row.name,
        protocol: row.protocol,
        baseUrl: row.baseUrl,
        shimStyle: row.shimStyle,
        apiKey: decryptSecret(row.apiKeyEncrypted, appConfig.appSecret),
        createdAt: row.providerCreatedAt,
        updatedAt: row.providerUpdatedAt
      }
    };
  }

  resolveMappingById(mappingId: string): RuntimeModelConfig | null {
    const mapping = this.database.getMappingById(mappingId);
    if (!mapping) {
      return null;
    }

    return this.resolveModel(mapping.alias);
  }

  private sanitizeProviderInput(
    input: ProviderInput,
    requireApiKey: boolean
  ): ProviderInput & { apiKey: string; shimStyle: XmlShimStyle } {
    const name = input.name.trim();
    if (!name) {
      throw new ProviderServiceError("Provider name cannot be empty", 400);
    }

    const protocol = input.protocol === "anthropic" ? "anthropic" : "openai";
    const baseUrl = this.normalizeBaseUrl(input.baseUrl);
    const shimStyle = input.shimStyle === "private_v1" ? "private_v1" : "legacy";
    const apiKey = (input.apiKey ?? "").trim();

    if (requireApiKey && !apiKey) {
      throw new ProviderServiceError("API Key cannot be empty", 400);
    }

    return { name, protocol, baseUrl, shimStyle, apiKey };
  }

  private sanitizeMappingInput(
    input: MappingInput,
    isCreate: boolean,
    currentMappingId?: string
  ): MappingInput {
    const alias = input.alias.trim();
    const providerId = input.providerId.trim();
    const upstreamModel = input.upstreamModel.trim();

    if (!alias) {
      throw new ProviderServiceError("External model alias cannot be empty", 400);
    }

    if (!/^[A-Za-z0-9._:-]+$/.test(alias)) {
      throw new ProviderServiceError("Model alias only supports letters, numbers, dot, underscore, colon and hyphen", 400);
    }

    if (!providerId) {
      throw new ProviderServiceError("Please select an upstream provider", 400);
    }

    if (!this.database.getProviderById(providerId)) {
      throw new ProviderServiceError("Selected upstream provider does not exist", 404);
    }

    if (!upstreamModel) {
      throw new ProviderServiceError("Upstream model name cannot be empty", 400);
    }

    const existing = this.database.findMappingByAlias(alias);
    if (existing && (isCreate || existing.id !== currentMappingId)) {
      throw new ProviderServiceError("Model alias already exists", 409);
    }

    return {
      alias,
      providerId,
      upstreamModel,
      supportsNativeTools: false,
      requiresXmlShim: true,
      supportsStreaming: Boolean(input.supportsStreaming)
    };
  }

  private normalizeBaseUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new ProviderServiceError("Base URL cannot be empty", 400);
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new ProviderServiceError("Base URL is invalid", 400);
    }

    return parsed.toString().replace(/\/$/, "");
  }
}
