import crypto from "node:crypto";
import path from "node:path";
import express, { NextFunction, Request, Response } from "express";
import { appConfig } from "./config.js";
import {
  decodeAnthropicRequest,
  encodeAnthropicResponse,
  encodeAnthropicStreamStart,
  encodeAnthropicStreamStop,
  encodeAnthropicTextBlockStart,
  encodeAnthropicTextBlockStop,
  encodeAnthropicTextDelta,
  encodeAnthropicToolCallBlock
} from "./protocols/anthropic.js";
import {
  decodeOpenAiRequest,
  encodeOpenAiResponse,
  encodeOpenAiStreamRoleChunk,
  encodeOpenAiStreamStop,
  encodeOpenAiTextDelta,
  encodeOpenAiToolCallChunk
} from "./protocols/openai.js";
import { clearSession, isAuthenticated, issueSession, verifyAdminPassword } from "./services/auth.js";
import { DatabaseService } from "./services/database.js";
import { OrchestratorService } from "./services/orchestrator.js";
import { ProviderService, ProviderServiceError } from "./services/provider-service.js";
import { UpstreamClient } from "./services/upstream-client.js";
import { ExternalProtocol, ModelMappingRecord, ProviderRecord, RequestLogRecord } from "./types.js";

const app = express();
const database = new DatabaseService();
const providerService = new ProviderService(database);
const orchestrator = new OrchestratorService(new UpstreamClient());

app.use(express.json({ limit: "2mb" }));
app.use("/assets", express.static(path.resolve(process.cwd(), "public")));

const adminOnly = (request: Request, response: Response, next: NextFunction): void => {
  if (!isAuthenticated(request)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

const toPublicProvider = (provider: ProviderRecord) => ({
  id: provider.id,
  name: provider.name,
  protocol: provider.protocol,
  baseUrl: provider.baseUrl,
  shimStyle: provider.shimStyle,
  createdAt: provider.createdAt,
  updatedAt: provider.updatedAt
});

const toBootstrapMapping = (
  mapping: ModelMappingRecord,
  providers: ProviderRecord[]
) => ({
  ...mapping,
  providerName: providers.find((provider) => provider.id === mapping.providerId)?.name ?? null
});

const toModelCard = (id: string, created: number) => ({
  id,
  object: "model",
  created,
  owned_by: "cc-toolify"
});

const createRequestLog = (
  requestId: string,
  route: string,
  clientProtocol: ExternalProtocol,
  model: string,
  providerName: string | null,
  upstreamModel: string | null
): RequestLogRecord => ({
  id: crypto.randomUUID(),
  requestId,
  route,
  clientProtocol,
  model,
  upstreamModel,
  providerName,
  status: "started",
  durationMs: null,
  detail: null,
  createdAt: new Date().toISOString()
});

const completeRequestLog = (
  requestId: string,
  status: "ok" | "error",
  startedAt: number,
  detail?: string | null,
  providerName?: string | null,
  upstreamModel?: string | null
): void => {
  database.updateRequestLogByRequestId(requestId, {
    status,
    durationMs: Date.now() - startedAt,
    detail: detail ?? null,
    providerName: providerName ?? null,
    upstreamModel: upstreamModel ?? null
  });
};

const withAdminErrorHandling = async (
  response: Response,
  handler: () => Promise<void>
): Promise<void> => {
  try {
    await handler();
  } catch (error) {
    if (error instanceof ProviderServiceError) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }
    const detail = error instanceof Error ? error.message : "Unknown error";
    response.status(500).json({ error: detail });
  }
};

app.get("/health", async (_request, response) => {
  await database.ready;
  const cutoff = new Date(Date.now() - appConfig.logRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  database.cleanupLogs(cutoff);
  response.json({ ok: true });
});

app.get("/v1/models", async (_request, response) => {
  await database.ready;
  const mappings = providerService.listMappings();
  const created = Math.floor(Date.now() / 1000);
  const data = mappings.flatMap((mapping) => ([
    toModelCard(mapping.alias, created),
    toModelCard(`${mapping.alias}${ProviderService.CLAUDE_CODE_SUFFIX}`, created)
  ]));

  response.json({
    object: "list",
    data
  });
});

// Serve static files from web/dist (new React frontend)
app.use("/admin", express.static(path.resolve(process.cwd(), "web", "dist")));

// Fallback to index.html for React Router
app.get("/admin/*", (_request, response) => {
  response.sendFile(path.resolve(process.cwd(), "web", "dist", "index.html"));
});

app.post("/admin/login", (request, response) => {
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  if (!verifyAdminPassword(password)) {
    response.status(401).json({ error: "Invalid password" });
    return;
  }
  issueSession(response);
  response.json({ ok: true });
});

app.post("/admin/logout", (_request, response) => {
  clearSession(response);
  response.json({ ok: true });
});

app.get("/admin/api/bootstrap", adminOnly, async (_request, response) => {
  await database.ready;
  const providers = providerService.listProviders();
  const mappings = providerService.listMappings();

  response.json({
    providers: providers.map(toPublicProvider),
    mappings: mappings.map((mapping) => toBootstrapMapping(mapping, providers)),
    logs: database.listRecentLogs(100)
  });
});

app.post("/admin/api/providers", adminOnly, async (request, response) => {
  await withAdminErrorHandling(response, async () => {
    await database.ready;
    const created = providerService.createProvider({
      name: String(request.body?.name ?? ""),
      protocol: request.body?.protocol === "anthropic" ? "anthropic" : "openai",
      baseUrl: String(request.body?.baseUrl ?? ""),
      shimStyle: request.body?.shimStyle === "private_v1" ? "private_v1" : "legacy",
      apiKey: String(request.body?.apiKey ?? "")
    });

    response.status(201).json(toPublicProvider(created));
  });
});

app.put("/admin/api/providers/:providerId", adminOnly, async (request, response) => {
  await withAdminErrorHandling(response, async () => {
    await database.ready;
    const updated = providerService.updateProvider(request.params.providerId, {
      name: String(request.body?.name ?? ""),
      protocol: request.body?.protocol === "anthropic" ? "anthropic" : "openai",
      baseUrl: String(request.body?.baseUrl ?? ""),
      shimStyle: request.body?.shimStyle === "private_v1" ? "private_v1" : "legacy",
      apiKey: typeof request.body?.apiKey === "string" ? request.body.apiKey : undefined
    });

    response.json(toPublicProvider(updated));
  });
});

app.delete("/admin/api/providers/:providerId", adminOnly, async (request, response) => {
  await withAdminErrorHandling(response, async () => {
    await database.ready;
    providerService.deleteProvider(request.params.providerId);
    response.json({ ok: true });
  });
});

app.post("/admin/api/mappings", adminOnly, async (request, response) => {
  await withAdminErrorHandling(response, async () => {
    await database.ready;
    const created = providerService.createMapping({
      alias: String(request.body?.alias ?? ""),
      providerId: String(request.body?.providerId ?? ""),
      upstreamModel: String(request.body?.upstreamModel ?? ""),
      supportsNativeTools: false,
      requiresXmlShim: true,
      supportsStreaming: Boolean(request.body?.supportsStreaming)
    });

    response.status(201).json(created);
  });
});

app.put("/admin/api/mappings/:mappingId", adminOnly, async (request, response) => {
  await withAdminErrorHandling(response, async () => {
    await database.ready;
    const updated = providerService.updateMapping(request.params.mappingId, {
      alias: String(request.body?.alias ?? ""),
      providerId: String(request.body?.providerId ?? ""),
      upstreamModel: String(request.body?.upstreamModel ?? ""),
      supportsNativeTools: false,
      requiresXmlShim: true,
      supportsStreaming: Boolean(request.body?.supportsStreaming)
    });

    response.json(updated);
  });
});

app.delete("/admin/api/mappings/:mappingId", adminOnly, async (request, response) => {
  await withAdminErrorHandling(response, async () => {
    await database.ready;
    providerService.deleteMapping(request.params.mappingId);
    response.json({ ok: true });
  });
});

app.post("/admin/api/providers/:providerId/test", adminOnly, async (request, response) => {
  await withAdminErrorHandling(response, async () => {
    await database.ready;
    const provider = providerService.getProvider(request.params.providerId);
    if (!provider) {
      response.status(404).json({ error: "Upstream provider not found" });
      return;
    }

    const updated = providerService.updateProvider(provider.id, {
      name: provider.name,
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      shimStyle: provider.shimStyle,
      apiKey: typeof request.body?.apiKey === "string" && request.body.apiKey.trim()
        ? request.body.apiKey
        : undefined
    });

    response.json({
      ok: true,
      provider: toPublicProvider(updated)
    });
  });
});

app.post("/admin/api/mappings/:mappingId/test", adminOnly, async (request, response) => {
  await withAdminErrorHandling(response, async () => {
    await database.ready;
    const runtime = providerService.resolveMappingById(request.params.mappingId);
    if (!runtime) {
      response.status(404).json({ error: "Model mapping not found" });
      return;
    }

    const testProtocol = runtime.provider.protocol;
    const testRequest = testProtocol === "anthropic"
      ? {
          model: runtime.mapping.alias,
          stream: false,
          max_tokens: 128,
          messages: [{ role: "user", content: "Reply with the word pong." }]
        }
      : {
          model: runtime.mapping.alias,
          stream: false,
          max_tokens: 128,
          messages: [{ role: "user", content: "Reply with the word pong." }]
        };

    const fakeRequest = {
      path: testProtocol === "anthropic" ? "/v1/messages" : "/v1/chat/completions",
      body: testRequest
    } as Request;

    const result: { statusCode?: number; payload?: unknown } = {};
    const fakeResponse = {
      headersSent: false,
      status(code: number) {
        result.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        result.payload = payload;
        return this;
      },
      setHeader() {
        return this;
      },
      end() {
        return this;
      }
    } as unknown as Response;

    await handleProxyRequest(fakeRequest, fakeResponse, testProtocol);

    if (result.statusCode && result.statusCode >= 400) {
      response.status(result.statusCode).json(result.payload);
      return;
    }

    response.json({
      ok: true,
      providerName: runtime.provider.name,
      upstreamModel: runtime.mapping.upstreamModel,
      result: result.payload
    });
  });
});

const handleProxyRequest = async (
  request: Request,
  response: Response,
  protocol: ExternalProtocol
): Promise<void> => {
  await database.ready;
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const normalized = protocol === "anthropic"
      ? decodeAnthropicRequest(request.body as Record<string, unknown>)
      : decodeOpenAiRequest(request.body as Record<string, unknown>);

    const runtime = providerService.resolveModel(normalized.model);
    if (!runtime) {
      database.insertRequestLog(
        createRequestLog(requestId, request.path, protocol, normalized.model, null, null)
      );
      completeRequestLog(requestId, "error", startedAt, "Unknown model alias");
      response.status(404).json({ error: `Unknown model alias: ${normalized.model}` });
      return;
    }

    database.insertRequestLog(
      createRequestLog(
        requestId,
        request.path,
        protocol,
        runtime.resolvedModel,
        runtime.provider.name,
        runtime.mapping.upstreamModel
      )
    );

    if (normalized.stream) {
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-cache");
      response.setHeader("Connection", "keep-alive");
    }

    const run = normalized.stream
      ? await orchestrator.runStreaming(runtime, normalized)
      : null;

    if (normalized.stream && run) {
      if (protocol === "anthropic") {
        response.write(encodeAnthropicStreamStart(Date.now()));
        response.write(encodeAnthropicTextBlockStart());
      } else {
        response.write(encodeOpenAiStreamRoleChunk());
      }

      for await (const chunk of run.stream) {
        if (!chunk.textDelta) {
          continue;
        }

        response.write(
          protocol === "anthropic"
            ? encodeAnthropicTextDelta(chunk.textDelta)
            : encodeOpenAiTextDelta(chunk.textDelta)
        );
      }

      const final = await run.finalized;

      if (protocol === "anthropic") {
        response.write(encodeAnthropicTextBlockStop());
        final.output.toolCalls.forEach((toolCall, index) => {
          for (const event of encodeAnthropicToolCallBlock(toolCall, index + 1)) {
            response.write(event);
          }
        });
        for (const event of encodeAnthropicStreamStop(
          final.output.toolCalls.length > 0 ? "tool_use" : final.stopReason
        )) {
          response.write(event);
        }
      } else {
        if (final.output.toolCalls.length > 0) {
          response.write(encodeOpenAiToolCallChunk(final.output.toolCalls));
          for (const event of encodeOpenAiStreamStop("tool_calls")) {
            response.write(event);
          }
        } else {
          for (const event of encodeOpenAiStreamStop("stop")) {
            response.write(event);
          }
        }
      }

      response.end();
      completeRequestLog(
        requestId,
        "ok",
        startedAt,
        null,
        runtime.provider.name,
        runtime.mapping.upstreamModel
      );
      return;
    }

    const final = await orchestrator.run(runtime, normalized);
    const payload = protocol === "anthropic"
      ? encodeAnthropicResponse(final)
      : encodeOpenAiResponse(final);

    response.json(payload);
    completeRequestLog(
      requestId,
      "ok",
      startedAt,
      null,
      runtime.provider.name,
      runtime.mapping.upstreamModel
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    completeRequestLog(requestId, "error", startedAt, detail);

    if (!response.headersSent) {
      response.status(502).json({ error: detail });
    } else {
      response.end();
    }
  }
};

app.post("/v1/messages", async (request, response) => {
  await handleProxyRequest(request, response, "anthropic");
});

app.post("/v1/chat/completions", async (request, response) => {
  await handleProxyRequest(request, response, "openai");
});

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
  response.status(500).json({ error: error.message });
});

app.listen(appConfig.port, appConfig.host, () => {
  console.log(`CC-Toolify listening on http://${appConfig.host}:${appConfig.port}`);
});
