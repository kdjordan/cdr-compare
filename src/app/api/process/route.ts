import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { incrementMetrics } from "@/lib/metrics";
import { v4 as uuidv4 } from "uuid";
import { unlink, writeFile, readFile } from "fs/promises";
import path from "path";
import Papa from "papaparse";
import JSZip from "jszip";
import { exec } from "child_process";
import { promisify } from "util";
import { createGunzip } from "zlib";
import { Readable } from "stream";

const execAsync = promisify(exec);

// Concurrency control - limit simultaneous processing jobs
const MAX_CONCURRENT_JOBS = 1;
let activeJobs = 0;
let lastJobStartTime = 0;
const JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max per job
const waitingQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

// Safety: reset stuck jobs (in case a job crashes without releasing)
function checkAndResetStuckJobs() {
  if (activeJobs > 0 && lastJobStartTime > 0) {
    const elapsed = Date.now() - lastJobStartTime;
    if (elapsed > JOB_TIMEOUT_MS) {
      console.log(`[Concurrency] Resetting stuck jobs. activeJobs was ${activeJobs}, elapsed ${elapsed}ms`);
      activeJobs = 0;
      lastJobStartTime = 0;
    }
  }
}

async function acquireSlot(timeoutMs: number = 30000): Promise<{ acquired: boolean; queuePosition?: number }> {
  // Check for stuck jobs first
  checkAndResetStuckJobs();

  if (activeJobs < MAX_CONCURRENT_JOBS) {
    activeJobs++;
    lastJobStartTime = Date.now();
    return { acquired: true };
  }

  // Queue position for feedback
  const queuePosition = waitingQueue.length + 1;

  // Wait for a slot with timeout
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      // Remove from queue on timeout
      const idx = waitingQueue.findIndex(w => w.resolve === onSlotAvailable);
      if (idx !== -1) waitingQueue.splice(idx, 1);
      resolve({ acquired: false, queuePosition });
    }, timeoutMs);

    const onSlotAvailable = () => {
      clearTimeout(timeout);
      activeJobs++;
      resolve({ acquired: true });
    };

    waitingQueue.push({
      resolve: onSlotAvailable,
      reject: () => {
        clearTimeout(timeout);
        resolve({ acquired: false, queuePosition });
      }
    });
  });
}

function releaseSlot() {
  activeJobs--;
  // Wake up next waiting request
  if (waitingQueue.length > 0 && activeJobs < MAX_CONCURRENT_JOBS) {
    const next = waitingQueue.shift();
    next?.resolve();
  }
}

// Types
interface ColumnMapping {
  a_number: string | null;
  b_number: string | null;
  seize_time: string | null;
  seize_time_alt?: string | null;    // Secondary column for split date/time
  answer_time?: string | null;
  answer_time_alt?: string | null;   // Secondary column for split date/time
  end_time?: string | null;
  end_time_alt?: string | null;      // Secondary column for split date/time
  billed_duration: string | null;
  rate?: string | null;
  lrn: string | null;
}

interface FileSettings {
  durationUnit: "seconds" | "milliseconds";
  ratePrecision: number;
  timezone: string;
}

// Timezone offsets in hours from UTC
const TIMEZONE_OFFSETS: Record<string, number> = {
  "GMT-12": -12, "GMT-11": -11, "GMT-10": -10, "GMT-9": -9, "GMT-8": -8, "GMT-7": -7,
  "GMT-6": -6, "GMT-5": -5, "GMT-4": -4, "GMT-3": -3, "GMT-2": -2, "GMT-1": -1,
  "GMT+0": 0, "GMT+1": 1, "GMT+2": 2, "GMT+3": 3, "GMT+4": 4, "GMT+5": 5, "GMT+5:30": 5.5,
  "GMT+6": 6, "GMT+7": 7, "GMT+8": 8, "GMT+9": 9, "GMT+9:30": 9.5, "GMT+10": 10,
  "GMT+11": 11, "GMT+12": 12, "GMT+13": 13, "GMT+14": 14,
};

// Phone number normalization
function normalizePhoneNumber(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";

  // Convert to string and remove all non-digits
  let digits = String(input).replace(/\D/g, "");

  // Handle common prefixes
  if (digits.startsWith("1") && digits.length === 11) {
    digits = digits.slice(1);
  }
  if (digits.startsWith("01") && digits.length === 12) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("001") && digits.length === 13) {
    digits = digits.slice(3);
  }

  return digits;
}

// Timestamp normalization - convert various formats to Unix timestamp
// timezoneOffsetHours: offset from UTC in hours (e.g., -5 for EST, -8 for PST)
function normalizeTimestamp(
  input: string | number | Date | null | undefined,
  timezoneOffsetHours: number = 0
): number | null {
  if (input === null || input === undefined || input === "") return null;

  try {
    let timestamp: number | null = null;

    if (typeof input === "number") {
      // Excel serial date (days since 1900-01-01)
      if (input > 0 && input < 100000) {
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + input * 86400000);
        timestamp = Math.floor(date.getTime() / 1000);
      } else {
        // Unix timestamp - check if seconds or milliseconds
        timestamp = input > 10000000000 ? Math.floor(input / 1000) : input;
      }
    } else {
      const strInput = String(input);

      // Handle format like "11/7/2025 16:55" - treat as local time (will apply offset)
      // This format is M/D/YYYY HH:mm (US format without timezone)
      const usDateTimeMatch = strInput.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (usDateTimeMatch) {
        const [, month, day, year, hour, minute, second = "0"] = usDateTimeMatch;
        // Create ISO format string - treat as local time (no Z suffix)
        const isoStr = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}`;
        const date = new Date(isoStr);
        if (!isNaN(date.getTime())) {
          timestamp = Math.floor(date.getTime() / 1000);
        }
      }

      // If string already has timezone indicator, parse directly and skip offset adjustment
      if (timestamp === null && (strInput.includes("+") || strInput.includes("Z") || strInput.includes(" UTC") || strInput.includes(" GMT"))) {
        const date = new Date(strInput);
        if (!isNaN(date.getTime())) {
          // Already has timezone, return directly without offset adjustment
          return Math.floor(date.getTime() / 1000);
        }
      }

      // For other formats, try standard parsing
      if (timestamp === null) {
        const date = new Date(input);
        if (!isNaN(date.getTime())) {
          timestamp = Math.floor(date.getTime() / 1000);
        }
      }
    }

    if (timestamp === null) return null;

    // Apply timezone offset to convert to UTC
    // If data is in PST (-8), we add 8 hours to get UTC
    // timezoneOffsetHours is already negative for west of UTC, so we subtract it
    const offsetSeconds = timezoneOffsetHours * 3600;
    return timestamp - offsetSeconds;
  } catch {
    return null;
  }
}

// Helper to get timestamp from row with optional alt column
function getTimestampFromRow(
  row: Record<string, unknown>,
  primaryCol: string | null,
  altCol: string | null | undefined,
  timezoneOffsetHours: number
): number | null {
  if (!primaryCol) return null;

  let value = row[primaryCol];

  // If alt column exists, concatenate with primary
  if (altCol && row[altCol]) {
    value = `${value} ${row[altCol]}`;
  }

  return normalizeTimestamp(value as string | number | Date | null, timezoneOffsetHours);
}

// Duration normalization
function normalizeDuration(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === "") return 0;

  const num = typeof input === "number" ? input : parseFloat(String(input));
  return isNaN(num) ? 0 : Math.round(num);
}

// Rate normalization
function normalizeRate(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === "") return 0;

  const num = typeof input === "number" ? input : parseFloat(String(input));
  return isNaN(num) ? 0 : num;
}

// Calculate billing increments (6-second increments)
// VoIP billing rounds up to the nearest 6-second increment
function calculateBillingIncrements(durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return Math.ceil(durationSeconds / 6);
}

// Calculate call cost using 6-second increment billing
// Rate is per-minute, so each 6-second increment = rate / 10
function calculateCallCost(durationSeconds: number, ratePerMinute: number): number {
  const increments = calculateBillingIncrements(durationSeconds);
  const costPerIncrement = ratePerMinute / 10; // 10 increments per minute
  return increments * costPerIncrement;
}

// Convert XLSX to CSV using xlsx2csv (Python-based, memory efficient)
async function convertXlsxToCsv(xlsxPath: string, csvPath: string): Promise<void> {
  try {
    // xlsx2csv converts Excel files to CSV efficiently without loading entire file into memory
    await execAsync(`xlsx2csv "${xlsxPath}" "${csvPath}"`, {
      timeout: 300000, // 5 minute timeout for large files
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for stderr/stdout
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to convert XLSX to CSV: ${errMsg}`);
  }
}

// Parse CSV file (memory efficient with PapaParse)
async function parseCsvFile(filePath: string): Promise<Record<string, unknown>[]> {
  const buffer = await readFile(filePath);
  const text = buffer.toString("utf-8");
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });
  return result.data as Record<string, unknown>[];
}

// Maximum decompressed size (500MB)
const MAX_DECOMPRESSED_SIZE = 500 * 1024 * 1024;

// Parse file based on extension
async function parseFile(filePath: string, fileName: string): Promise<Record<string, unknown>[]> {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === ".csv") {
    return parseCsvFile(filePath);
  }

  if (ext === ".xlsx" || ext === ".xls") {
    // Convert XLSX to CSV first (much more memory efficient)
    const csvPath = filePath + ".converted.csv";
    console.log(`Converting XLSX to CSV: ${fileName}`);

    try {
      await convertXlsxToCsv(filePath, csvPath);
      console.log(`Conversion complete, parsing CSV...`);
      const data = await parseCsvFile(csvPath);
      return data;
    } finally {
      // Clean up converted CSV
      await unlink(csvPath).catch(() => {});
    }
  }

  if (ext === ".zip") {
    const buffer = await readFile(filePath);
    const zip = await JSZip.loadAsync(buffer);

    // Find supported files in the ZIP (CSV or XLSX)
    const supportedExtensions = [".csv", ".xlsx", ".xls"];
    const entries = Object.keys(zip.files).filter((name) => {
      const lower = name.toLowerCase();
      // Skip directories and macOS metadata files
      if (zip.files[name].dir || lower.includes("__macosx") || lower.startsWith(".")) {
        return false;
      }
      return supportedExtensions.some((e) => lower.endsWith(e));
    });

    if (entries.length === 0) {
      throw new Error("No CSV or XLSX files found in ZIP archive");
    }

    // Sort to prefer CSV, then XLSX
    entries.sort((a, b) => {
      const aIsCSV = a.toLowerCase().endsWith(".csv");
      const bIsCSV = b.toLowerCase().endsWith(".csv");
      if (aIsCSV && !bIsCSV) return -1;
      if (!aIsCSV && bIsCSV) return 1;
      return a.localeCompare(b);
    });

    const entryName = entries[0];
    const entry = zip.files[entryName];
    const entryExt = path.extname(entryName).toLowerCase();

    // Check decompressed size before extracting
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uncompressedSize = (entry as any)._data?.uncompressedSize;
    if (uncompressedSize && uncompressedSize > MAX_DECOMPRESSED_SIZE) {
      throw new Error(`Decompressed file size (${Math.round(uncompressedSize / 1024 / 1024)}MB) exceeds maximum allowed (${MAX_DECOMPRESSED_SIZE / 1024 / 1024}MB)`);
    }

    if (entryExt === ".csv") {
      const csvText = await entry.async("string");
      const result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
      });
      return result.data as Record<string, unknown>[];
    }

    if (entryExt === ".xlsx" || entryExt === ".xls") {
      // Extract XLSX to temp file, then convert to CSV
      const xlsxBuffer = await entry.async("nodebuffer");
      const tempXlsxPath = filePath + ".extracted.xlsx";
      const tempCsvPath = filePath + ".extracted.csv";
      await writeFile(tempXlsxPath, xlsxBuffer);

      try {
        console.log(`Converting extracted XLSX to CSV: ${entryName}`);
        await convertXlsxToCsv(tempXlsxPath, tempCsvPath);
        console.log(`Conversion complete, parsing CSV...`);
        const data = await parseCsvFile(tempCsvPath);
        return data;
      } finally {
        // Clean up temp files
        await unlink(tempXlsxPath).catch(() => {});
        await unlink(tempCsvPath).catch(() => {});
      }
    }
  }

  if (ext === ".gz") {
    // Get the inner filename by removing .gz extension
    const innerName = fileName.replace(/\.gz$/i, "");
    const innerExt = path.extname(innerName).toLowerCase();

    // Check decompressed size from gzip footer (last 4 bytes = ISIZE)
    // Note: This is mod 2^32, so only accurate for files < 4GB
    const compressedBuffer = await readFile(filePath);
    if (compressedBuffer.length >= 4) {
      const isize = compressedBuffer.readUInt32LE(compressedBuffer.length - 4);
      // Only trust this value if it seems reasonable (not 0 and less than 4GB indicator)
      if (isize > 0 && isize > MAX_DECOMPRESSED_SIZE) {
        throw new Error(`Decompressed file size (~${Math.round(isize / 1024 / 1024)}MB) exceeds maximum allowed (${MAX_DECOMPRESSED_SIZE / 1024 / 1024}MB)`);
      }
    }

    // Decompress gzip file with size limit enforcement
    const decompressedBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;
      const gunzip = createGunzip();
      const readable = Readable.from(compressedBuffer);

      readable.pipe(gunzip)
        .on("data", (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > MAX_DECOMPRESSED_SIZE) {
            gunzip.destroy();
            reject(new Error(`Decompressed file exceeds maximum allowed size (${MAX_DECOMPRESSED_SIZE / 1024 / 1024}MB)`));
            return;
          }
          chunks.push(chunk);
        })
        .on("end", () => resolve(Buffer.concat(chunks)))
        .on("error", reject);
    });

    if (innerExt === ".csv" || innerExt === "") {
      // Parse as CSV (default if no inner extension)
      const csvText = decompressedBuffer.toString("utf-8");
      const result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
      });
      return result.data as Record<string, unknown>[];
    }

    if (innerExt === ".xlsx" || innerExt === ".xls") {
      // Write decompressed XLSX to temp file, then convert to CSV
      const tempXlsxPath = filePath + ".decompressed.xlsx";
      const tempCsvPath = filePath + ".decompressed.csv";
      await writeFile(tempXlsxPath, decompressedBuffer);

      try {
        console.log(`Converting decompressed XLSX to CSV: ${innerName}`);
        await convertXlsxToCsv(tempXlsxPath, tempCsvPath);
        console.log(`Conversion complete, parsing CSV...`);
        const data = await parseCsvFile(tempCsvPath);
        return data;
      } finally {
        await unlink(tempXlsxPath).catch(() => {});
        await unlink(tempCsvPath).catch(() => {});
      }
    }
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

// Status endpoint - check server capacity before uploading
export async function GET() {
  // Check for stuck jobs before reporting status
  checkAndResetStuckJobs();

  return NextResponse.json({
    activeJobs,
    maxJobs: MAX_CONCURRENT_JOBS,
    queueLength: waitingQueue.length,
    available: activeJobs < MAX_CONCURRENT_JOBS
  });
}

export async function POST(request: NextRequest) {
  // Check concurrency - wait up to 30s for a slot
  const slot = await acquireSlot(30000);
  if (!slot.acquired) {
    return NextResponse.json(
      {
        error: "Server is busy processing other files. Please try again in a few minutes.",
        queuePosition: slot.queuePosition,
        activeJobs: activeJobs,
        maxJobs: MAX_CONCURRENT_JOBS
      },
      { status: 503, headers: { "Retry-After": "60" } }
    );
  }

  const jobId = uuidv4();
  const dbPath = path.join("/tmp", `job-${jobId}.db`);
  const fileAPath = path.join("/tmp", `job-${jobId}-fileA`);
  const fileBPath = path.join("/tmp", `job-${jobId}-fileB`);
  let db: Database.Database | null = null;

  const cleanup = async () => {
    if (db) {
      try {
        db.close();
      } catch {
        // Ignore close errors
      }
    }
    await Promise.all([
      unlink(dbPath).catch(() => {}),
      unlink(fileAPath).catch(() => {}),
      unlink(fileBPath).catch(() => {}),
    ]);
  };

  try {
    // Parse FormData
    const formData = await request.formData();

    const fileA = formData.get("fileA") as File | null;
    const fileB = formData.get("fileB") as File | null;
    const mappingAStr = formData.get("mappingA") as string | null;
    const mappingBStr = formData.get("mappingB") as string | null;
    const settingsAStr = formData.get("settingsA") as string | null;
    const settingsBStr = formData.get("settingsB") as string | null;

    if (!fileA || !fileB || !mappingAStr || !mappingBStr) {
      return NextResponse.json(
        { error: "Missing required fields: fileA, fileB, mappingA, mappingB" },
        { status: 400 }
      );
    }

    // Security: Validate file sizes (max 500MB each)
    const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
    if (fileA.size > MAX_FILE_SIZE || fileB.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum allowed (${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 413 }
      );
    }

    // Security: Validate file extensions
    const allowedExtensions = [".csv", ".xlsx", ".xls", ".zip", ".gz"];
    const extA = path.extname(fileA.name).toLowerCase();
    const extB = path.extname(fileB.name).toLowerCase();
    if (!allowedExtensions.includes(extA) || !allowedExtensions.includes(extB)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: CSV, XLSX, XLS, ZIP, GZ" },
        { status: 400 }
      );
    }

    // Security: Validate mapping JSON to prevent prototype pollution
    let mappingA: ColumnMapping;
    let mappingB: ColumnMapping;
    let settingsA: FileSettings;
    let settingsB: FileSettings;

    // Default settings
    const defaultSettings: FileSettings = {
      durationUnit: "seconds",
      ratePrecision: 4,
      timezone: "GMT+0",
    };

    try {
      mappingA = JSON.parse(mappingAStr);
      mappingB = JSON.parse(mappingBStr);
      settingsA = settingsAStr ? JSON.parse(settingsAStr) : defaultSettings;
      settingsB = settingsBStr ? JSON.parse(settingsBStr) : defaultSettings;

      // Ensure mappings are plain objects with expected keys only
      const allowedKeys = ["a_number", "b_number", "seize_time", "seize_time_alt", "answer_time", "answer_time_alt", "end_time", "end_time_alt", "billed_duration", "rate", "lrn"];
      const validateMapping = (m: ColumnMapping) => {
        for (const key of Object.keys(m)) {
          if (!allowedKeys.includes(key)) {
            throw new Error(`Invalid mapping key: ${key}`);
          }
          const value = m[key as keyof ColumnMapping];
          if (value !== null && value !== undefined && typeof value !== "string") {
            throw new Error(`Invalid mapping value for ${key}`);
          }
        }
      };
      validateMapping(mappingA);
      validateMapping(mappingB);
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid column mapping format" },
        { status: 400 }
      );
    }

    // Get timezone offsets for each file
    const timezoneOffsetA = TIMEZONE_OFFSETS[settingsA.timezone] ?? 0;
    const timezoneOffsetB = TIMEZONE_OFFSETS[settingsB.timezone] ?? 0;
    console.log(`Timezone settings - File A: ${settingsA.timezone} (${timezoneOffsetA}h), File B: ${settingsB.timezone} (${timezoneOffsetB}h)`);

    // Log mappings summary
    console.log("Processing with mappings - File A:", Object.entries(mappingA).filter(([,v]) => v).map(([k,v]) => `${k}:${v}`).join(", "));
    console.log("Processing with mappings - File B:", Object.entries(mappingB).filter(([,v]) => v).map(([k,v]) => `${k}:${v}`).join(", "));

    // Validate required mappings
    if (!mappingA.a_number || !mappingA.b_number || !mappingA.seize_time || !mappingA.billed_duration || !mappingA.lrn) {
      return NextResponse.json(
        { error: "Missing required column mappings for file A" },
        { status: 400 }
      );
    }
    if (!mappingB.a_number || !mappingB.b_number || !mappingB.seize_time || !mappingB.billed_duration || !mappingB.lrn) {
      return NextResponse.json(
        { error: "Missing required column mappings for file B" },
        { status: 400 }
      );
    }

    // Save files to disk
    const bufferA = Buffer.from(await fileA.arrayBuffer());
    const bufferB = Buffer.from(await fileB.arrayBuffer());
    await writeFile(fileAPath, bufferA);
    await writeFile(fileBPath, bufferB);

    // Parse files
    console.log(`Parsing file A: ${fileA.name}`);
    const dataA = await parseFile(fileAPath, fileA.name);
    console.log(`Parsed ${dataA.length} rows from file A`);

    console.log(`Parsing file B: ${fileB.name}`);
    const dataB = await parseFile(fileBPath, fileB.name);
    console.log(`Parsed ${dataB.length} rows from file B`);

    if (!dataA.length || !dataB.length) {
      await cleanup();
      releaseSlot();
      return NextResponse.json({ error: "One or both files contain no data" }, { status: 400 });
    }

    // Security: Limit total rows to prevent memory exhaustion
    const MAX_ROWS = 2_000_000; // 2 million rows max
    if (dataA.length > MAX_ROWS || dataB.length > MAX_ROWS) {
      await cleanup();
      releaseSlot();
      return NextResponse.json(
        { error: `File exceeds maximum row limit (${MAX_ROWS.toLocaleString()} rows)` },
        { status: 413 }
      );
    }

    // Create SQLite database
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = OFF"); // Faster for temp data
    db.pragma("temp_store = MEMORY");

    // Create tables
    db.exec(`
      CREATE TABLE records_a (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        a_number TEXT NOT NULL,
        b_number TEXT NOT NULL,
        seize_time INTEGER,
        answer_time INTEGER,
        end_time INTEGER,
        billed_duration INTEGER DEFAULT 0,
        rate REAL DEFAULT 0,
        lrn TEXT,
        raw_index INTEGER
      );

      CREATE TABLE records_b (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        a_number TEXT NOT NULL,
        b_number TEXT NOT NULL,
        seize_time INTEGER,
        answer_time INTEGER,
        end_time INTEGER,
        billed_duration INTEGER DEFAULT 0,
        rate REAL DEFAULT 0,
        lrn TEXT,
        raw_index INTEGER
      );
    `);

    // Prepare insert statements
    const insertA = db.prepare(`
      INSERT INTO records_a (a_number, b_number, seize_time, answer_time, end_time, billed_duration, rate, lrn, raw_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertB = db.prepare(`
      INSERT INTO records_b (a_number, b_number, seize_time, answer_time, end_time, billed_duration, rate, lrn, raw_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Batch insert File A records
    const BATCH_SIZE = 10000;

    const insertBatchA = db.transaction((rows: Record<string, unknown>[], startIndex: number) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        insertA.run(
          normalizePhoneNumber(row[mappingA.a_number!] as string | number | null),
          normalizePhoneNumber(row[mappingA.b_number!] as string | number | null),
          getTimestampFromRow(row, mappingA.seize_time, mappingA.seize_time_alt, timezoneOffsetA),
          getTimestampFromRow(row, mappingA.answer_time ?? null, mappingA.answer_time_alt, timezoneOffsetA),
          getTimestampFromRow(row, mappingA.end_time ?? null, mappingA.end_time_alt, timezoneOffsetA),
          normalizeDuration(row[mappingA.billed_duration!] as string | number | null),
          mappingA.rate ? normalizeRate(row[mappingA.rate] as string | number | null) : 0,
          normalizePhoneNumber(row[mappingA.lrn!] as string | number | null),
          startIndex + i
        );
      }
    });

    const insertBatchB = db.transaction((rows: Record<string, unknown>[], startIndex: number) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        insertB.run(
          normalizePhoneNumber(row[mappingB.a_number!] as string | number | null),
          normalizePhoneNumber(row[mappingB.b_number!] as string | number | null),
          getTimestampFromRow(row, mappingB.seize_time, mappingB.seize_time_alt, timezoneOffsetB),
          getTimestampFromRow(row, mappingB.answer_time ?? null, mappingB.answer_time_alt, timezoneOffsetB),
          getTimestampFromRow(row, mappingB.end_time ?? null, mappingB.end_time_alt, timezoneOffsetB),
          normalizeDuration(row[mappingB.billed_duration!] as string | number | null),
          mappingB.rate ? normalizeRate(row[mappingB.rate] as string | number | null) : 0,
          normalizePhoneNumber(row[mappingB.lrn!] as string | number | null),
          startIndex + i
        );
      }
    });

    // Insert in batches
    console.log("Inserting file A records...");
    for (let i = 0; i < dataA.length; i += BATCH_SIZE) {
      const batch = dataA.slice(i, i + BATCH_SIZE);
      insertBatchA(batch, i);
    }

    console.log("Inserting file B records...");
    for (let i = 0; i < dataB.length; i += BATCH_SIZE) {
      const batch = dataB.slice(i, i + BATCH_SIZE);
      insertBatchB(batch, i);
    }

    // Create indexes after bulk insert (faster)
    console.log("Creating indexes...");
    db.exec(`
      CREATE INDEX idx_a_lookup ON records_a(a_number, b_number);
      CREATE INDEX idx_b_lookup ON records_b(a_number, b_number);
      CREATE INDEX idx_a_seize ON records_a(seize_time);
      CREATE INDEX idx_b_seize ON records_b(seize_time);
    `);

    // Find matched records
    // Use 1-to-1 matching: each record can only be matched once
    console.log("Running matching query...");
    interface MatchRow {
      id_a: number;
      id_b: number;
      a_number: string;
      b_number: string;
      seize_a: number | null;
      seize_b: number | null;
      duration_a: number;
      duration_b: number;
      rate_a: number;
      rate_b: number;
      lrn_a: string;
      lrn_b: string;
      index_a: number;
      index_b: number;
    }

    // Use 60-second tolerance to account for minute-level precision in some systems
    const TIME_TOLERANCE_SECONDS = 60;

    // MEMORY OPTIMIZATION: Use iterate() instead of all() to avoid loading all matches into memory
    // Apply 1-to-1 matching: each A and B record can only be matched once
    // Prefer exact time matches, then closest duration matches
    const usedAIds = new Set<number>();
    const usedBIds = new Set<number>();
    const matches: MatchRow[] = [];

    const matchQuery = db.prepare(`
      SELECT
        a.id as id_a,
        b.id as id_b,
        a.a_number,
        a.b_number,
        a.seize_time as seize_a,
        b.seize_time as seize_b,
        a.billed_duration as duration_a,
        b.billed_duration as duration_b,
        a.rate as rate_a,
        b.rate as rate_b,
        a.lrn as lrn_a,
        b.lrn as lrn_b,
        a.raw_index as index_a,
        b.raw_index as index_b
      FROM records_a a
      INNER JOIN records_b b
        ON a.a_number = b.a_number
        AND a.b_number = b.b_number
        AND ABS(COALESCE(a.seize_time, 0) - COALESCE(b.seize_time, 0)) <= ${TIME_TOLERANCE_SECONDS}
      ORDER BY ABS(COALESCE(a.seize_time, 0) - COALESCE(b.seize_time, 0)) ASC,
               ABS(a.billed_duration - b.billed_duration) ASC
    `);

    // Iterate through matches one at a time instead of loading all into memory
    for (const match of matchQuery.iterate() as Iterable<MatchRow>) {
      if (!usedAIds.has(match.id_a) && !usedBIds.has(match.id_b)) {
        matches.push(match);
        usedAIds.add(match.id_a);
        usedBIds.add(match.id_b);
      }
    }

    console.log(`Found ${matches.length} matched records (1-to-1)`);

    // MEMORY OPTIMIZATION: Store matched IDs in temp tables for efficient SQL queries
    // This avoids loading all records into JS memory
    console.log("Finding unmatched records...");

    // Create temp tables to store matched IDs
    db.exec(`
      CREATE TEMP TABLE matched_a_ids (id INTEGER PRIMARY KEY);
      CREATE TEMP TABLE matched_b_ids (id INTEGER PRIMARY KEY);
    `);

    // Batch insert matched IDs
    const insertMatchedA = db.prepare(`INSERT INTO matched_a_ids (id) VALUES (?)`);
    const insertMatchedB = db.prepare(`INSERT INTO matched_b_ids (id) VALUES (?)`);

    const insertMatchedIds = db.transaction(() => {
      for (const m of matches) {
        insertMatchedA.run(m.id_a);
        insertMatchedB.run(m.id_b);
      }
    });
    insertMatchedIds();

    // Get unmatched records using SQL (much more memory efficient)
    interface RecordRow {
      id: number;
      a_number: string;
      b_number: string;
      seize_time: number | null;
      billed_duration: number;
      rate: number;
      raw_index: number;
    }

    // MEMORY OPTIMIZATION: Get counts first, then iterate for discrepancy processing
    const unmatchedCountA = (db.prepare(`
      SELECT COUNT(*) as count
      FROM records_a a
      LEFT JOIN matched_a_ids m ON a.id = m.id
      WHERE m.id IS NULL
    `).get() as { count: number }).count;

    const unmatchedCountB = (db.prepare(`
      SELECT COUNT(*) as count
      FROM records_b b
      LEFT JOIN matched_b_ids m ON b.id = m.id
      WHERE m.id IS NULL
    `).get() as { count: number }).count;

    console.log(`Unmatched in A: ${unmatchedCountA}, Unmatched in B: ${unmatchedCountB}`);

    // Prepare iterators for unmatched records (will be used later for discrepancy building)
    const unmatchedAQuery = db.prepare(`
      SELECT a.id, a.a_number, a.b_number, a.seize_time, a.billed_duration, a.rate, a.raw_index
      FROM records_a a
      LEFT JOIN matched_a_ids m ON a.id = m.id
      WHERE m.id IS NULL
    `);

    const unmatchedBQuery = db.prepare(`
      SELECT b.id, b.a_number, b.b_number, b.seize_time, b.billed_duration, b.rate, b.raw_index
      FROM records_b b
      LEFT JOIN matched_b_ids m ON b.id = m.id
      WHERE m.id IS NULL
    `);

    // Build discrepancies list with MEMORY OPTIMIZATION
    // Instead of storing all discrepancies, we:
    // 1. Track counts and totals for summary
    // 2. Only keep top N items per category (by cost impact)
    interface Discrepancy {
      type: "missing_in_a" | "missing_in_b" | "zero_duration_in_a" | "zero_duration_in_b" | "duration_mismatch" | "rate_mismatch" | "cost_mismatch" | "lrn_mismatch" | "hung_call_yours" | "hung_call_provider";
      a_number: string;
      b_number: string;
      seize_time: number | null;
      your_duration: number | null;
      provider_duration: number | null;
      your_rate: number | null;
      provider_rate: number | null;
      your_cost: number | null;
      provider_cost: number | null;
      cost_difference: number;
      your_lrn?: string | null;
      provider_lrn?: string | null;
      source_index?: number;
      source_index_a?: number;
      source_index_b?: number;
      hung_call_count?: number;
    }

    // MEMORY OPTIMIZATION: Bounded collector keeps only top N items per category
    const MAX_PER_CATEGORY = 1000; // Keep top 1000 per category by |cost_difference|
    type DiscrepancyType = Discrepancy["type"];

    class BoundedDiscrepancyCollector {
      private items: Map<DiscrepancyType, Discrepancy[]> = new Map();
      private counts: Map<DiscrepancyType, number> = new Map();
      private costTotals: Map<DiscrepancyType, number> = new Map();
      private maxPerCategory: number;

      constructor(maxPerCategory: number) {
        this.maxPerCategory = maxPerCategory;
      }

      add(d: Discrepancy) {
        const type = d.type;
        // Update count
        this.counts.set(type, (this.counts.get(type) || 0) + 1);
        // Update cost total
        this.costTotals.set(type, (this.costTotals.get(type) || 0) + d.cost_difference);

        // Get or create array for this type
        let arr = this.items.get(type);
        if (!arr) {
          arr = [];
          this.items.set(type, arr);
        }

        // If under limit, just add
        if (arr.length < this.maxPerCategory) {
          arr.push(d);
          return;
        }

        // Otherwise, check if this item has higher |cost_difference| than the min
        const absCost = Math.abs(d.cost_difference);
        let minIdx = 0;
        let minAbsCost = Math.abs(arr[0].cost_difference);
        for (let i = 1; i < arr.length; i++) {
          const c = Math.abs(arr[i].cost_difference);
          if (c < minAbsCost) {
            minAbsCost = c;
            minIdx = i;
          }
        }

        if (absCost > minAbsCost) {
          arr[minIdx] = d; // Replace the minimum
        }
      }

      getCount(type: DiscrepancyType): number {
        return this.counts.get(type) || 0;
      }

      getCostTotal(type: DiscrepancyType): number {
        return this.costTotals.get(type) || 0;
      }

      getTotalCount(): number {
        let total = 0;
        for (const count of this.counts.values()) total += count;
        return total;
      }

      getTotalCost(): number {
        let total = 0;
        for (const cost of this.costTotals.values()) total += cost;
        return total;
      }

      getAllItems(): Discrepancy[] {
        const result: Discrepancy[] = [];
        for (const arr of this.items.values()) {
          result.push(...arr);
        }
        return result;
      }

      getItemsByType(type: DiscrepancyType): Discrepancy[] {
        return this.items.get(type) || [];
      }
    }

    const collector = new BoundedDiscrepancyCollector(MAX_PER_CATEGORY);

    // Track zero-duration stats for synopsis
    let zeroDurationInA = 0;
    let zeroDurationInB = 0;
    let billedMissingInA = 0;
    let billedMissingInB = 0;

    // MEMORY OPTIMIZATION: Use iteration for unmatched records
    // Missing in B (You have it, provider doesn't)
    for (const record of unmatchedAQuery.iterate() as Iterable<RecordRow>) {
      const yourCost = calculateCallCost(record.billed_duration, record.rate);
      const isZeroDuration = record.billed_duration === 0;

      if (isZeroDuration) {
        zeroDurationInA++;
      } else {
        billedMissingInB++;
      }

      collector.add({
        type: isZeroDuration ? "zero_duration_in_b" : "missing_in_b",
        a_number: record.a_number,
        b_number: record.b_number,
        seize_time: record.seize_time,
        your_duration: record.billed_duration,
        provider_duration: null,
        your_rate: record.rate,
        provider_rate: null,
        your_cost: yourCost,
        provider_cost: null,
        cost_difference: yourCost,
        source_index: record.raw_index,
      });
    }

    // Missing in A (Provider has it, you don't)
    for (const record of unmatchedBQuery.iterate() as Iterable<RecordRow>) {
      const providerCost = calculateCallCost(record.billed_duration, record.rate);
      const isZeroDuration = record.billed_duration === 0;

      if (isZeroDuration) {
        zeroDurationInB++;
      } else {
        billedMissingInA++;
      }

      collector.add({
        type: isZeroDuration ? "zero_duration_in_a" : "missing_in_a",
        a_number: record.a_number,
        b_number: record.b_number,
        seize_time: record.seize_time,
        your_duration: null,
        provider_duration: record.billed_duration,
        your_rate: null,
        provider_rate: record.rate,
        your_cost: null,
        provider_cost: providerCost,
        cost_difference: -providerCost,
        source_index: record.raw_index,
      });
    }

    // Compare matched records - focus on COST differences and LRN mismatches
    let lrnMismatchCount = 0;
    for (const match of matches) {
      const yourCost = calculateCallCost(match.duration_a, match.rate_a);
      const providerCost = calculateCallCost(match.duration_b, match.rate_b);
      const costDiff = yourCost - providerCost;

      // Check for LRN mismatch
      const lrnMismatch = match.lrn_a !== match.lrn_b && match.lrn_a && match.lrn_b;
      if (lrnMismatch) {
        lrnMismatchCount++;
        collector.add({
          type: "lrn_mismatch",
          a_number: match.a_number,
          b_number: match.b_number,
          seize_time: match.seize_a,
          your_duration: match.duration_a,
          provider_duration: match.duration_b,
          your_rate: match.rate_a,
          provider_rate: match.rate_b,
          your_cost: yourCost,
          provider_cost: providerCost,
          cost_difference: costDiff,
          your_lrn: match.lrn_a,
          provider_lrn: match.lrn_b,
          source_index_a: match.index_a,
          source_index_b: match.index_b,
        });
      }

      // Only report cost difference if meaningful and not already LRN mismatch
      if (Math.abs(costDiff) > 0.0001 && !lrnMismatch) {
        const durationDiff = match.duration_a - match.duration_b;
        const rateDiff = match.rate_a - match.rate_b;

        let discrepancyType: Discrepancy["type"] = "cost_mismatch";
        if (Math.abs(durationDiff) > 1 && Math.abs(rateDiff) <= 0.0001) {
          discrepancyType = "duration_mismatch";
        } else if (Math.abs(rateDiff) > 0.0001 && Math.abs(durationDiff) <= 1) {
          discrepancyType = "rate_mismatch";
        }

        collector.add({
          type: discrepancyType,
          a_number: match.a_number,
          b_number: match.b_number,
          seize_time: match.seize_a,
          your_duration: match.duration_a,
          provider_duration: match.duration_b,
          your_rate: match.rate_a,
          provider_rate: match.rate_b,
          your_cost: yourCost,
          provider_cost: providerCost,
          cost_difference: costDiff,
          your_lrn: match.lrn_a,
          provider_lrn: match.lrn_b,
          source_index_a: match.index_a,
          source_index_b: match.index_b,
        });
      }
    }

    // Clear matches array to free memory - we don't need it anymore
    matches.length = 0;

    // HUNG CALL DETECTION with bounded collection
    console.log("Detecting hung calls in unmatched records...");

    interface HungCallRow {
      duration: number;
      call_count: number;
    }

    // Get hung call counts from SQL (memory efficient)
    const hungCallStatsA = db.prepare(`
      SELECT COUNT(*) as total_calls, COUNT(DISTINCT billed_duration) as groups
      FROM records_a a
      LEFT JOIN matched_a_ids m ON a.id = m.id
      WHERE m.id IS NULL AND a.billed_duration > 30
      AND a.billed_duration IN (
        SELECT billed_duration FROM records_a a2
        LEFT JOIN matched_a_ids m2 ON a2.id = m2.id
        WHERE m2.id IS NULL AND a2.billed_duration > 30
        GROUP BY a2.billed_duration HAVING COUNT(*) >= 3
      )
    `).get() as { total_calls: number; groups: number };

    const hungCallStatsB = db.prepare(`
      SELECT COUNT(*) as total_calls, COUNT(DISTINCT billed_duration) as groups
      FROM records_b b
      LEFT JOIN matched_b_ids m ON b.id = m.id
      WHERE m.id IS NULL AND b.billed_duration > 30
      AND b.billed_duration IN (
        SELECT billed_duration FROM records_b b2
        LEFT JOIN matched_b_ids m2 ON b2.id = m2.id
        WHERE m2.id IS NULL AND b2.billed_duration > 30
        GROUP BY b2.billed_duration HAVING COUNT(*) >= 3
      )
    `).get() as { total_calls: number; groups: number };

    const hungCallsInYours = hungCallStatsA?.total_calls || 0;
    const hungCallsInProvider = hungCallStatsB?.total_calls || 0;
    const hungCallGroupsYours = hungCallStatsA?.groups || 0;
    const hungCallGroupsProvider = hungCallStatsB?.groups || 0;

    // Only fetch top hung calls for display (limit to avoid memory issues)
    const HUNG_CALL_SAMPLE_LIMIT = 200;

    const hungCallSampleA = db.prepare(`
      SELECT a.a_number, a.b_number, a.seize_time, a.rate, a.raw_index, a.billed_duration,
             (SELECT COUNT(*) FROM records_a a2
              LEFT JOIN matched_a_ids m2 ON a2.id = m2.id
              WHERE m2.id IS NULL AND a2.billed_duration = a.billed_duration) as call_count
      FROM records_a a
      LEFT JOIN matched_a_ids m ON a.id = m.id
      WHERE m.id IS NULL AND a.billed_duration > 30
      AND a.billed_duration IN (
        SELECT billed_duration FROM records_a a2
        LEFT JOIN matched_a_ids m2 ON a2.id = m2.id
        WHERE m2.id IS NULL AND a2.billed_duration > 30
        GROUP BY a2.billed_duration HAVING COUNT(*) >= 3
      )
      ORDER BY a.rate * a.billed_duration DESC
      LIMIT ?
    `).all(HUNG_CALL_SAMPLE_LIMIT) as (RecordRow & { call_count: number })[];

    for (const record of hungCallSampleA) {
      const cost = calculateCallCost(record.billed_duration, record.rate);
      collector.add({
        type: "hung_call_yours",
        a_number: record.a_number,
        b_number: record.b_number,
        seize_time: record.seize_time,
        your_duration: record.billed_duration,
        provider_duration: null,
        your_rate: record.rate,
        provider_rate: null,
        your_cost: cost,
        provider_cost: null,
        cost_difference: cost,
        source_index: record.raw_index,
        hung_call_count: record.call_count,
      });
    }

    const hungCallSampleB = db.prepare(`
      SELECT b.a_number, b.b_number, b.seize_time, b.rate, b.raw_index, b.billed_duration,
             (SELECT COUNT(*) FROM records_b b2
              LEFT JOIN matched_b_ids m2 ON b2.id = m2.id
              WHERE m2.id IS NULL AND b2.billed_duration = b.billed_duration) as call_count
      FROM records_b b
      LEFT JOIN matched_b_ids m ON b.id = m.id
      WHERE m.id IS NULL AND b.billed_duration > 30
      AND b.billed_duration IN (
        SELECT billed_duration FROM records_b b2
        LEFT JOIN matched_b_ids m2 ON b2.id = m2.id
        WHERE m2.id IS NULL AND b2.billed_duration > 30
        GROUP BY b2.billed_duration HAVING COUNT(*) >= 3
      )
      ORDER BY b.rate * b.billed_duration DESC
      LIMIT ?
    `).all(HUNG_CALL_SAMPLE_LIMIT) as (RecordRow & { call_count: number })[];

    for (const record of hungCallSampleB) {
      const cost = calculateCallCost(record.billed_duration, record.rate);
      collector.add({
        type: "hung_call_provider",
        a_number: record.a_number,
        b_number: record.b_number,
        seize_time: record.seize_time,
        your_duration: null,
        provider_duration: record.billed_duration,
        your_rate: null,
        provider_rate: record.rate,
        your_cost: null,
        provider_cost: cost,
        cost_difference: -cost,
        source_index: record.raw_index,
        hung_call_count: record.call_count,
      });
    }

    console.log(`Hung calls (unmatched only) - Yours: ${hungCallsInYours} (${hungCallGroupsYours} groups), Provider: ${hungCallsInProvider} (${hungCallGroupsProvider} groups)`);

    // MEMORY OPTIMIZATION: Calculate totals using SQL aggregation
    // Note: We use a SQL formula for 6-second increment billing: CEIL(duration/6) * rate / 10
    interface TotalsRow {
      total_seconds: number;
      total_cost: number;
    }

    const totalsA = db.prepare(`
      SELECT
        SUM(billed_duration) as total_seconds,
        SUM(
          CASE WHEN billed_duration > 0
            THEN (((billed_duration + 5) / 6) * rate / 10.0)
            ELSE 0
          END
        ) as total_cost
      FROM records_a
    `).get() as TotalsRow;

    const totalsB = db.prepare(`
      SELECT
        SUM(billed_duration) as total_seconds,
        SUM(
          CASE WHEN billed_duration > 0
            THEN (((billed_duration + 5) / 6) * rate / 10.0)
            ELSE 0
          END
        ) as total_cost
      FROM records_b
    `).get() as TotalsRow;

    const yourTotalBilled = totalsA.total_cost || 0;
    const yourTotalSeconds = totalsA.total_seconds || 0;
    const providerTotalBilled = totalsB.total_cost || 0;
    const providerTotalSeconds = totalsB.total_seconds || 0;

    // Convert seconds to minutes for display
    const yourTotalMinutes = Math.round((yourTotalSeconds / 60) * 100) / 100;
    const providerTotalMinutes = Math.round((providerTotalSeconds / 60) * 100) / 100;

    // MEMORY OPTIMIZATION: Get counts and totals from collector (no array filtering)
    const durationMismatchCount = collector.getCount("duration_mismatch");
    const rateMismatchCount = collector.getCount("rate_mismatch");
    const costMismatchCount = collector.getCount("cost_mismatch");
    const totalDiscrepancyCount = collector.getTotalCount();

    // Get monetary impact by category from collector
    const impactFromMissingInA = collector.getCostTotal("missing_in_a");
    const impactFromMissingInB = collector.getCostTotal("missing_in_b");
    const impactFromDuration = collector.getCostTotal("duration_mismatch");
    const impactFromRate = collector.getCostTotal("rate_mismatch");
    const impactFromCost = collector.getCostTotal("cost_mismatch");

    // Store matched count before we cleared the array
    const matchedRecordsCount = usedAIds.size;

    // Calculate summary
    const summary = {
      totalRecordsA: dataA.length,
      totalRecordsB: dataB.length,
      matchedRecords: matchedRecordsCount,
      // TOTAL BILLED - key numbers for invoice comparison
      yourTotalBilled: Math.round(yourTotalBilled * 100) / 100,
      providerTotalBilled: Math.round(providerTotalBilled * 100) / 100,
      billingDifference: Math.round((yourTotalBilled - providerTotalBilled) * 100) / 100,
      // TOTAL MINUTES - for invoice cross-reference
      yourTotalMinutes,
      providerTotalMinutes,
      minutesDifference: Math.round((yourTotalMinutes - providerTotalMinutes) * 100) / 100,
      // Original totals (includes zero-duration)
      missingInYours: unmatchedCountB,
      missingInProvider: unmatchedCountA,
      // New: separated by billing relevance
      zeroDurationInYours: zeroDurationInA,
      zeroDurationInProvider: zeroDurationInB,
      billedMissingInYours: billedMissingInA,
      billedMissingInProvider: billedMissingInB,
      // Mismatch counts
      durationMismatches: durationMismatchCount,
      rateMismatches: rateMismatchCount,
      costMismatches: costMismatchCount,
      lrnMismatches: lrnMismatchCount,
      totalDiscrepancies: totalDiscrepancyCount,
      // Monetary impact breakdown
      monetaryImpact: Math.round(collector.getTotalCost() * 100) / 100,
      impactBreakdown: {
        missingInYours: Math.round(impactFromMissingInA * 100) / 100,
        missingInProvider: Math.round(impactFromMissingInB * 100) / 100,
        durationMismatches: Math.round(impactFromDuration * 100) / 100,
        rateMismatches: Math.round(impactFromRate * 100) / 100,
        costMismatches: Math.round(impactFromCost * 100) / 100,
      },
      // Hung calls (potential stuck switch issues)
      hungCallsInYours,
      hungCallsInProvider,
      hungCallGroupsYours,
      hungCallGroupsProvider,
    };

    console.log("Summary:", summary);

    // Cleanup database and release concurrency slot
    await cleanup();
    releaseSlot();

    // MEMORY OPTIMIZATION: Get sampled discrepancies directly from collector
    // The collector already keeps only top N per category, sorted by |cost_difference|
    const sampledDiscrepancies = collector.getAllItems();

    // Sort final result by type then cost for consistent display
    const typeOrder: Record<string, number> = {
      missing_in_a: 1,
      lrn_mismatch: 2,
      duration_mismatch: 3,
      rate_mismatch: 4,
      cost_mismatch: 5,
      missing_in_b: 6,
      zero_duration_in_a: 7,
      zero_duration_in_b: 8,
      hung_call_yours: 9,
      hung_call_provider: 10,
    };

    sampledDiscrepancies.sort((a, b) => {
      const orderA = typeOrder[a.type] || 99;
      const orderB = typeOrder[b.type] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return Math.abs(b.cost_difference) - Math.abs(a.cost_difference);
    });

    // Track usage metrics
    try {
      const totalCdrs = summary.totalRecordsA + summary.totalRecordsB;
      const totalBytes = fileA.size + fileB.size;
      incrementMetrics(totalCdrs, totalBytes);
    } catch (metricsError) {
      // Don't fail the request if metrics tracking fails
      console.error("[Metrics] Failed to increment metrics:", metricsError);
    }

    // Return results
    return NextResponse.json({
      success: true,
      jobId,
      summary,
      discrepancies: sampledDiscrepancies,
      hasMore: totalDiscrepancyCount > sampledDiscrepancies.length,
      totalDiscrepancyCount: totalDiscrepancyCount,
    });
  } catch (error) {
    console.error("Processing error:", error);
    await cleanup();
    releaseSlot();

    return NextResponse.json(
      {
        error: "Processing failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
