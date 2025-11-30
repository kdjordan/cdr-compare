// Canonical CDR Record
export interface CDRRecord {
  id: string;                    // Generated UUID
  source: 'A' | 'B';            // Which file it came from
  a_number: string;             // Normalized calling number
  b_number: string;             // Normalized called number
  seize_time: Date;             // Call attempt time
  answer_time: Date | null;     // Connect time (null if unanswered)
  end_time: Date;               // Call end time
  billed_duration: number;      // Seconds
  rate: number;                 // Per-minute rate
  raw_data: Record<string, any>; // Original row for reference
}

// Discrepancy Record
export interface Discrepancy {
  id: string;
  type: 'missing_in_a' | 'missing_in_b' | 'duration_mismatch' | 'rate_mismatch';
  record_a: CDRRecord | null;
  record_b: CDRRecord | null;
  difference: {
    field: string;
    value_a: any;
    value_b: any;
    monetary_impact: number;    // Calculated $ difference
  } | null;
}

// Results Summary
export interface ReconciliationResult {
  job_id: string;
  processed_at: Date;
  file_a: {
    name: string;
    total_records: number;
  };
  file_b: {
    name: string;
    total_records: number;
  };
  matched_count: number;
  discrepancies: {
    missing_in_a: number;
    missing_in_b: number;
    duration_mismatch: number;
    rate_mismatch: number;
    total: number;
    monetary_impact: number;
  };
  items: Discrepancy[];
}

// Column Mapping
export interface ColumnMapping {
  a_number: string;
  b_number: string;
  seize_time: string;
  answer_time: string;
  end_time: string;
  billed_duration: string;
  rate: string;
}

// File Upload Info
export interface FileInfo {
  name: string;
  size: number;
  headers: string[];
  sample_rows: any[][];
}

// Upload Response
export interface UploadResponse {
  success: boolean;
  job_id: string;
  file_a: FileInfo;
  file_b: FileInfo;
}

// Process Request
export interface ProcessRequest {
  job_id: string;
  mapping_a: ColumnMapping;
  mapping_b: ColumnMapping;
}

// Processing Progress
export interface ProcessingProgress {
  stage: 'parsing_a' | 'parsing_b' | 'normalizing' | 'matching' | 'generating';
  percent: number;
  message?: string;
}
