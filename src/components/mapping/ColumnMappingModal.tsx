"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, AlertCircle, Zap } from "lucide-react";
import { ColumnMapping, FileSettings, DurationUnit, RatePrecision, Timezone, DEFAULT_FILE_SETTINGS } from "@/context/ReconciliationContext";
import { detectPreset, SwitchPreset } from "@/lib/presets";

// Time field groups - selecting one hides the others in the group
const TIME_FIELD_GROUPS = {
  seize: {
    datetime: "seize_datetime",
    date: "seize_date",
    time: "seize_time_only",
    required: true,
  },
  answer: {
    datetime: "answer_datetime",
    date: "answer_date",
    time: "answer_time_only",
    required: false,
  },
  end: {
    datetime: "end_datetime",
    date: "end_date",
    time: "end_time_only",
    required: false,
  },
} as const;

const CANONICAL_FIELDS = [
  { key: "a_number", label: "Calling Number", hint: "ANI, A-Number, Source", required: true, group: null },
  { key: "b_number", label: "Called Number", hint: "DNIS, B-Number, Destination", required: true, group: null },
  // Seize time group
  { key: "seize_datetime", label: "Seize Day/Time", hint: "Combined day and time", required: false, group: "seize" },
  { key: "seize_date", label: "Seize Day", hint: "Day only (use with Seize Time)", required: false, group: "seize" },
  { key: "seize_time_only", label: "Seize Time", hint: "Time only (use with Seize Day)", required: false, group: "seize" },
  // Answer time group
  { key: "answer_datetime", label: "Answer Day/Time", hint: "Combined day and time", required: false, group: "answer" },
  { key: "answer_date", label: "Answer Day", hint: "Day only", required: false, group: "answer" },
  { key: "answer_time_only", label: "Answer Time", hint: "Time only", required: false, group: "answer" },
  // End time group
  { key: "end_datetime", label: "End Day/Time", hint: "Combined day and time", required: false, group: "end" },
  { key: "end_date", label: "End Day", hint: "Day only", required: false, group: "end" },
  { key: "end_time_only", label: "End Time", hint: "Time only", required: false, group: "end" },
  // Other fields
  { key: "billed_duration", label: "Duration", hint: "Seconds billed", required: true, group: null },
  { key: "rate", label: "Rate", hint: "Per-minute rate", required: true, group: null },
  { key: "lrn", label: "LRN", hint: "Location Routing Number", required: true, group: null },
] as const;

interface ColumnMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mapping: ColumnMapping, settings: FileSettings) => void;
  fileName: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  fileLabel: string;
}

export function ColumnMappingModal({
  isOpen,
  onClose,
  onConfirm,
  fileName,
  headers,
  sampleRows,
  fileLabel,
}: ColumnMappingModalProps) {
  const [mapping, setMapping] = useState<Record<string, string | null>>(() => {
    const initial: Record<string, string | null> = {};
    CANONICAL_FIELDS.forEach((field) => {
      initial[field.key] = null;
    });
    return initial;
  });

  const [detectedPreset, setDetectedPreset] = useState<SwitchPreset | null>(null);

  // File settings (duration unit, rate precision)
  const [settings, setSettings] = useState<FileSettings>(DEFAULT_FILE_SETTINGS);

  // Auto-detect preset on mount
  useEffect(() => {
    if (headers.length > 0) {
      const detected = detectPreset(headers);
      setDetectedPreset(detected);
      if (detected) {
        // Auto-apply the detected preset
        applyPresetMapping(detected);
      }
    }
  }, [headers]);

  // Apply preset mapping (maps old format to new format)
  const applyPresetMapping = (preset: SwitchPreset) => {
    const newMapping: Record<string, string | null> = {};
    CANONICAL_FIELDS.forEach((field) => {
      newMapping[field.key] = null;
    });

    // Map simple fields
    if (preset.mapping.a_number && headers.includes(preset.mapping.a_number)) {
      newMapping.a_number = preset.mapping.a_number;
    }
    if (preset.mapping.b_number && headers.includes(preset.mapping.b_number)) {
      newMapping.b_number = preset.mapping.b_number;
    }
    if (preset.mapping.billed_duration && headers.includes(preset.mapping.billed_duration)) {
      newMapping.billed_duration = preset.mapping.billed_duration;
    }
    if (preset.mapping.rate && headers.includes(preset.mapping.rate)) {
      newMapping.rate = preset.mapping.rate;
    }
    if (preset.mapping.lrn && headers.includes(preset.mapping.lrn)) {
      newMapping.lrn = preset.mapping.lrn;
    }

    // Map time fields - presets use seize_time which is typically datetime
    if (preset.mapping.seize_time && headers.includes(preset.mapping.seize_time)) {
      newMapping.seize_datetime = preset.mapping.seize_time;
    }
    if (preset.mapping.answer_time && headers.includes(preset.mapping.answer_time)) {
      newMapping.answer_datetime = preset.mapping.answer_time;
    }
    if (preset.mapping.end_time && headers.includes(preset.mapping.end_time)) {
      newMapping.end_datetime = preset.mapping.end_time;
    }

    setMapping(newMapping);
    setSettings({
      durationUnit: preset.durationUnit,
      ratePrecision: preset.ratePrecision,
      timezone: "GMT+0",
    });
  };

  // Track which header is assigned to which field (reverse lookup)
  const headerToField = useMemo(() => {
    const map: Record<string, string> = {};
    Object.entries(mapping).forEach(([fieldKey, headerValue]) => {
      if (headerValue) {
        map[headerValue] = fieldKey;
      }
    });
    return map;
  }, [mapping]);

  // Determine which fields should be hidden based on mutual exclusivity
  const hiddenFields = useMemo(() => {
    const hidden = new Set<string>();

    Object.values(TIME_FIELD_GROUPS).forEach((group) => {
      const datetimeSelected = mapping[group.datetime] !== null;
      const dateSelected = mapping[group.date] !== null;
      const timeSelected = mapping[group.time] !== null;

      if (datetimeSelected) {
        // If datetime is selected, hide date and time
        hidden.add(group.date);
        hidden.add(group.time);
      } else if (dateSelected || timeSelected) {
        // If date OR time is selected, hide datetime
        hidden.add(group.datetime);
      }
    });

    return hidden;
  }, [mapping]);

  // Get available fields for a specific header's dropdown
  const getAvailableFields = (currentHeader: string) => {
    const assignedField = headerToField[currentHeader];
    return CANONICAL_FIELDS.filter((field) => {
      // Don't show hidden fields
      if (hiddenFields.has(field.key)) return false;
      // Include if: not assigned anywhere, OR assigned to this header
      return mapping[field.key] === null || mapping[field.key] === currentHeader;
    });
  };

  const handleFieldSelect = (header: string, fieldKey: string | null) => {
    setMapping((prev) => {
      const newMapping = { ...prev };

      // If selecting a field, first clear it from any other header
      if (fieldKey) {
        Object.keys(newMapping).forEach((key) => {
          if (newMapping[key] === header) {
            newMapping[key] = null;
          }
        });
        newMapping[fieldKey] = header;
      } else {
        // Clearing: find which field was assigned to this header and clear it
        Object.keys(newMapping).forEach((key) => {
          if (newMapping[key] === header) {
            newMapping[key] = null;
          }
        });
      }

      return newMapping;
    });
  };

  // Check if a time group is satisfied (datetime OR both date+time)
  const isTimeGroupSatisfied = (group: typeof TIME_FIELD_GROUPS.seize) => {
    const hasDatetime = mapping[group.datetime] !== null;
    const hasDate = mapping[group.date] !== null;
    const hasTime = mapping[group.time] !== null;
    return hasDatetime || (hasDate && hasTime);
  };

  // Validation: check required fields
  const simpleRequiredFields = CANONICAL_FIELDS
    .filter((f) => f.required && f.group === null)
    .map((f) => f.key);

  const simpleFieldsValid = simpleRequiredFields.every((key) => mapping[key] !== null);
  const seizeValid = isTimeGroupSatisfied(TIME_FIELD_GROUPS.seize);
  const isValid = simpleFieldsValid && seizeValid;

  // Count for progress display
  const requiredCount = simpleRequiredFields.length + 1; // +1 for seize time group
  const satisfiedCount = simpleRequiredFields.filter((key) => mapping[key] !== null).length + (seizeValid ? 1 : 0);

  // Get list of missing required fields for display
  const getMissingFields = (): string[] => {
    const missing: string[] = [];

    // Check simple required fields
    simpleRequiredFields.forEach((key) => {
      if (mapping[key] === null) {
        const field = CANONICAL_FIELDS.find((f) => f.key === key);
        if (field) missing.push(field.label);
      }
    });

    // Check seize time group
    if (!seizeValid) {
      missing.push("Seize Day/Time");
    }

    return missing;
  };

  const missingFields = getMissingFields();

  const handleConfirm = () => {
    // Map internal UI fields back to the backend ColumnMapping format
    const columnMapping: ColumnMapping = {
      a_number: mapping.a_number,
      b_number: mapping.b_number,
      // Seize: if datetime is set, use it; otherwise use date with time as alt
      seize_time: mapping.seize_datetime || mapping.seize_date,
      seize_time_alt: mapping.seize_datetime ? null : mapping.seize_time_only,
      // Answer: same logic
      answer_time: mapping.answer_datetime || mapping.answer_date || null,
      answer_time_alt: mapping.answer_datetime ? null : mapping.answer_time_only,
      // End: same logic
      end_time: mapping.end_datetime || mapping.end_date || null,
      end_time_alt: mapping.end_datetime ? null : mapping.end_time_only,
      billed_duration: mapping.billed_duration,
      rate: mapping.rate,
      lrn: mapping.lrn,
    };
    onConfirm(columnMapping, settings);
  };

  // Get validation message for time groups
  const getTimeGroupStatus = (group: typeof TIME_FIELD_GROUPS.seize, name: string) => {
    const hasDatetime = mapping[group.datetime] !== null;
    const hasDate = mapping[group.date] !== null;
    const hasTime = mapping[group.time] !== null;

    if (hasDatetime) return null; // Valid
    if (hasDate && hasTime) return null; // Valid
    if (hasDate && !hasTime) return `${name} Day selected - also select ${name} Time`;
    if (!hasDate && hasTime) return `${name} Time selected - also select ${name} Day`;
    if (group.required) return `Select ${name} Day/Time or both ${name} Day and ${name} Time`;
    return null;
  };

  const seizeStatus = getTimeGroupStatus(TIME_FIELD_GROUPS.seize, "Seize");

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl bg-gradient-to-b from-card to-background border border-border shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight">
                Map Columns: {fileLabel}
              </h2>
              <p className="text-sm text-muted-foreground mt-1 font-mono">
                {fileName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-lg bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Format Detection / Clear */}
          <div className="px-6 py-3 bg-accent/10 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {detectedPreset ? (
                  <>
                    <Zap className="w-4 h-4 text-accent" />
                    <span className="text-sm font-medium">Detected Format:</span>
                    <span className="text-sm text-accent bg-accent/20 px-2 py-1 rounded font-medium">
                      {detectedPreset.name}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-muted-foreground">No format detected - map columns manually</span>
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  const cleared: Record<string, string | null> = {};
                  CANONICAL_FIELDS.forEach((field) => {
                    cleared[field.key] = null;
                  });
                  setMapping(cleared);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Data Settings */}
          <div className="px-6 py-3 bg-muted/20 border-b border-border">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground">Duration:</span>
                <select
                  value={settings.durationUnit}
                  onChange={(e) => setSettings(prev => ({ ...prev, durationUnit: e.target.value as DurationUnit }))}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <option value="seconds">Seconds</option>
                  <option value="milliseconds">Milliseconds</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground">Rate:</span>
                <select
                  value={settings.ratePrecision}
                  onChange={(e) => setSettings(prev => ({ ...prev, ratePrecision: parseInt(e.target.value) as RatePrecision }))}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <option value="4">4 decimals</option>
                  <option value="5">5 decimals</option>
                  <option value="6">6 decimals</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground">Timezone:</span>
                <select
                  value={settings.timezone}
                  onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value as Timezone }))}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <option value="GMT-12">GMT-12</option>
                  <option value="GMT-11">GMT-11</option>
                  <option value="GMT-10">GMT-10</option>
                  <option value="GMT-9">GMT-9</option>
                  <option value="GMT-8">GMT-8</option>
                  <option value="GMT-7">GMT-7</option>
                  <option value="GMT-6">GMT-6</option>
                  <option value="GMT-5">GMT-5</option>
                  <option value="GMT-4">GMT-4</option>
                  <option value="GMT-3">GMT-3</option>
                  <option value="GMT-2">GMT-2</option>
                  <option value="GMT-1">GMT-1</option>
                  <option value="GMT+0">GMT+0</option>
                  <option value="GMT+1">GMT+1</option>
                  <option value="GMT+2">GMT+2</option>
                  <option value="GMT+3">GMT+3</option>
                  <option value="GMT+4">GMT+4</option>
                  <option value="GMT+5">GMT+5</option>
                  <option value="GMT+5:30">GMT+5:30</option>
                  <option value="GMT+6">GMT+6</option>
                  <option value="GMT+7">GMT+7</option>
                  <option value="GMT+8">GMT+8</option>
                  <option value="GMT+9">GMT+9</option>
                  <option value="GMT+9:30">GMT+9:30</option>
                  <option value="GMT+10">GMT+10</option>
                  <option value="GMT+11">GMT+11</option>
                  <option value="GMT+12">GMT+12</option>
                  <option value="GMT+13">GMT+13</option>
                  <option value="GMT+14">GMT+14</option>
                </select>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-4 text-xs">
                <span className="text-muted-foreground">
                  Progress: <span className="text-accent font-medium">{satisfiedCount}/{requiredCount}</span> required
                </span>
              </div>
            </div>
          </div>

          {/* Scrollable content - fixed height for ~5 rows visible, scroll for more */}
          <div className="overflow-x-auto overflow-y-auto max-h-[300px]">
            <table className="w-full">
              {/* Dropdown row */}
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {headers.map((header) => {
                    const assignedField = headerToField[header];
                    const fieldInfo = CANONICAL_FIELDS.find((f) => f.key === assignedField);
                    const availableFields = getAvailableFields(header);

                    return (
                      <th key={header} className="p-3 min-w-[160px]">
                        <select
                          value={assignedField || ""}
                          onChange={(e) => handleFieldSelect(header, e.target.value || null)}
                          className={`
                            w-full px-3 py-2 rounded-lg text-sm font-medium
                            border transition-all cursor-pointer
                            ${assignedField
                              ? "bg-accent/10 border-accent/30 text-accent"
                              : "bg-muted/50 border-border text-muted-foreground hover:border-accent/30"
                            }
                            focus:outline-none focus:ring-2 focus:ring-accent/50
                          `}
                        >
                          <option value="">-- Select field --</option>
                          {availableFields.map((field) => (
                            <option key={field.key} value={field.key}>
                              {field.label} {field.required || (field.group === "seize") ? "*" : ""}
                            </option>
                          ))}
                        </select>
                        {fieldInfo && (
                          <div className="mt-1 text-[10px] text-accent/70 truncate">
                            {fieldInfo.hint}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
                {/* Header row */}
                <tr className="border-b border-border bg-card">
                  {headers.map((header) => {
                    const isAssigned = !!headerToField[header];
                    return (
                      <th
                        key={header}
                        className={`
                          px-3 py-2 text-left font-mono text-xs font-medium whitespace-nowrap
                          ${isAssigned ? "text-accent" : "text-muted-foreground"}
                        `}
                      >
                        <div className="flex items-center gap-2">
                          {header}
                          {isAssigned && <Check className="w-3 h-3" />}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              {/* Sample data rows */}
              <tbody>
                {sampleRows.slice(0, 100).map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/10"
                  >
                    {headers.map((header) => (
                      <td
                        key={header}
                        className="px-3 py-2 font-mono text-xs text-foreground/80 whitespace-nowrap"
                      >
                        {row[header] || <span className="text-muted-foreground/50">-</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-card/50">
            <div className="flex items-center gap-2 text-sm">
              {isValid ? (
                <>
                  <Check className="w-4 h-4 text-accent" />
                  <span className="text-accent">All required fields mapped</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-mismatch flex-shrink-0" />
                  <span className="text-mismatch">
                    {seizeStatus || (
                      <>
                        Missing: {missingFields.join(", ")}
                      </>
                    )}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-lg font-medium text-sm bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!isValid}
                className={`
                  px-6 py-2.5 rounded-lg font-display font-semibold text-sm
                  border transition-all duration-300 flex items-center gap-2
                  ${isValid
                    ? "bg-accent/10 border-accent/30 text-accent hover:bg-accent/20"
                    : "bg-muted/50 border-border text-muted-foreground cursor-not-allowed"
                  }
                `}
              >
                Confirm Mapping
                <Check className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
