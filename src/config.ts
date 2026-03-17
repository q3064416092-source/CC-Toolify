import path from "node:path";

const resolveNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const appConfig = {
  host: process.env.HOST ?? "0.0.0.0",
  port: resolveNumber(process.env.PORT, 3000),
  dataDir: path.resolve(process.cwd(), process.env.DATA_DIR ?? "./data"),
  adminPassword: process.env.ADMIN_PASSWORD ?? "change-me",
  appSecret: process.env.APP_SECRET ?? "replace-with-32-byte-secret",
  requestTimeoutMs: resolveNumber(process.env.REQUEST_TIMEOUT_MS, 120000),
  logRetentionDays: resolveNumber(process.env.LOG_RETENTION_DAYS, 7),
  maxToolCalls: resolveNumber(process.env.MAX_TOOL_CALLS, 8)
};
