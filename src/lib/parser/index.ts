import Papa from "papaparse";
import readXlsxFile from "read-excel-file";
import JSZip from "jszip";

// Maximum decompressed file size (500MB) - matches server limit
const MAX_DECOMPRESSED_SIZE = 500 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

export interface ParsedFile {
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    return parseCSV(file);
  } else if (extension === "xlsx" || extension === "xls") {
    return parseXLSX(file);
  } else if (extension === "zip") {
    return parseZIP(file);
  } else if (extension === "gz") {
    return parseGZ(file);
  }

  throw new Error(`Unsupported file format: ${extension}`);
}

async function parseCSV(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const sampleRows: Record<string, string>[] = [];
    let headers: string[] = [];
    let rowCount = 0;
    let lastCursor = 0;
    let aborted = false;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      chunk: (results, parser) => {
        // First chunk - get headers
        if (rowCount === 0 && results.data.length > 0) {
          headers = Object.keys(results.data[0] as Record<string, string>);
        }

        // Collect sample rows (first 50 for column mapping preview)
        for (const row of results.data as Record<string, string>[]) {
          if (sampleRows.length < 50) {
            sampleRows.push(row);
          }
          rowCount++;
        }

        // Track actual bytes processed using cursor position
        lastCursor = results.meta.cursor;

        // Abort early once we have enough samples (save memory on large files)
        if (sampleRows.length >= 50 && rowCount >= 200) {
          aborted = true;
          parser.abort();
        }
      },
      complete: () => {
        let estimatedTotal = rowCount;

        // If we aborted early, estimate total rows based on file size
        if (aborted && lastCursor > 0) {
          const avgBytesPerRow = lastCursor / rowCount;
          estimatedTotal = Math.round(file.size / avgBytesPerRow);
        }

        resolve({
          headers,
          sampleRows,
          totalRows: estimatedTotal,
        });
      },
      error: (error: Error) => reject(error),
    });
  });
}

async function parseXLSX(file: File): Promise<ParsedFile> {
  const rows = await readXlsxFile(file);

  if (rows.length === 0) {
    throw new Error("Empty spreadsheet");
  }

  // First row is headers
  const headers = rows[0].map((cell) => String(cell ?? ""));

  // Data rows (skip header)
  const dataRows = rows.slice(1);

  // Convert to Record format and get sample rows (first 100 for column mapping preview)
  const sampleRows = dataRows.slice(0, 100).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = String(row[index] ?? "");
    });
    return record;
  });

  return {
    headers,
    sampleRows,
    totalRows: dataRows.length,
  };
}

async function parseZIP(file: File): Promise<ParsedFile> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Find supported files in the ZIP (CSV or XLSX)
  const supportedExtensions = [".csv", ".xlsx", ".xls"];
  const entries = Object.keys(zip.files).filter((name) => {
    const lower = name.toLowerCase();
    // Skip directories and macOS metadata files
    if (zip.files[name].dir || lower.includes("__macosx") || lower.startsWith(".")) {
      return false;
    }
    return supportedExtensions.some((ext) => lower.endsWith(ext));
  });

  if (entries.length === 0) {
    throw new Error("No CSV or XLSX files found in ZIP archive");
  }

  // Sort to prefer CSV, then XLSX, and by name for consistency
  entries.sort((a, b) => {
    const aIsCSV = a.toLowerCase().endsWith(".csv");
    const bIsCSV = b.toLowerCase().endsWith(".csv");
    if (aIsCSV && !bIsCSV) return -1;
    if (!aIsCSV && bIsCSV) return 1;
    return a.localeCompare(b);
  });

  // Use the first valid file
  const entryName = entries[0];
  const entry = zip.files[entryName];
  const extension = entryName.split(".").pop()?.toLowerCase();

  // Check uncompressed size before extracting
  // JSZip stores this in _data.uncompressedSize for compressed entries
  const uncompressedSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
  if (uncompressedSize && uncompressedSize > MAX_DECOMPRESSED_SIZE) {
    throw new Error(
      `The file inside this ZIP is too large (${formatFileSize(uncompressedSize)}). Maximum allowed is ${formatFileSize(MAX_DECOMPRESSED_SIZE)}.`
    );
  }

  if (extension === "csv") {
    // Extract as blob and parse as File to use streaming (avoids string length limits)
    const csvBlob = await entry.async("blob");

    // Double-check actual size after extraction
    if (csvBlob.size > MAX_DECOMPRESSED_SIZE) {
      throw new Error(
        `The file inside this ZIP is too large (${formatFileSize(csvBlob.size)}). Maximum allowed is ${formatFileSize(MAX_DECOMPRESSED_SIZE)}.`
      );
    }

    const csvFile = new File([csvBlob], entryName, { type: "text/csv" });
    return parseCSV(csvFile);
  } else if (extension === "xlsx" || extension === "xls") {
    const xlsxBuffer = await entry.async("arraybuffer");
    const blob = new Blob([xlsxBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const extractedFile = new File([blob], entryName);
    return parseXLSX(extractedFile);
  }

  throw new Error(`Unsupported file type in ZIP: ${extension}`);
}

function parseCSVString(csvText: string): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const sampleRows: Record<string, string>[] = [];
    let headers: string[] = [];
    let rowCount = 0;
    let lastCursor = 0;
    let aborted = false;

    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      chunk: (results: Papa.ParseResult<Record<string, string>>, parser: Papa.Parser) => {
        if (rowCount === 0 && results.data.length > 0) {
          headers = Object.keys(results.data[0]);
        }

        for (const row of results.data) {
          if (sampleRows.length < 50) {
            sampleRows.push(row);
          }
          rowCount++;
        }

        // Track cursor position for estimation
        lastCursor = results.meta.cursor;

        // Abort early once we have enough samples
        if (sampleRows.length >= 50 && rowCount >= 200) {
          aborted = true;
          parser.abort();
        }
      },
      complete: () => {
        let estimatedTotal = rowCount;

        // If we aborted early, estimate based on cursor position
        if (aborted && lastCursor > 0) {
          const avgCharsPerRow = lastCursor / rowCount;
          estimatedTotal = Math.round(csvText.length / avgCharsPerRow);
        }

        resolve({
          headers,
          sampleRows,
          totalRows: estimatedTotal,
        });
      },
      error: (error: Error) => reject(error),
    });
  });
}

async function parseGZ(file: File): Promise<ParsedFile> {
  // Get the inner filename by removing .gz extension
  const innerName = file.name.replace(/\.gz$/i, "");
  const innerExt = innerName.split(".").pop()?.toLowerCase();

  // Decompress using the browser's built-in DecompressionStream
  const stream = file.stream().pipeThrough(new DecompressionStream("gzip"));
  const decompressedBlob = await new Response(stream).blob();

  // Check decompressed size
  if (decompressedBlob.size > MAX_DECOMPRESSED_SIZE) {
    throw new Error(
      `The decompressed file is too large (${formatFileSize(decompressedBlob.size)}). Maximum allowed is ${formatFileSize(MAX_DECOMPRESSED_SIZE)}.`
    );
  }

  if (innerExt === "csv") {
    // Convert to File and use streaming parser (avoids string length limits)
    const csvFile = new File([decompressedBlob], innerName, { type: "text/csv" });
    return parseCSV(csvFile);
  } else if (innerExt === "xlsx" || innerExt === "xls") {
    const decompressedFile = new File([decompressedBlob], innerName);
    return parseXLSX(decompressedFile);
  }

  // Default to CSV if no recognizable extension (e.g., just "file.gz")
  const csvFile = new File([decompressedBlob], innerName || "data.csv", { type: "text/csv" });
  return parseCSV(csvFile);
}
