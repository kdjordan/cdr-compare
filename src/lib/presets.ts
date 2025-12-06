import { ColumnMapping } from "@/context/ReconciliationContext";

export type DurationUnit = "seconds" | "milliseconds";
export type RatePrecision = 4 | 5 | 6;

export interface SwitchPreset {
  id: string;
  name: string;
  description: string;
  mapping: ColumnMapping;
  // Column names this preset expects to find (for auto-detection)
  expectedColumns: string[];
  // Duration unit used by this switch
  durationUnit: DurationUnit;
  // Rate precision (decimal places) used by this switch
  ratePrecision: RatePrecision;
}

// Settings that can be overridden by user
export interface PresetSettings {
  durationUnit: DurationUnit;
  ratePrecision: RatePrecision;
}

// Default settings for manual mapping
export const DEFAULT_SETTINGS: PresetSettings = {
  durationUnit: "seconds",
  ratePrecision: 4,
};

export const SWITCH_PRESETS: SwitchPreset[] = [
  {
    id: "veriswitch",
    name: "Veriswitch",
    description: "Veriswitch CDR format",
    mapping: {
      a_number: "ani_out",
      b_number: "dialed",
      seize_time: "seized_time",
      answer_time: "start_time",
      end_time: "stop_time",
      billed_duration: "duration_vendor",
      rate: "vendor_rate",
    },
    expectedColumns: ["ani_out", "dialed", "seized_time", "duration_vendor", "vendor_rate"],
    durationUnit: "seconds",
    ratePrecision: 4,
  },
  {
    id: "sipnav",
    name: "SipNav",
    description: "SipNav CDR format",
    mapping: {
      a_number: "src_number",
      b_number: "dst_number",
      seize_time: "date",
      answer_time: null,
      end_time: null,
      billed_duration: "account_billed_duration",
      rate: "account_rate",
    },
    expectedColumns: ["src_number", "dst_number", "date", "account_billed_duration", "account_rate"],
    durationUnit: "seconds",
    ratePrecision: 4,
  },
];

/**
 * Try to auto-detect which preset matches the given headers
 */
export function detectPreset(headers: string[]): SwitchPreset | null {
  const headerSet = new Set(headers.map(h => h.toLowerCase()));

  for (const preset of SWITCH_PRESETS) {
    const matchCount = preset.expectedColumns.filter(col =>
      headerSet.has(col.toLowerCase())
    ).length;

    // If most expected columns are present, it's likely a match
    if (matchCount >= preset.expectedColumns.length * 0.8) {
      return preset;
    }
  }

  return null;
}

/**
 * Check if a preset's mapping is valid for the given headers
 */
export function isPresetValidForHeaders(preset: SwitchPreset, headers: string[]): boolean {
  const headerSet = new Set(headers);

  // Check required fields
  const requiredFields: (keyof ColumnMapping)[] = ["a_number", "b_number", "seize_time", "billed_duration"];

  for (const field of requiredFields) {
    const mappedColumn = preset.mapping[field];
    if (mappedColumn && !headerSet.has(mappedColumn)) {
      return false;
    }
  }

  return true;
}

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): SwitchPreset | undefined {
  return SWITCH_PRESETS.find(p => p.id === id);
}
