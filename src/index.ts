import path from "node:path";
import express, { NextFunction, Request, Response } from "express";
import { appConfig } from "./config.js";
import {
  decodeAnthropicRequest,
  encodeAnthropicResponse,
  encodeAnthropicStreamEvent
} from "./protocols/anthropic.js";
import {
  decodeOpenAiRequest,
  encodeOpenAiResponse,
  encodeOpenAiStreamEvents
} from "./protocols/openai.js";
import { clearSession, isAuthenticated, issueSession, verifyAdminPassword } from "./services/auth.js";
import { DatabaseService } from "./services/database.js";
import { OrchestratorService } from "./services/orchestrator.js";
import { ProviderService } from "./services/provider-service.js";
import { UpstreamClient } from "./services/upstream-client.js";
import { RequestLogRecord } from "./types.js";

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

const recordLog = (
  route: string,
  model: string,
  providerName: string | null,
  status: string,
  detail?: string
): void => {
  const entry: RequestLogRecord = {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    route,
    model,
    providerName,
    status,
    detail: detail ?? null,
    createdAt: new Date().toISOString()
  };
  database.logRequest(entry);
};

app.get("/health", (_request, response) => {
  const cutoff = new Date(Date.now() - appConfig.logRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  database.cleanupLogs(cutoff);
  response.json({ ok: true });
});

app.get("/admin", (_request, response) => {
  response.sendFile(path.resolve(process.cwd(), "public", "admin.html"));
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

app.get("/admin/api/bootstrap", adminOnly, (_request, response) => {
  const providers = providerService.listProviders().map((provider) => ({
    id: provider.id,
    name: provider.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt
  }));

  const logs = database.db
    .prepare(
      `SELECT id, route, model, provider_name as providerName, status, detail, created_at as createdAt
       FROM request_logs ORDER BY created_at DESC LIMIT 50`
    )
    .all();

  response.json({
    providers,
    mappings: providerService.listMappings(),
    logs
  });
});

app.post("/admin/api/providers", adminOnly, (request, response) => {
  const created = providerService.createProvider({
    name: String(request.body?.name ?? ""),
    protocol: request.body?.protocol === "anthropic" ? "anthropic" : "openai",
    baseUrl: String(request.body?.baseUrl ?? ""),
    apiKey: String(request.body?.apiKey ?? "")
  });

  response.status(201).json({
    id: created.id,
    name: created.name,
    protocol: created.protocol,
    baseUrl: created.baseUrl,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt
  });
});

app.post("/admin/api/mappings", adminOnly, (request, response) => {
  const created = providerService.createMapping({
    alias: String(request.body?.alias ?? ""),
    providerId: String(request.body?.providerId ?? ""),
    upstreamModel: String(request.body?.upstreamModel ?? ""),
    supportsNativeTools: Boolean(request.body?.supportsNativeTools),
    requiresXmlShim: Boolean(request.body?.requiresXmlShim ?? true),
    supportsStreaming: Boolean(request.body?.supportsStreaming ?? true)
  });

  response.status(201).json(created);
});

const handleProxyRequest = async (
  request: Request,
  response: Response,
  protocol: "anthropic" | "openai"
): Promise<void> => {
  const normalized = protocol === "anthropic"
    ? decodeAnthropicRequest(request.body as Record<string, unknown>)
    : decodeOpenAiRequest(request.body as Record<string, unknown>);

  const runtime = providerService.resolveModel(normalized.model);
  if (!runtime) {
    recordLog(request.path, normalized.model, null, "error", "Unknown model alias");
    response.status(404).json({ error: `Unknown model alias: ${normalized.model}` });
    return;
  }

  try {
    const final = await orchestrator.run(runtime, normalized);
    recordLog(request.path, normalized.model, runtime.provider.name, "ok");

    if (normalized.stream) {
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-cache");
      response.setHeader("Connection", "keep-alive");

      const events = protocol === "anthropic"
        ? encodeAnthropicStreamEvent(final, Date.now())
        : encodeOpenAiStreamEvents(final);

      for (const event of events) {
        response.write(event);
      }
      response.end();
      return;
    }

    const payload = protocol === "anthropic"
      ? encodeAnthropicResponse(final)
      : encodeOpenAiResponse(final);

    response.json(payload);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    recordLog(request.path, normalized.model, runtime.provider.name, "error", detail);
    response.status(502).json({ error: detail });
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
