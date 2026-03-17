import crypto from "node:crypto";
import { appConfig } from "../config.js";
import { DatabaseService } from "./database.js";
import { decryptSecret, encryptSecret } from "../utils/crypto.js";
import { ModelMappingRecord, ProviderRecord, RuntimeModelConfig } from "../types.js";

interface ProviderInput {
  name: string;
  protocol: "anthropic" | "openai";
  baseUrl: string;
  apiKey: string;
}

interface MappingInput {
  alias: string;
  providerId: string;
  upstreamModel: string;
  supportsNativeTools: boolean;
  requiresXmlShim: boolean;
  supportsStreaming: boolean;
}

export class ProviderService {
  constructor(private readonly database: DatabaseService) {}

  listProviders(): ProviderRecord[] {
    return this.database.listProviders();
  }

  listMappings(): ModelMappingRecord[] {
    return this.database.listMappings();
  }

  createProvider(input: ProviderInput): ProviderRecord {
    const now = new Date().toISOString();
    const record: ProviderRecord = {
      id: crypto.randomUUID(),
      name: input.name,
      protocol: input.protocol,
      baseUrl: input.baseUrl.replace(/\/$/, ""),
      apiKeyEncrypted: encryptSecret(input.apiKey, appConfig.appSecret),
      createdAt: now,
      updatedAt: now
    };

    this.database.insertProvider(record);

    return record;
  }

  createMapping(input: MappingInput): ModelMappingRecord {
    const now = new Date().toISOString();
    const record: ModelMappingRecord = {
      id: crypto.randomUUID(),
      alias: input.alias,
      providerId: input.providerId,
      upstreamModel: input.upstreamModel,
      supportsNativeTools: input.supportsNativeTools ? 1 : 0,
      requiresXmlShim: input.requiresXmlShim ? 1 : 0,
      supportsStreaming: input.supportsStreaming ? 1 : 0,
      createdAt: now,
      updatedAt: now
    };

    this.database.insertMapping(record);

    return record;
  }

  resolveModel(alias: string): RuntimeModelConfig | null {
    const row = this.database.findModelWithProvider(alias);

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
        apiKey: decryptSecret(row.apiKeyEncrypted, appConfig.appSecret),
        createdAt: row.providerCreatedAt,
        updatedAt: row.providerUpdatedAt
      }
    };
  }
}
