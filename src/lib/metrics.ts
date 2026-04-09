import Database from "better-sqlite3";
import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import path from "path";

// CRITICAL: Use absolute path to ensure all workers/processes use the SAME database file
// In Docker/Coolify, the app runs from /app, and /app/data is the persistent volume
const METRICS_DB_PATH = process.env.METRICS_DB_PATH || path.resolve(process.cwd(), "data", "metrics.db");

// SIMPLE FILE-BASED LOCK - more reliable than SQLite for cross-container locking
// SQLite locks work within a single container but can have issues during rolling updates
const LOCK_FILE_PATH = path.resolve(process.cwd(), "data", ".job.lock");

console.log(`[Metrics] Database path: ${METRICS_DB_PATH}`);
console.log(`[Metrics] Lock file path: ${LOCK_FILE_PATH}`);

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
// JOB LOCK - Simple file-based cross-container mutex
// ============================================
//
// We use a simple lock FILE instead of SQLite because:
// 1. File creation with 'wx' flag is truly atomic across processes
// 2. Works reliably during Coolify rolling updates (both containers share the volume)
// 3. No complex transaction isolation issues
// 4. The lock file is on the persistent volume (/app/data)

const JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes - balances slow uploads vs abandoned sessions

interface LockFileContent {
  jobId: string;
  startedAt: number;
  pid: number;
}

export interface LockResult {
  acquired: boolean;
  reason?: "busy" | "error";
  currentJobId?: string;
  startedAt?: number;
}

/**
 * Try to acquire the job lock using atomic file creation.
 * The 'wx' flag creates the file ONLY if it doesn't exist - atomic across processes.
 */
export function tryAcquireJobLock(jobId: string): LockResult {
  const now = Date.now();

  try {
    // First check if there's a stale lock to clean up
    if (existsSync(LOCK_FILE_PATH)) {
      try {
        const content = readFileSync(LOCK_FILE_PATH, "utf-8");
        const lockInfo: LockFileContent = JSON.parse(content);
        const elapsed = now - lockInfo.startedAt;

        if (elapsed > JOB_TIMEOUT_MS) {
          // Lock is stale - remove it
          console.log(`[File Lock] Removing stale lock (${Math.round(elapsed / 1000)}s old, job ${lockInfo.jobId})`);
          unlinkSync(LOCK_FILE_PATH);
        } else {
          // Lock is valid - reject
          console.log(`[File Lock] Job ${jobId} REJECTED - lock held by ${lockInfo.jobId} (${Math.round(elapsed / 1000)}s ago)`);
          return {
            acquired: false,
            reason: "busy",
            currentJobId: lockInfo.jobId,
            startedAt: lockInfo.startedAt
          };
        }
      } catch (parseErr) {
        // Lock file is corrupted - remove it
        console.log(`[File Lock] Removing corrupted lock file`);
        try { unlinkSync(LOCK_FILE_PATH); } catch { /* ignore */ }
      }
    }

    // Try to create lock file atomically
    // 'wx' flag = write + exclusive (fails if file exists)
    const lockContent: LockFileContent = {
      jobId,
      startedAt: now,
      pid: process.pid
    };

    writeFileSync(LOCK_FILE_PATH, JSON.stringify(lockContent), { flag: "wx" });
    console.log(`[File Lock] Job ${jobId} ACQUIRED lock (pid ${process.pid})`);
    return { acquired: true };

  } catch (error: unknown) {
    // EEXIST means another process created the file between our check and write
    // This is the atomic race condition protection working correctly
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      // Read who has the lock
      try {
        const content = readFileSync(LOCK_FILE_PATH, "utf-8");
        const lockInfo: LockFileContent = JSON.parse(content);
        console.log(`[File Lock] Job ${jobId} REJECTED (race) - lock held by ${lockInfo.jobId}`);
        return {
          acquired: false,
          reason: "busy",
          currentJobId: lockInfo.jobId,
          startedAt: lockInfo.startedAt
        };
      } catch {
        console.log(`[File Lock] Job ${jobId} REJECTED - lock exists but unreadable`);
        return { acquired: false, reason: "busy" };
      }
    }

    console.error(`[File Lock] Error acquiring lock:`, error);
    return { acquired: false, reason: "error" };
  }
}

/**
 * Release the job lock. Only releases if the lock belongs to this job.
 */
export function releaseJobLock(jobId: string): void {
  try {
    if (!existsSync(LOCK_FILE_PATH)) {
      console.log(`[File Lock] No lock file to release`);
      return;
    }

    const content = readFileSync(LOCK_FILE_PATH, "utf-8");
    const lockInfo: LockFileContent = JSON.parse(content);

    if (lockInfo.jobId === jobId) {
      unlinkSync(LOCK_FILE_PATH);
      console.log(`[File Lock] Job ${jobId} RELEASED lock`);
    } else {
      console.log(`[File Lock] Job ${jobId} cannot release - lock held by ${lockInfo.jobId}`);
    }
  } catch (error) {
    console.error(`[File Lock] Error releasing lock:`, error);
    // Try to remove anyway to avoid stuck state
    try { unlinkSync(LOCK_FILE_PATH); } catch { /* ignore */ }
  }
}

/**
 * Refresh the lock timestamp to prevent stale detection during long uploads.
 * Call this when the POST request starts processing (upload complete).
 */
export function refreshJobLock(jobId: string): boolean {
  try {
    if (!existsSync(LOCK_FILE_PATH)) {
      return false;
    }

    const content = readFileSync(LOCK_FILE_PATH, "utf-8");
    const lockInfo: LockFileContent = JSON.parse(content);

    // Only refresh if this job owns the lock
    if (lockInfo.jobId !== jobId) {
      console.log(`[File Lock] Cannot refresh - lock held by ${lockInfo.jobId}, not ${jobId}`);
      return false;
    }

    // Update the timestamp
    const updatedLock: LockFileContent = {
      ...lockInfo,
      startedAt: Date.now(),
    };
    writeFileSync(LOCK_FILE_PATH, JSON.stringify(updatedLock));
    console.log(`[File Lock] Job ${jobId} refreshed lock timestamp`);
    return true;
  } catch (error) {
    console.error(`[File Lock] Error refreshing lock:`, error);
    return false;
  }
}

/**
 * Check if the job lock is currently held (for status endpoint).
 */
export function isJobLockHeld(): boolean {
  try {
    if (!existsSync(LOCK_FILE_PATH)) {
      return false;
    }

    const content = readFileSync(LOCK_FILE_PATH, "utf-8");
    const lockInfo: LockFileContent = JSON.parse(content);
    const elapsed = Date.now() - lockInfo.startedAt;

    // Lock is stale if older than timeout
    if (elapsed > JOB_TIMEOUT_MS) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
