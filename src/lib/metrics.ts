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

    -- Job lock table for cross-container concurrency control
    CREATE TABLE IF NOT EXISTS job_lock (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      job_id TEXT,
      started_at INTEGER,
      is_locked INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO job_lock (id, is_locked) VALUES (1, 0);
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

// ============================================
// JOB LOCK - Cross-container concurrency control
// ============================================

const JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max per job

export interface LockResult {
  acquired: boolean;
  reason?: "busy" | "error";
  currentJobId?: string;
  startedAt?: number;
}

/**
 * Try to acquire the job lock atomically using SQLite.
 * Uses EXCLUSIVE transaction to prevent any race conditions.
 * Returns true if lock was acquired, false if another job is running.
 */
export function tryAcquireJobLock(jobId: string): LockResult {
  // IMPORTANT: Open a FRESH database connection for lock operations
  // This ensures we see the latest state, not a cached view
  const lockDb = new Database(METRICS_DB_PATH);

  try {
    const now = Date.now();

    // Use an EXCLUSIVE transaction to ensure complete isolation
    // This blocks ALL other database access until we're done
    const acquireLock = lockDb.transaction(() => {
      // Clear stale lock if exists
      lockDb.prepare(`
        UPDATE job_lock
        SET is_locked = 0, job_id = NULL, started_at = NULL
        WHERE id = 1 AND is_locked = 1 AND (? - started_at) > ?
      `).run(now, JOB_TIMEOUT_MS);

      // Try to acquire - only succeeds if is_locked = 0
      const result = lockDb.prepare(`
        UPDATE job_lock
        SET is_locked = 1, job_id = ?, started_at = ?
        WHERE id = 1 AND is_locked = 0
      `).run(jobId, now);

      return result.changes > 0;
    });

    // Execute with EXCLUSIVE isolation
    const acquired = acquireLock.exclusive();

    if (acquired) {
      console.log(`[DB Lock] Job ${jobId} ACQUIRED lock`);
      lockDb.close();
      return { acquired: true };
    }

    // Lock is held by another job - get details
    const current = lockDb.prepare(`
      SELECT job_id, started_at FROM job_lock WHERE id = 1
    `).get() as { job_id: string; started_at: number } | undefined;

    console.log(`[DB Lock] Job ${jobId} REJECTED - lock held by ${current?.job_id}`);
    lockDb.close();
    return {
      acquired: false,
      reason: "busy",
      currentJobId: current?.job_id,
      startedAt: current?.started_at
    };
  } catch (error) {
    console.error(`[DB Lock] Error acquiring lock:`, error);
    lockDb.close();
    return { acquired: false, reason: "error" };
  }
}

/**
 * Release the job lock. Only releases if the lock belongs to this job.
 */
export function releaseJobLock(jobId: string): void {
  // Use fresh connection to ensure we see/modify the actual state
  const lockDb = new Database(METRICS_DB_PATH);

  try {
    const result = lockDb.prepare(`
      UPDATE job_lock
      SET is_locked = 0, job_id = NULL, started_at = NULL
      WHERE id = 1 AND job_id = ?
    `).run(jobId);

    if (result.changes > 0) {
      console.log(`[DB Lock] Job ${jobId} RELEASED lock`);
    } else {
      console.log(`[DB Lock] Job ${jobId} did not hold the lock`);
    }
  } catch (error) {
    console.error(`[DB Lock] Error releasing lock:`, error);
  } finally {
    lockDb.close();
  }
}

/**
 * Check if the job lock is currently held (for status endpoint).
 */
export function isJobLockHeld(): boolean {
  // Use fresh connection to see current state
  const lockDb = new Database(METRICS_DB_PATH);

  try {
    const now = Date.now();

    const row = lockDb.prepare(`
      SELECT is_locked, started_at FROM job_lock WHERE id = 1
    `).get() as { is_locked: number; started_at: number | null } | undefined;

    if (!row || !row.is_locked) {
      return false;
    }

    // Check if lock is stale
    if (row.started_at && (now - row.started_at) > JOB_TIMEOUT_MS) {
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[DB Lock] Error checking lock:`, error);
    return false;
  } finally {
    lockDb.close();
  }
}
