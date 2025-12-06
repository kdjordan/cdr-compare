import Papa from "papaparse";
import readXlsxFile from "read-excel-file";
import JSZip from "jszip";

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
  }

  throw new Error(`Unsupported file format: ${extension}`);
}

async function parseCSV(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const sampleRows: Record<string, string>[] = [];
    let headers: string[] = [];
    let rowCount = 0;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      chunk: (results, parser) => {
        // First chunk - get headers
        if (rowCount === 0 && results.data.length > 0) {
          headers = Object.keys(results.data[0] as Record<string, string>);
        }

        // Collect sample rows (first 100 for column mapping preview)
        for (const row of results.data as Record<string, string>[]) {
          if (sampleRows.length < 100) {
            sampleRows.push(row);
          }
          rowCount++;
        }
      },
      complete: () => {
        resolve({
          headers,
          sampleRows,
          totalRows: rowCount,
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

  if (extension === "csv") {
    const csvText = await entry.async("string");
    return parseCSVString(csvText);
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

    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      chunk: (results: Papa.ParseResult<Record<string, string>>) => {
        if (rowCount === 0 && results.data.length > 0) {
          headers = Object.keys(results.data[0]);
        }

        for (const row of results.data) {
          if (sampleRows.length < 100) {
            sampleRows.push(row);
          }
          rowCount++;
        }
      },
      complete: () => {
        resolve({
          headers,
          sampleRows,
          totalRows: rowCount,
        });
      },
      error: (error: Error) => reject(error),
    });
  });
}
