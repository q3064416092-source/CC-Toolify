import fs from "node:fs";
import path from "node:path";
import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import { appConfig } from "../config.js";
import { ModelMappingRecord, ProviderRecord, RequestLogRecord } from "../types.js";

type ProviderRow = {
  id: string;
  name: string;
  protocol: "anthropic" | "openai";
  baseUrl: string;
  apiKeyEncrypted: string;
  createdAt: string;
  updatedAt: string;
};

type MappingRow = {
  id: string;
  alias: string;
  providerId: string;
  upstreamModel: string;
  supportsNativeTools: number;
  requiresXmlShim: number;
  supportsStreaming: number;
  createdAt: string;
  updatedAt: string;
};

const rowToObject = <T>(statement: { getColumnNames(): string[]; get(): unknown[] }): T => {
  const columns = statement.getColumnNames();
  const values = statement.get();
  return Object.fromEntries(columns.map((column, index) => [column, values[index]])) as T;
};

export class DatabaseService {
  private static sqlPromise: Promise<SqlJsStatic> | null = null;

  private readonly dbPath: string;
  readonly ready: Promise<void>;
  db!: Database;

  constructor() {
    fs.mkdirSync(appConfig.dataDir, { recursive: true });
    this.dbPath = path.join(appConfig.dataDir, "cc-toolify.sqlite");
    this.ready = this.initialize();
  }

  private static getSql(): Promise<SqlJsStatic> {
    if (!this.sqlPromise) {
      this.sqlPromise = initSqlJs({
        locateFile: (file) => path.join(process.cwd(), "node_modules", "sql.js", "dist", file)
      });
    }
    return this.sqlPromise;
  }

  private async initialize(): Promise<void> {
    const SQL = await DatabaseService.getSql();
    const existing = fs.existsSync(this.dbPath) ? fs.readFileSync(this.dbPath) : undefined;
    this.db = existing ? new SQL.Database(existing) : new SQL.Database();
    this.migrate();
    this.persist();
  }

  private migrate(): void {
    this.db.run(`
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
        updated_at TEXT NOT NULL
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

  private persist(): void {
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  listProviders(): ProviderRecord[] {
    const statement = this.db.prepare(`
      SELECT id, name, protocol, base_url AS baseUrl, api_key_encrypted AS apiKeyEncrypted, created_at AS createdAt, updated_at AS updatedAt
      FROM providers
      ORDER BY created_at DESC
    `);

    const rows: ProviderRecord[] = [];
    while (statement.step()) {
      rows.push(rowToObject<ProviderRecord>(statement));
    }
    statement.free();
    return rows;
  }

  listMappings(): ModelMappingRecord[] {
    const statement = this.db.prepare(`
      SELECT id, alias, provider_id AS providerId, upstream_model AS upstreamModel,
             supports_native_tools AS supportsNativeTools,
             requires_xml_shim AS requiresXmlShim,
             supports_streaming AS supportsStreaming,
             created_at AS createdAt, updated_at AS updatedAt
      FROM model_mappings
      ORDER BY created_at DESC
    `);

    const rows: ModelMappingRecord[] = [];
    while (statement.step()) {
      rows.push(rowToObject<ModelMappingRecord>(statement));
    }
    statement.free();
    return rows;
  }

  insertProvider(record: ProviderRecord): void {
    const statement = this.db.prepare(`
      INSERT INTO providers (id, name, protocol, base_url, api_key_encrypted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    statement.run([
      record.id,
      record.name,
      record.protocol,
      record.baseUrl,
      record.apiKeyEncrypted,
      record.createdAt,
      record.updatedAt
    ]);
    statement.free();
    this.persist();
  }

  insertMapping(record: ModelMappingRecord): void {
    const statement = this.db.prepare(`
      INSERT INTO model_mappings (
        id, alias, provider_id, upstream_model, supports_native_tools, requires_xml_shim, supports_streaming, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    statement.run([
      record.id,
      record.alias,
      record.providerId,
      record.upstreamModel,
      record.supportsNativeTools,
      record.requiresXmlShim,
      record.supportsStreaming,
      record.createdAt,
      record.updatedAt
    ]);
    statement.free();
    this.persist();
  }

  findModelWithProvider(alias: string): (MappingRow & ProviderRow & {
    mappingId: string;
    providerRealId: string;
    mappingCreatedAt: string;
    mappingUpdatedAt: string;
    providerCreatedAt: string;
    providerUpdatedAt: string;
  }) | null {
    const statement = this.db.prepare(`
      SELECT
        m.id AS mappingId,
        m.alias AS alias,
        m.provider_id AS providerId,
        m.upstream_model AS upstreamModel,
        m.supports_native_tools AS supportsNativeTools,
        m.requires_xml_shim AS requiresXmlShim,
        m.supports_streaming AS supportsStreaming,
        m.created_at AS mappingCreatedAt,
        m.updated_at AS mappingUpdatedAt,
        p.id AS providerRealId,
        p.name AS name,
        p.protocol AS protocol,
        p.base_url AS baseUrl,
        p.api_key_encrypted AS apiKeyEncrypted,
        p.created_at AS providerCreatedAt,
        p.updated_at AS providerUpdatedAt
      FROM model_mappings m
      JOIN providers p ON p.id = m.provider_id
      WHERE m.alias = ?
      LIMIT 1
    `);

    statement.bind([alias]);
    const row = statement.step()
      ? rowToObject<MappingRow & ProviderRow & {
          mappingId: string;
          providerRealId: string;
          mappingCreatedAt: string;
          mappingUpdatedAt: string;
          providerCreatedAt: string;
          providerUpdatedAt: string;
        }>(statement)
      : null;
    statement.free();
    return row;
  }

  logRequest(record: RequestLogRecord): void {
    const statement = this.db.prepare(`
      INSERT INTO request_logs (id, route, model, provider_name, status, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    statement.run([
      record.id,
      record.route,
      record.model,
      record.providerName,
      record.status,
      record.detail,
      record.createdAt
    ]);
    statement.free();
    this.persist();
  }

  cleanupLogs(cutoffIso: string): void {
    const statement = this.db.prepare(`DELETE FROM request_logs WHERE created_at < ?`);
    statement.run([cutoffIso]);
    statement.free();
    this.persist();
  }

  listRecentLogs(limit: number): RequestLogRecord[] {
    const statement = this.db.prepare(`
      SELECT id, route, model, provider_name AS providerName, status, detail, created_at AS createdAt
      FROM request_logs
      ORDER BY created_at DESC
      LIMIT ?
    `);
    statement.bind([limit]);
    const rows: RequestLogRecord[] = [];
    while (statement.step()) {
      rows.push(rowToObject<RequestLogRecord>(statement));
    }
    statement.free();
    return rows;
  }
}
