import { describe, expect, it } from "vitest";
import { appConfig } from "../src/config.js";
import { ProviderService } from "../src/services/provider-service.js";
import { encryptSecret } from "../src/utils/crypto.js";

const providerRecord = {
  id: "provider-1",
  name: "Test Provider",
  protocol: "openai" as const,
  baseUrl: "https://example.com",
  shimStyle: "private_v1" as const,
  apiKeyEncrypted: encryptSecret("test-key", appConfig.appSecret),
  createdAt: "2026-03-18T00:00:00.000Z",
  updatedAt: "2026-03-18T00:00:00.000Z"
};

const mappingRecord = {
  id: "mapping-1",
  alias: "qwen-max",
  providerId: "provider-1",
  upstreamModel: "qwen-max-2025",
  supportsNativeTools: 0,
  requiresXmlShim: 1,
  supportsStreaming: 1,
  createdAt: "2026-03-18T00:00:00.000Z",
  updatedAt: "2026-03-18T00:00:00.000Z"
};

describe("provider service runtime alias resolution", () => {
  it("resolves a normal alias as the default variant", () => {
    const database = {
      listProviders: () => [],
      listMappings: () => [],
      getProviderById: () => providerRecord,
      getMappingById: () => mappingRecord,
      findModelWithProvider: (alias: string) => alias === "qwen-max"
        ? {
            ...mappingRecord,
            mappingId: mappingRecord.id,
            providerRealId: providerRecord.id,
            name: providerRecord.name,
            protocol: providerRecord.protocol,
            baseUrl: providerRecord.baseUrl,
            shimStyle: providerRecord.shimStyle,
            apiKeyEncrypted: providerRecord.apiKeyEncrypted,
            providerCreatedAt: providerRecord.createdAt,
            providerUpdatedAt: providerRecord.updatedAt,
            mappingCreatedAt: mappingRecord.createdAt,
            mappingUpdatedAt: mappingRecord.updatedAt
          }
        : null
    };

    const service = new ProviderService(database as never);
    const runtime = service.resolveModel("qwen-max");

    expect(runtime).not.toBeNull();
    expect(runtime?.resolvedModel).toBe("qwen-max");
    expect(runtime?.mapping.alias).toBe("qwen-max");
    expect(runtime?.variant).toBe("default");
  });

  it("resolves an alias with -cc suffix as Claude Code variant", () => {
    const database = {
      listProviders: () => [],
      listMappings: () => [],
      getProviderById: () => providerRecord,
      getMappingById: () => mappingRecord,
      findModelWithProvider: (alias: string) => alias === "qwen-max"
        ? {
            ...mappingRecord,
            mappingId: mappingRecord.id,
            providerRealId: providerRecord.id,
            name: providerRecord.name,
            protocol: providerRecord.protocol,
            baseUrl: providerRecord.baseUrl,
            shimStyle: providerRecord.shimStyle,
            apiKeyEncrypted: providerRecord.apiKeyEncrypted,
            providerCreatedAt: providerRecord.createdAt,
            providerUpdatedAt: providerRecord.updatedAt,
            mappingCreatedAt: mappingRecord.createdAt,
            mappingUpdatedAt: mappingRecord.updatedAt
          }
        : null
    };

    const service = new ProviderService(database as never);
    const runtime = service.resolveModel("qwen-max-cc");

    expect(runtime).not.toBeNull();
    expect(runtime?.resolvedModel).toBe("qwen-max-cc");
    expect(runtime?.mapping.alias).toBe("qwen-max");
    expect(runtime?.variant).toBe("claude_code");
  });
});
