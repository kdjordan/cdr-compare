import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import path from "path";

const METRICS_DB_PATH = process.env.METRICS_DB_PATH || "./data/metrics.db";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  const dir = path.dirname(METRICS_DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(METRICS_DB_PATH);

  // Initialize schema if needed
  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_cdrs INTEGER NOT NULL DEFAULT 0,
      total_bytes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO metrics (id, total_cdrs, total_bytes) VALUES (1, 0, 0);
  `);

  return db;
}

export interface Metrics {
  totalCdrs: number;
  totalBytes: number;
  formattedBytes: string;
  updatedAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function incrementMetrics(cdrs: number, bytes: number): void {
  const database = getDb();
  const stmt = database.prepare(`
    UPDATE metrics
    SET total_cdrs = total_cdrs + ?,
        total_bytes = total_bytes + ?,
        updated_at = datetime('now')
    WHERE id = 1
  `);
  stmt.run(cdrs, bytes);
}

export function getMetrics(): Metrics {
  const database = getDb();
  const row = database.prepare("SELECT total_cdrs, total_bytes, updated_at FROM metrics WHERE id = 1").get() as {
    total_cdrs: number;
    total_bytes: number;
    updated_at: string;
  };

  return {
    totalCdrs: row.total_cdrs,
    totalBytes: row.total_bytes,
    formattedBytes: formatBytes(row.total_bytes),
    updatedAt: row.updated_at,
  };
}
