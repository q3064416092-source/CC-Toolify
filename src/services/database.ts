import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { appConfig } from "../config.js";
import { RequestLogRecord } from "../types.js";

export class DatabaseService {
  readonly db: Database.Database;

  constructor() {
    fs.mkdirSync(appConfig.dataDir, { recursive: true });
    const dbPath = path.join(appConfig.dataDir, "cc-toolify.sqlite");
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        protocol TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key_encrypted TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS model_mappings (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        provider_id TEXT NOT NULL,
        upstream_model TEXT NOT NULL,
        supports_native_tools INTEGER NOT NULL DEFAULT 0,
        requires_xml_shim INTEGER NOT NULL DEFAULT 1,
        supports_streaming INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(provider_id) REFERENCES providers(id)
      );

      CREATE TABLE IF NOT EXISTS request_logs (
        id TEXT PRIMARY KEY,
        route TEXT NOT NULL,
        model TEXT NOT NULL,
        provider_name TEXT,
        status TEXT NOT NULL,
        detail TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  logRequest(record: RequestLogRecord): void {
    this.db
      .prepare(
        `INSERT INTO request_logs (id, route, model, provider_name, status, detail, created_at)
         VALUES (@id, @route, @model, @providerName, @status, @detail, @createdAt)`
      )
      .run(record);
  }

  cleanupLogs(cutoffIso: string): void {
    this.db.prepare(`DELETE FROM request_logs WHERE created_at < ?`).run(cutoffIso);
  }
}
