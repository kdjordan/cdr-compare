import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { unlink, writeFile, readFile } from "fs/promises";
import path from "path";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/node";
import JSZip from "jszip";

// Types
interface ColumnMapping {
  a_number: string | null;
  b_number: string | null;
  seize_time: string | null;
  answer_time?: string | null;
  end_time?: string | null;
  billed_duration: string | null;
  rate?: string | null;
  lrn: string | null;
}

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
function normalizeTimestamp(input: string | number | Date | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;

  try {
    if (typeof input === "number") {
      // Excel serial date (days since 1900-01-01)
      if (input > 0 && input < 100000) {
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + input * 86400000);
        return Math.floor(date.getTime() / 1000);
      }
      // Unix timestamp - check if seconds or milliseconds
      return input > 10000000000 ? Math.floor(input / 1000) : input;
    }

    const strInput = String(input);

    // Handle format like "11/7/2025 16:55" - treat as UTC by appending Z
    // This format is M/D/YYYY HH:mm (US format without timezone)
    const usDateTimeMatch = strInput.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (usDateTimeMatch) {
      const [, month, day, year, hour, minute, second = "0"] = usDateTimeMatch;
      // Create ISO format string and parse as UTC
      const isoStr = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}Z`;
      const date = new Date(isoStr);
      if (!isNaN(date.getTime())) {
        return Math.floor(date.getTime() / 1000);
      }
    }

    // If string already has timezone indicator, parse directly
    if (strInput.includes("+") || strInput.includes("Z") || strInput.includes(" UTC") || strInput.includes(" GMT")) {
      const date = new Date(strInput);
      if (!isNaN(date.getTime())) {
        return Math.floor(date.getTime() / 1000);
      }
    }

    // For other formats, try standard parsing but be aware it may use local timezone
    const date = new Date(input);
    if (isNaN(date.getTime())) return null;

    return Math.floor(date.getTime() / 1000);
  } catch {
    return null;
  }
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

// Parse file based on extension
async function parseFile(filePath: string, fileName: string): Promise<Record<string, unknown>[]> {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === ".csv") {
    const buffer = await readFile(filePath);
    const text = buffer.toString("utf-8");
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });
    return result.data as Record<string, unknown>[];
  }

  if (ext === ".xlsx" || ext === ".xls") {
    // read-excel-file returns rows as arrays, first row is headers
    const rows = await readXlsxFile(filePath);

    if (rows.length === 0) {
      return [];
    }

    // First row is headers
    const headers = rows[0].map((cell) => String(cell ?? ""));

    // Convert remaining rows to objects
    const data: Record<string, unknown>[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        record[header] = row[index] ?? null;
      });
      data.push(record);
    }

    return data;
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
      // Extract to temp file for read-excel-file
      const xlsxBuffer = await entry.async("nodebuffer");
      const tempXlsxPath = filePath + ".extracted.xlsx";
      await writeFile(tempXlsxPath, xlsxBuffer);

      try {
        const rows = await readXlsxFile(tempXlsxPath);
        if (rows.length === 0) {
          return [];
        }
        const headers = rows[0].map((cell) => String(cell ?? ""));
        const data: Record<string, unknown>[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const record: Record<string, unknown> = {};
          headers.forEach((header, index) => {
            record[header] = row[index] ?? null;
          });
          data.push(record);
        }
        return data;
      } finally {
        await unlink(tempXlsxPath).catch(() => {});
      }
    }
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

export async function POST(request: NextRequest) {
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

    if (!fileA || !fileB || !mappingAStr || !mappingBStr) {
      return NextResponse.json(
        { error: "Missing required fields: fileA, fileB, mappingA, mappingB" },
        { status: 400 }
      );
    }

    // Security: Validate file sizes (max 100MB each)
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    if (fileA.size > MAX_FILE_SIZE || fileB.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum allowed (${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 413 }
      );
    }

    // Security: Validate file extensions
    const allowedExtensions = [".csv", ".xlsx", ".xls", ".zip"];
    const extA = path.extname(fileA.name).toLowerCase();
    const extB = path.extname(fileB.name).toLowerCase();
    if (!allowedExtensions.includes(extA) || !allowedExtensions.includes(extB)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: CSV, XLSX, XLS, ZIP" },
        { status: 400 }
      );
    }

    // Security: Validate mapping JSON to prevent prototype pollution
    let mappingA: ColumnMapping;
    let mappingB: ColumnMapping;
    try {
      mappingA = JSON.parse(mappingAStr);
      mappingB = JSON.parse(mappingBStr);

      // Ensure mappings are plain objects with expected keys only
      const allowedKeys = ["a_number", "b_number", "seize_time", "answer_time", "end_time", "billed_duration", "rate", "lrn"];
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
      return NextResponse.json({ error: "One or both files contain no data" }, { status: 400 });
    }

    // Security: Limit total rows to prevent memory exhaustion
    const MAX_ROWS = 2_000_000; // 2 million rows max
    if (dataA.length > MAX_ROWS || dataB.length > MAX_ROWS) {
      await cleanup();
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
          normalizeTimestamp(row[mappingA.seize_time!] as string | number | Date | null),
          mappingA.answer_time ? normalizeTimestamp(row[mappingA.answer_time] as string | number | Date | null) : null,
          mappingA.end_time ? normalizeTimestamp(row[mappingA.end_time] as string | number | Date | null) : null,
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
          normalizeTimestamp(row[mappingB.seize_time!] as string | number | Date | null),
          mappingB.answer_time ? normalizeTimestamp(row[mappingB.answer_time] as string | number | Date | null) : null,
          mappingB.end_time ? normalizeTimestamp(row[mappingB.end_time] as string | number | Date | null) : null,
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

    // Build discrepancies list
    // Types now include zero_duration variants to separate unanswered attempts from real billing issues
    interface Discrepancy {
      type: "missing_in_a" | "missing_in_b" | "zero_duration_in_a" | "zero_duration_in_b" | "duration_mismatch" | "rate_mismatch" | "cost_mismatch" | "lrn_mismatch";
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
    }
    const discrepancies: Discrepancy[] = [];

    // Track zero-duration stats for synopsis
    let zeroDurationInA = 0; // Your records with 0 duration not in provider
    let zeroDurationInB = 0; // Provider records with 0 duration not in yours
    let billedMissingInA = 0; // Provider has billed calls you don't have (real issue)
    let billedMissingInB = 0; // You have billed calls provider doesn't have (real issue)

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

      discrepancies.push({
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
        cost_difference: yourCost, // You're paying for a call they don't have
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

      discrepancies.push({
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
        cost_difference: -providerCost, // They're billing you for a call you don't have
        source_index: record.raw_index,
      });
    }

    // Compare matched records - focus on COST differences and LRN mismatches
    let lrnMismatchCount = 0;
    for (const match of matches) {
      const yourCost = calculateCallCost(match.duration_a, match.rate_a);
      const providerCost = calculateCallCost(match.duration_b, match.rate_b);
      const costDiff = yourCost - providerCost;

      // Check for LRN mismatch - different LRN dips could mean different billing rates
      const lrnMismatch = match.lrn_a !== match.lrn_b && match.lrn_a && match.lrn_b;
      if (lrnMismatch) {
        lrnMismatchCount++;
        discrepancies.push({
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

      // Only report cost difference if there's a meaningful cost difference (> $0.0001)
      // AND it's not already reported as LRN mismatch
      if (Math.abs(costDiff) > 0.0001 && !lrnMismatch) {
        // Determine the primary cause of the discrepancy
        const durationDiff = match.duration_a - match.duration_b;
        const rateDiff = match.rate_a - match.rate_b;

        let discrepancyType: Discrepancy["type"] = "cost_mismatch";
        if (Math.abs(durationDiff) > 1 && Math.abs(rateDiff) <= 0.0001) {
          discrepancyType = "duration_mismatch";
        } else if (Math.abs(rateDiff) > 0.0001 && Math.abs(durationDiff) <= 1) {
          discrepancyType = "rate_mismatch";
        }

        discrepancies.push({
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
          source_index_a: match.index_a,
          source_index_b: match.index_b,
        });
      }
    }

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

    // Calculate cost breakdowns for synopsis
    const missingInAWithCost = discrepancies.filter(d => d.type === "missing_in_a");
    const missingInBWithCost = discrepancies.filter(d => d.type === "missing_in_b");
    const durationMismatches = discrepancies.filter(d => d.type === "duration_mismatch");
    const rateMismatches = discrepancies.filter(d => d.type === "rate_mismatch");
    const costMismatches = discrepancies.filter(d => d.type === "cost_mismatch");

    // Calculate monetary impact by category
    const impactFromMissingInA = missingInAWithCost.reduce((sum, d) => sum + (d.cost_difference || 0), 0);
    const impactFromMissingInB = missingInBWithCost.reduce((sum, d) => sum + (d.cost_difference || 0), 0);
    const impactFromDuration = durationMismatches.reduce((sum, d) => sum + (d.cost_difference || 0), 0);
    const impactFromRate = rateMismatches.reduce((sum, d) => sum + (d.cost_difference || 0), 0);
    const impactFromCost = costMismatches.reduce((sum, d) => sum + (d.cost_difference || 0), 0);

    // Calculate summary
    const summary = {
      totalRecordsA: dataA.length,
      totalRecordsB: dataB.length,
      matchedRecords: matches.length,
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
      zeroDurationInYours: zeroDurationInA, // Your 0-sec calls not in provider (likely attempts)
      zeroDurationInProvider: zeroDurationInB, // Provider 0-sec calls not in yours (likely attempts)
      billedMissingInYours: billedMissingInA, // Provider has billed calls you don't - REAL ISSUE
      billedMissingInProvider: billedMissingInB, // You have billed calls they don't - REAL ISSUE
      // Mismatch counts
      durationMismatches: durationMismatches.length,
      rateMismatches: rateMismatches.length,
      costMismatches: costMismatches.length,
      lrnMismatches: lrnMismatchCount,
      totalDiscrepancies: discrepancies.length,
      // Monetary impact breakdown (from discrepancies analysis)
      monetaryImpact: Math.round(discrepancies.reduce((sum, d) => sum + (d.cost_difference || 0), 0) * 100) / 100,
      impactBreakdown: {
        missingInYours: Math.round(impactFromMissingInA * 100) / 100, // Negative = provider billing you
        missingInProvider: Math.round(impactFromMissingInB * 100) / 100, // Positive = you have extra
        durationMismatches: Math.round(impactFromDuration * 100) / 100,
        rateMismatches: Math.round(impactFromRate * 100) / 100,
        costMismatches: Math.round(impactFromCost * 100) / 100,
      },
    };

    console.log("Summary:", summary);

    // Cleanup
    await cleanup();

    // Group discrepancies by type and take a sample from each category
    // This ensures all categories are represented in the UI
    const MAX_TOTAL = 5000;
    const byType: Record<string, Discrepancy[]> = {};

    for (const d of discrepancies) {
      if (!byType[d.type]) byType[d.type] = [];
      byType[d.type].push(d);
    }

    // Sort each category by absolute cost difference (biggest impact first)
    for (const type in byType) {
      byType[type].sort((a, b) => Math.abs(b.cost_difference) - Math.abs(a.cost_difference));
    }

    // Calculate how many to take from each category proportionally
    // But ensure we take at least some from each non-empty category
    const types = Object.keys(byType);
    const totalCount = discrepancies.length;
    const sampledDiscrepancies: Discrepancy[] = [];

    if (totalCount <= MAX_TOTAL) {
      // Return all if under limit
      sampledDiscrepancies.push(...discrepancies);
    } else {
      // Take proportional sample, minimum 100 per category (or all if less than 100)
      const minPerCategory = 100;
      const reservedSlots = types.length * minPerCategory;
      const remainingSlots = MAX_TOTAL - Math.min(reservedSlots, MAX_TOTAL * 0.5);

      for (const type of types) {
        const categoryItems = byType[type];
        const proportion = categoryItems.length / totalCount;
        const proportionalCount = Math.floor(remainingSlots * proportion);
        const takeCount = Math.min(
          categoryItems.length,
          Math.max(minPerCategory, proportionalCount)
        );
        sampledDiscrepancies.push(...categoryItems.slice(0, takeCount));
      }
    }

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
    };

    sampledDiscrepancies.sort((a, b) => {
      const orderA = typeOrder[a.type] || 99;
      const orderB = typeOrder[b.type] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return Math.abs(b.cost_difference) - Math.abs(a.cost_difference);
    });

    // Return results
    return NextResponse.json({
      success: true,
      jobId,
      summary,
      discrepancies: sampledDiscrepancies,
      hasMore: discrepancies.length > sampledDiscrepancies.length,
      totalDiscrepancyCount: discrepancies.length,
    });
  } catch (error) {
    console.error("Processing error:", error);
    await cleanup();

    return NextResponse.json(
      {
        error: "Processing failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
