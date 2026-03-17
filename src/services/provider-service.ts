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
    return this.database.db
      .prepare(
        `SELECT id, name, protocol, base_url as baseUrl, api_key_encrypted as apiKeyEncrypted, created_at as createdAt, updated_at as updatedAt
         FROM providers ORDER BY created_at DESC`
      )
      .all() as ProviderRecord[];
  }

  listMappings(): ModelMappingRecord[] {
    return this.database.db
      .prepare(
        `SELECT id, alias, provider_id as providerId, upstream_model as upstreamModel,
                supports_native_tools as supportsNativeTools,
                requires_xml_shim as requiresXmlShim,
                supports_streaming as supportsStreaming,
                created_at as createdAt, updated_at as updatedAt
         FROM model_mappings ORDER BY created_at DESC`
      )
      .all() as ModelMappingRecord[];
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

    this.database.db
      .prepare(
        `INSERT INTO providers (id, name, protocol, base_url, api_key_encrypted, created_at, updated_at)
         VALUES (@id, @name, @protocol, @baseUrl, @apiKeyEncrypted, @createdAt, @updatedAt)`
      )
      .run(record);

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

    this.database.db
      .prepare(
        `INSERT INTO model_mappings (
          id, alias, provider_id, upstream_model, supports_native_tools, requires_xml_shim, supports_streaming, created_at, updated_at
        ) VALUES (
          @id, @alias, @providerId, @upstreamModel, @supportsNativeTools, @requiresXmlShim, @supportsStreaming, @createdAt, @updatedAt
        )`
      )
      .run(record);

    return record;
  }

  resolveModel(alias: string): RuntimeModelConfig | null {
    const row = this.database.db
      .prepare(
        `SELECT
            m.id as mappingId,
            m.alias,
            m.provider_id as providerId,
            m.upstream_model as upstreamModel,
            m.supports_native_tools as supportsNativeTools,
            m.requires_xml_shim as requiresXmlShim,
            m.supports_streaming as supportsStreaming,
            m.created_at as mappingCreatedAt,
            m.updated_at as mappingUpdatedAt,
            p.id as providerRealId,
            p.name,
            p.protocol,
            p.base_url as baseUrl,
            p.api_key_encrypted as apiKeyEncrypted,
            p.created_at as providerCreatedAt,
            p.updated_at as providerUpdatedAt
         FROM model_mappings m
         JOIN providers p ON p.id = m.provider_id
         WHERE m.alias = ?`
      )
      .get(alias) as
      | {
          mappingId: string;
          alias: string;
          providerId: string;
          upstreamModel: string;
          supportsNativeTools: number;
          requiresXmlShim: number;
          supportsStreaming: number;
          mappingCreatedAt: string;
          mappingUpdatedAt: string;
          providerRealId: string;
          name: string;
          protocol: "anthropic" | "openai";
          baseUrl: string;
          apiKeyEncrypted: string;
          providerCreatedAt: string;
          providerUpdatedAt: string;
        }
      | undefined;

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
