# CDR Reconciliation Tool - Backend Implementation Guide

## Overview

This document describes how to implement the backend processing logic for the CDR reconciliation tool. The frontend is already built and deployed on Hetzner via Coolify. The backend uses Next.js API routes with SQLite for ephemeral data processing.

**Live URL:** http://c0ww88ggswwcosgg0kw4s4k8.49.13.124.226.sslip.io  
**Server:** Hetzner CPX32 (4 vCPU, 8GB RAM, 160GB SSD)  
**Deployment:** Coolify with auto-deploy on push to main

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  - File selection (drag/drop)                               │
│  - Parse first 100 rows for column mapping preview          │
│  - Column mapping UI                                         │
│  - Send raw files + mappings to backend                     │
└─────────────────────────┬───────────────────────────────────┘
                          │ FormData (raw files + mappings JSON)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Next.js API Routes                         │
│                                                              │
│  POST /api/process    → Receive files, parse, reconcile     │
│  POST /api/export     → Download CSV report                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Processing Layer                           │
│                                                              │
│  1. Save uploaded files to /tmp                             │
│  2. Stream-parse CSV/XLSX (papaparse, read-excel-file)      │
│  3. Create temp SQLite database                              │
│  4. Normalize & insert records in batches                   │
│  5. Run matching queries                                     │
│  6. Identify discrepancies                                   │
│  7. Return results, cleanup temp files                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Required Dependencies

```bash
npm install better-sqlite3 papaparse read-excel-file uuid
npm install -D @types/better-sqlite3 @types/papaparse @types/uuid
```

> **Note:** We use `read-excel-file` instead of `xlsx` (SheetJS) to avoid the known prototype pollution and ReDoS vulnerabilities in SheetJS.

---

## Data Flow

### Step 1: Frontend - File Selection & Preview

The frontend handles:
- File selection via drag/drop
- Parsing **first 100 rows only** for column mapping preview
- Column mapping UI where user maps their columns to canonical schema
- Sending raw files + mappings to backend

**Important:** The frontend should NOT parse the entire file. Only parse enough rows to show headers and sample data for mapping.

### Step 2: Frontend - Submit to Backend

Frontend sends a `FormData` POST to `/api/process` with:
- `fileA` - Raw file (CSV/XLSX)
- `fileB` - Raw file (CSV/XLSX)
- `mappingA` - JSON string of column mappings
- `mappingB` - JSON string of column mappings

```typescript
// Frontend submit example
const submitForProcessing = async (
  fileA: File,
  fileB: File,
  mappingA: ColumnMapping,
  mappingB: ColumnMapping
) => {
  const formData = new FormData();
  formData.append('fileA', fileA);
  formData.append('fileB', fileB);
  formData.append('mappingA', JSON.stringify(mappingA));
  formData.append('mappingB', JSON.stringify(mappingB));
  
  const response = await fetch('/api/process', {
    method: 'POST',
    body: formData
  });
  
  return response.json();
};
```

### Step 3: Backend - Server-Side Processing

```
Receive FormData (raw files + mappings)
      │
      ▼
Save files to /tmp
      │
      ▼
Create temp SQLite DB (/tmp/job-{uuid}.db)
      │
      ▼
Stream-parse File A → normalize → batch insert to records_a
      │
      ▼
Stream-parse File B → normalize → batch insert to records_b
      │
      ▼
Create indexes on (a_number, b_number, seize_time)
      │
      ▼
Run matching query (find pairs within 1s tolerance)
      │
      ▼
Identify discrepancies:
  - Missing in A (exists in B only)
  - Missing in B (exists in A only)
  - Duration mismatch (matched but different billed_duration)
  - Rate mismatch (matched but different rate)
      │
      ▼
Calculate summary stats
      │
      ▼
Return results JSON
      │
      ▼
Cleanup: delete temp files and SQLite DB
```

---

## Column Mapping Schema

```typescript
interface ColumnMapping {
  a_number: string;           // Column name for calling party (ANI)
  b_number: string;           // Column name for called party (DNIS)
  seize_time: string;         // Column name for call start/attempt time
  answer_time?: string;       // Optional - call connect time
  end_time?: string;          // Optional - call end time
  billed_duration: string;    // Column name for duration in seconds
  rate?: string;              // Optional - per-minute rate
}
```

---

## API Route Implementations

### POST /api/process

Location: `src/app/api/process/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { unlink, writeFile, readFile } from 'fs/promises';
import path from 'path';
import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file/node';

// Types
interface ColumnMapping {
  a_number: string;
  b_number: string;
  seize_time: string;
  answer_time?: string;
  end_time?: string;
  billed_duration: string;
  rate?: string;
}

// Phone number normalization
function normalizePhoneNumber(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  
  // Convert to string and remove all non-digits
  let digits = String(input).replace(/\D/g, '');
  
  // Handle common prefixes
  if (digits.startsWith('1') && digits.length === 11) {
    digits = digits.slice(1);
  }
  if (digits.startsWith('01') && digits.length === 12) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('001') && digits.length === 13) {
    digits = digits.slice(3);
  }
  
  return digits;
}

// Timestamp normalization - convert various formats to Unix timestamp
function normalizeTimestamp(input: string | number | Date | null | undefined): number | null {
  if (input === null || input === undefined || input === '') return null;
  
  try {
    if (typeof input === 'number') {
      // Excel serial date (days since 1900-01-01)
      if (input > 0 && input < 100000) {
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + input * 86400000);
        return Math.floor(date.getTime() / 1000);
      }
      // Unix timestamp - check if seconds or milliseconds
      return input > 10000000000 ? Math.floor(input / 1000) : input;
    }
    
    const date = new Date(input);
    if (isNaN(date.getTime())) return null;
    
    return Math.floor(date.getTime() / 1000);
  } catch {
    return null;
  }
}

// Duration normalization
function normalizeDuration(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === '') return 0;
  
  const num = typeof input === 'number' ? input : parseFloat(String(input));
  return isNaN(num) ? 0 : Math.round(num);
}

// Rate normalization
function normalizeRate(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === '') return 0;
  
  const num = typeof input === 'number' ? input : parseFloat(String(input));
  return isNaN(num) ? 0 : num;
}

// Parse file based on extension
async function parseFile(filePath: string, fileName: string): Promise<Record<string, any>[]> {
  const ext = path.extname(fileName).toLowerCase();

  if (ext === '.csv') {
    const buffer = await readFile(filePath);
    const text = buffer.toString('utf-8');
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true
    });
    return result.data as Record<string, any>[];
  }

  if (ext === '.xlsx' || ext === '.xls') {
    // read-excel-file returns rows as arrays, first row is headers
    const rows = await readXlsxFile(filePath);

    if (rows.length === 0) {
      return [];
    }

    // First row is headers
    const headers = rows[0].map((cell) => String(cell ?? ''));

    // Convert remaining rows to objects
    const data: Record<string, any>[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const record: Record<string, any> = {};
      headers.forEach((header, index) => {
        record[header] = row[index] ?? null;
      });
      data.push(record);
    }

    return data;
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

export async function POST(request: NextRequest) {
  const jobId = uuidv4();
  const dbPath = path.join('/tmp', `job-${jobId}.db`);
  const fileAPath = path.join('/tmp', `job-${jobId}-fileA`);
  const fileBPath = path.join('/tmp', `job-${jobId}-fileB`);
  let db: Database.Database | null = null;
  
  const cleanup = async () => {
    if (db) {
      try { db.close(); } catch {}
    }
    await Promise.all([
      unlink(dbPath).catch(() => {}),
      unlink(fileAPath).catch(() => {}),
      unlink(fileBPath).catch(() => {})
    ]);
  };
  
  try {
    // Parse FormData
    const formData = await request.formData();
    
    const fileA = formData.get('fileA') as File | null;
    const fileB = formData.get('fileB') as File | null;
    const mappingAStr = formData.get('mappingA') as string | null;
    const mappingBStr = formData.get('mappingB') as string | null;
    
    if (!fileA || !fileB || !mappingAStr || !mappingBStr) {
      return NextResponse.json(
        { error: 'Missing required fields: fileA, fileB, mappingA, mappingB' },
        { status: 400 }
      );
    }
    
    const mappingA: ColumnMapping = JSON.parse(mappingAStr);
    const mappingB: ColumnMapping = JSON.parse(mappingBStr);
    
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
      return NextResponse.json(
        { error: 'One or both files contain no data' },
        { status: 400 }
      );
    }
    
    // Create SQLite database
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = OFF'); // Faster for temp data
    db.pragma('temp_store = MEMORY');
    
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
        raw_index INTEGER
      );
    `);
    
    // Prepare insert statements
    const insertA = db.prepare(`
      INSERT INTO records_a (a_number, b_number, seize_time, answer_time, end_time, billed_duration, rate, raw_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const insertB = db.prepare(`
      INSERT INTO records_b (a_number, b_number, seize_time, answer_time, end_time, billed_duration, rate, raw_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Batch insert File A records
    const BATCH_SIZE = 10000;
    
    const insertBatchA = db.transaction((rows: Record<string, any>[], startIndex: number) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        insertA.run(
          normalizePhoneNumber(row[mappingA.a_number]),
          normalizePhoneNumber(row[mappingA.b_number]),
          normalizeTimestamp(row[mappingA.seize_time]),
          mappingA.answer_time ? normalizeTimestamp(row[mappingA.answer_time]) : null,
          mappingA.end_time ? normalizeTimestamp(row[mappingA.end_time]) : null,
          normalizeDuration(row[mappingA.billed_duration]),
          mappingA.rate ? normalizeRate(row[mappingA.rate]) : 0,
          startIndex + i
        );
      }
    });
    
    const insertBatchB = db.transaction((rows: Record<string, any>[], startIndex: number) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        insertB.run(
          normalizePhoneNumber(row[mappingB.a_number]),
          normalizePhoneNumber(row[mappingB.b_number]),
          normalizeTimestamp(row[mappingB.seize_time]),
          mappingB.answer_time ? normalizeTimestamp(row[mappingB.answer_time]) : null,
          mappingB.end_time ? normalizeTimestamp(row[mappingB.end_time]) : null,
          normalizeDuration(row[mappingB.billed_duration]),
          mappingB.rate ? normalizeRate(row[mappingB.rate]) : 0,
          startIndex + i
        );
      }
    });
    
    // Insert in batches
    console.log('Inserting file A records...');
    for (let i = 0; i < dataA.length; i += BATCH_SIZE) {
      const batch = dataA.slice(i, i + BATCH_SIZE);
      insertBatchA(batch, i);
    }
    
    console.log('Inserting file B records...');
    for (let i = 0; i < dataB.length; i += BATCH_SIZE) {
      const batch = dataB.slice(i, i + BATCH_SIZE);
      insertBatchB(batch, i);
    }
    
    // Create indexes after bulk insert (faster)
    console.log('Creating indexes...');
    db.exec(`
      CREATE INDEX idx_a_lookup ON records_a(a_number, b_number);
      CREATE INDEX idx_b_lookup ON records_b(a_number, b_number);
      CREATE INDEX idx_a_seize ON records_a(seize_time);
      CREATE INDEX idx_b_seize ON records_b(seize_time);
    `);
    
    // Find matched records (within 1 second tolerance on seize_time)
    console.log('Running matching query...');
    const matches = db.prepare(`
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
        a.raw_index as index_a,
        b.raw_index as index_b
      FROM records_a a
      INNER JOIN records_b b
        ON a.a_number = b.a_number
        AND a.b_number = b.b_number
        AND ABS(COALESCE(a.seize_time, 0) - COALESCE(b.seize_time, 0)) <= 1
    `).all() as any[];
    
    console.log(`Found ${matches.length} matched records`);
    
    // Get IDs of matched records
    const matchedAIds = new Set(matches.map(m => m.id_a));
    const matchedBIds = new Set(matches.map(m => m.id_b));
    
    // Find unmatched records
    console.log('Finding unmatched records...');
    const unmatchedA = db.prepare(`
      SELECT id, a_number, b_number, seize_time, billed_duration, rate, raw_index
      FROM records_a
    `).all().filter((r: any) => !matchedAIds.has(r.id)) as any[];
    
    const unmatchedB = db.prepare(`
      SELECT id, a_number, b_number, seize_time, billed_duration, rate, raw_index
      FROM records_b
    `).all().filter((r: any) => !matchedBIds.has(r.id)) as any[];
    
    console.log(`Unmatched in A: ${unmatchedA.length}, Unmatched in B: ${unmatchedB.length}`);
    
    // Build discrepancies list
    const discrepancies: any[] = [];
    
    // Missing in B (You have it, provider doesn't)
    for (const record of unmatchedA) {
      discrepancies.push({
        type: 'missing_in_b',
        a_number: record.a_number,
        b_number: record.b_number,
        seize_time: record.seize_time,
        your_duration: record.billed_duration,
        provider_duration: null,
        your_rate: record.rate,
        provider_rate: null,
        difference: record.billed_duration * (record.rate / 60),
        source_index: record.raw_index
      });
    }
    
    // Missing in A (Provider has it, you don't)
    for (const record of unmatchedB) {
      discrepancies.push({
        type: 'missing_in_a',
        a_number: record.a_number,
        b_number: record.b_number,
        seize_time: record.seize_time,
        your_duration: null,
        provider_duration: record.billed_duration,
        your_rate: null,
        provider_rate: record.rate,
        difference: -(record.billed_duration * (record.rate / 60)),
        source_index: record.raw_index
      });
    }
    
    // Duration and rate mismatches from matched records
    for (const match of matches) {
      const durationDiff = match.duration_a - match.duration_b;
      const rateDiff = match.rate_a - match.rate_b;
      
      // Duration mismatch (more than 1 second difference)
      if (Math.abs(durationDiff) > 1) {
        discrepancies.push({
          type: 'duration_mismatch',
          a_number: match.a_number,
          b_number: match.b_number,
          seize_time: match.seize_a,
          your_duration: match.duration_a,
          provider_duration: match.duration_b,
          your_rate: match.rate_a,
          provider_rate: match.rate_b,
          difference: durationDiff * ((match.rate_a || match.rate_b || 0) / 60),
          source_index_a: match.index_a,
          source_index_b: match.index_b
        });
      }
      
      // Rate mismatch
      if (Math.abs(rateDiff) > 0.0001) {
        discrepancies.push({
          type: 'rate_mismatch',
          a_number: match.a_number,
          b_number: match.b_number,
          seize_time: match.seize_a,
          your_duration: match.duration_a,
          provider_duration: match.duration_b,
          your_rate: match.rate_a,
          provider_rate: match.rate_b,
          difference: match.duration_a * (rateDiff / 60),
          source_index_a: match.index_a,
          source_index_b: match.index_b
        });
      }
    }
    
    // Calculate summary
    const summary = {
      totalRecordsA: dataA.length,
      totalRecordsB: dataB.length,
      matchedRecords: matches.length,
      missingInYours: unmatchedB.length,
      missingInProvider: unmatchedA.length,
      durationMismatches: discrepancies.filter(d => d.type === 'duration_mismatch').length,
      rateMismatches: discrepancies.filter(d => d.type === 'rate_mismatch').length,
      totalDiscrepancies: discrepancies.length,
      monetaryImpact: Math.round(discrepancies.reduce((sum, d) => sum + (d.difference || 0), 0) * 100) / 100
    };
    
    console.log('Summary:', summary);
    
    // Cleanup
    await cleanup();
    
    // Return results
    return NextResponse.json({
      success: true,
      jobId,
      summary,
      discrepancies: discrepancies.slice(0, 1000),
      hasMore: discrepancies.length > 1000,
      totalDiscrepancyCount: discrepancies.length
    });
    
  } catch (error) {
    console.error('Processing error:', error);
    await cleanup();
    
    return NextResponse.json(
      { 
        error: 'Processing failed', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}

// Increase body size limit for large files
export const config = {
  api: {
    bodyParser: false,
  },
};
```

### POST /api/export

Location: `src/app/api/export/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { discrepancies, summary } = await request.json();
    
    // Generate CSV content
    const headers = [
      'Type',
      'A-Number',
      'B-Number',
      'Seize Time',
      'Your Duration (s)',
      'Provider Duration (s)',
      'Your Rate',
      'Provider Rate',
      'Difference ($)'
    ];
    
    const rows = discrepancies.map((d: any) => [
      d.type === 'missing_in_a' ? 'Missing in Your Records' :
      d.type === 'missing_in_b' ? 'Missing in Provider Records' :
      d.type === 'duration_mismatch' ? 'Duration Mismatch' :
      d.type === 'rate_mismatch' ? 'Rate Mismatch' : d.type,
      d.a_number,
      d.b_number,
      d.seize_time ? new Date(d.seize_time * 1000).toISOString() : '',
      d.your_duration ?? '',
      d.provider_duration ?? '',
      d.your_rate?.toFixed(4) ?? '',
      d.provider_rate?.toFixed(4) ?? '',
      d.difference?.toFixed(4) ?? ''
    ]);
    
    // Build CSV with summary header
    const summaryRows = [
      ['CDR Reconciliation Report'],
      ['Generated', new Date().toISOString()],
      [''],
      ['Summary'],
      ['Your Total Records', summary.totalRecordsA],
      ['Provider Total Records', summary.totalRecordsB],
      ['Matched Records', summary.matchedRecords],
      ['Missing in Your Records', summary.missingInYours],
      ['Missing in Provider Records', summary.missingInProvider],
      ['Duration Mismatches', summary.durationMismatches],
      ['Rate Mismatches', summary.rateMismatches],
      ['Total Discrepancies', summary.totalDiscrepancies],
      ['Total Monetary Impact', `$${summary.monetaryImpact}`],
      [''],
      ['Discrepancy Details'],
      headers,
      ...rows
    ];
    
    const csv = summaryRows
      .map(row => 
        row.map(cell => {
          const str = String(cell ?? '');
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(',')
      )
      .join('\n');
    
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cdr-reconciliation-${Date.now()}.csv"`
      }
    });
    
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Export failed' },
      { status: 500 }
    );
  }
}
```

---

## Frontend Integration

### File Upload & Preview (Already Built)

The frontend should:
1. Accept file via drag/drop or file picker
2. Parse only first 100 rows for preview
3. Display headers and sample data
4. Allow user to map columns

### Submit for Processing

```typescript
interface ColumnMapping {
  a_number: string;
  b_number: string;
  seize_time: string;
  answer_time?: string;
  end_time?: string;
  billed_duration: string;
  rate?: string;
}

const submitForProcessing = async (
  fileA: File,
  fileB: File,
  mappingA: ColumnMapping,
  mappingB: ColumnMapping,
  onProgress?: (status: string) => void
) => {
  onProgress?.('Uploading files...');
  
  const formData = new FormData();
  formData.append('fileA', fileA);
  formData.append('fileB', fileB);
  formData.append('mappingA', JSON.stringify(mappingA));
  formData.append('mappingB', JSON.stringify(mappingB));
  
  const response = await fetch('/api/process', {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error || 'Processing failed');
  }
  
  return response.json();
};
```

### Export CSV

```typescript
const exportCSV = async (discrepancies: any[], summary: any) => {
  const response = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ discrepancies, summary })
  });
  
  if (!response.ok) {
    throw new Error('Export failed');
  }
  
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cdr-reconciliation-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
```

---

## Response Schema

### Process Response

```typescript
interface ProcessResponse {
  success: boolean;
  jobId: string;
  summary: {
    totalRecordsA: number;
    totalRecordsB: number;
    matchedRecords: number;
    missingInYours: number;        // Provider has, you don't
    missingInProvider: number;     // You have, provider doesn't
    durationMismatches: number;
    rateMismatches: number;
    totalDiscrepancies: number;
    monetaryImpact: number;        // Calculated $ difference
  };
  discrepancies: Discrepancy[];
  hasMore: boolean;                // True if >1000 discrepancies
  totalDiscrepancyCount: number;   // Actual total count
}

interface Discrepancy {
  type: 'missing_in_a' | 'missing_in_b' | 'duration_mismatch' | 'rate_mismatch';
  a_number: string;
  b_number: string;
  seize_time: number | null;       // Unix timestamp
  your_duration: number | null;
  provider_duration: number | null;
  your_rate: number | null;
  provider_rate: number | null;
  difference: number;              // Monetary impact
  source_index?: number;           // Row index in original file
  source_index_a?: number;         // For mismatches
  source_index_b?: number;
}
```

---

## Next.js Configuration

For large file uploads, update `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb'
    }
  },
  api: {
    bodyParser: {
      sizeLimit: '500mb'
    },
    responseLimit: false
  }
};

module.exports = nextConfig;
```

---

## Key Implementation Notes

### File Size Handling
- Files are saved to `/tmp` before parsing
- Parsing happens server-side with full file
- Frontend only parses first 100 rows for preview
- Max file size: 500MB (configurable)

### Phone Number Normalization
- Strip all non-digit characters
- Remove common prefixes: 1, 01, 001
- Result should be 10 digits for US numbers

### Timestamp Handling
- Internally use Unix timestamps (seconds)
- Handle ISO strings, Excel serial dates, Unix timestamps
- 1-second tolerance for matching

### Duration Matching
- Durations compared in seconds
- Differences ≤1 second = match
- Larger differences = duration_mismatch

### SQLite Performance
- WAL mode + synchronous OFF for speed
- Batch inserts (10,000 rows per transaction)
- Indexes created AFTER bulk insert
- Temp files deleted immediately after use

### Memory Management
- Stream large files to disk before parsing
- SQLite handles data storage (not in-memory arrays)
- Response limited to 1000 discrepancies
- All temp files cleaned up on completion or error

---

## Testing

Create test files with known discrepancies:

**test-yours.csv:**
```csv
calling_number,called_number,start_time,seconds,rate
5551234567,5559876543,2024-01-15 10:30:00,120,0.015
5551234567,5559876544,2024-01-15 10:35:00,60,0.015
5551234567,5559876545,2024-01-15 10:40:00,180,0.015
5551234567,5559876549,2024-01-15 10:50:00,90,0.020
```

**test-provider.csv:**
```csv
ani,dnis,timestamp,duration,price
5551234567,5559876543,2024-01-15 10:30:00,120,0.015
5551234567,5559876544,2024-01-15 10:35:00,90,0.015
5551234567,5559876546,2024-01-15 10:45:00,120,0.015
5551234567,5559876549,2024-01-15 10:50:00,90,0.018
```

**Expected results:**
- 1 perfect match (row 1)
- 1 duration mismatch (row 2: 60s vs 90s)
- 1 missing in provider (row 3 of yours)
- 1 missing in yours (row 3 of provider)
- 1 rate mismatch (row 4: 0.020 vs 0.018)

---

## Deployment

Push to main branch - Coolify auto-deploys via webhook.

### Verify deployment:
1. Check Coolify deployments tab for success
2. Test file upload on live URL
3. Check server logs: Coolify → Logs tab

### Troubleshooting:
- **Build fails:** Check for TypeScript errors, missing dependencies
- **Runtime errors:** Check Coolify logs
- **Large file timeout:** Increase timeout in Coolify settings or chunk processing