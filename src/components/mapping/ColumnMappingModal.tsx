"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, AlertCircle, Zap } from "lucide-react";
import { ColumnMapping, FileSettings, DurationUnit, RatePrecision, Timezone, DEFAULT_FILE_SETTINGS } from "@/context/ReconciliationContext";
import { SWITCH_PRESETS, detectPreset, isPresetValidForHeaders, SwitchPreset } from "@/lib/presets";

const CANONICAL_FIELDS = [
  { key: "a_number", label: "Calling Number", hint: "ANI, A-Number, Source", required: true, hasAlt: false },
  { key: "b_number", label: "Called Number", hint: "DNIS, B-Number, Destination", required: true, hasAlt: false },
  { key: "seize_time", label: "Seize Time", hint: "Call start/attempt time", required: true, hasAlt: true },
  { key: "answer_time", label: "Answer Time", hint: "Connect time", required: false, hasAlt: true },
  { key: "end_time", label: "End Time", hint: "Call end time", required: false, hasAlt: true },
  { key: "billed_duration", label: "Duration", hint: "Seconds billed", required: true, hasAlt: false },
  { key: "rate", label: "Rate", hint: "Per-minute rate", required: true, hasAlt: false },
  { key: "lrn", label: "LRN", hint: "Location Routing Number", required: true, hasAlt: false },
] as const;

// Fields that support secondary time columns
const TIME_FIELDS_WITH_ALT = ["seize_time", "answer_time", "end_time"] as const;

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
      // Add alt fields for time columns
      if (field.hasAlt) {
        initial[`${field.key}_alt`] = null;
      }
    });
    return initial;
  });

  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [detectedPreset, setDetectedPreset] = useState<SwitchPreset | null>(null);

  // File settings (duration unit, rate precision)
  const [settings, setSettings] = useState<FileSettings>(DEFAULT_FILE_SETTINGS);

  // Auto-detect preset on mount, pre-select it, and apply the mapping
  useEffect(() => {
    if (headers.length > 0) {
      const detected = detectPreset(headers);
      setDetectedPreset(detected);
      if (detected) {
        setSelectedPreset(detected.id);
        // Auto-apply the detected preset so user sees the mapping immediately
        const newMapping: Record<string, string | null> = {};
        CANONICAL_FIELDS.forEach((field) => {
          const headerName = detected.mapping[field.key as keyof ColumnMapping];
          if (headerName && headers.includes(headerName)) {
            newMapping[field.key] = headerName;
          } else {
            newMapping[field.key] = null;
          }
          // Reset alt fields
          if (field.hasAlt) {
            newMapping[`${field.key}_alt`] = null;
          }
        });
        setMapping(newMapping);
        // Also apply settings from preset
        setSettings({
          durationUnit: detected.durationUnit,
          ratePrecision: detected.ratePrecision,
          timezone: "UTC",
        });
      }
    }
  }, [headers]);

  // Apply a preset to the mapping
  const applyPreset = (preset: SwitchPreset) => {
    if (!isPresetValidForHeaders(preset, headers)) {
      return;
    }

    setSelectedPreset(preset.id);

    // Convert preset mapping to our internal format (field -> header)
    const newMapping: Record<string, string | null> = {};
    CANONICAL_FIELDS.forEach((field) => {
      const headerName = preset.mapping[field.key as keyof ColumnMapping];
      // Only apply if the header exists in our file
      if (headerName && headers.includes(headerName)) {
        newMapping[field.key] = headerName;
      } else {
        newMapping[field.key] = null;
      }
      // Reset alt fields when applying preset
      if (field.hasAlt) {
        newMapping[`${field.key}_alt`] = null;
      }
    });

    setMapping(newMapping);

    // Also apply settings from preset
    setSettings({
      durationUnit: preset.durationUnit,
      ratePrecision: preset.ratePrecision,
      timezone: "UTC",
    });
  };

  // Track which header is assigned to which field (reverse lookup)
  // Includes both primary and alt fields
  const headerToField = useMemo(() => {
    const map: Record<string, string> = {};
    Object.entries(mapping).forEach(([fieldKey, headerValue]) => {
      if (headerValue) {
        map[headerValue] = fieldKey;
      }
    });
    return map;
  }, [mapping]);

  // Get all used headers (for excluding from other selections)
  const usedHeaders = useMemo(() => {
    return new Set(Object.values(mapping).filter(Boolean) as string[]);
  }, [mapping]);

  // Get available fields for a specific header's dropdown
  const getAvailableFields = (currentHeader: string) => {
    const assignedField = headerToField[currentHeader];
    return CANONICAL_FIELDS.filter((field) => {
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

  // Handle setting alt (secondary) time column
  const handleAltFieldSelect = (primaryFieldKey: string, header: string | null) => {
    const altKey = `${primaryFieldKey}_alt`;
    setMapping((prev) => {
      const newMapping = { ...prev };

      // Clear any previous assignment of this header
      if (header) {
        Object.keys(newMapping).forEach((key) => {
          if (newMapping[key] === header) {
            newMapping[key] = null;
          }
        });
      }

      newMapping[altKey] = header;
      return newMapping;
    });
  };

  // Get available headers for alt field dropdown (exclude all used headers except current)
  const getAvailableHeadersForAlt = (primaryFieldKey: string) => {
    const altKey = `${primaryFieldKey}_alt`;
    const currentAltValue = mapping[altKey];
    return headers.filter((h) => {
      // Include if: not used anywhere, OR is the current alt value
      return !usedHeaders.has(h) || h === currentAltValue;
    });
  };

  const requiredFields = CANONICAL_FIELDS.filter((f) => f.required).map((f) => f.key);
  const isValid = requiredFields.every((key) => mapping[key] !== null);

  const handleConfirm = () => {
    const columnMapping: ColumnMapping = {
      a_number: mapping.a_number,
      b_number: mapping.b_number,
      seize_time: mapping.seize_time,
      seize_time_alt: mapping.seize_time_alt,
      answer_time: mapping.answer_time,
      answer_time_alt: mapping.answer_time_alt,
      end_time: mapping.end_time,
      end_time_alt: mapping.end_time_alt,
      billed_duration: mapping.billed_duration,
      rate: mapping.rate,
      lrn: mapping.lrn,
    };
    onConfirm(columnMapping, settings);
  };

  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const requiredMappedCount = requiredFields.filter((key) => mapping[key] !== null).length;

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

          {/* Preset Selector */}
          <div className="px-6 py-4 bg-accent/10 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-accent" />
                  <span className="text-sm font-medium">Switch Format:</span>
                </div>
                <select
                  value={selectedPreset || ""}
                  onChange={(e) => setSelectedPreset(e.target.value || null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-muted/50 border border-border text-accent focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent min-w-[180px]"
                >
                  <option value="">-- Select Format --</option>
                  {SWITCH_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name} {detectedPreset?.id === preset.id ? "(detected)" : ""}
                    </option>
                  ))}
                  <option value="manual">Manual Mapping</option>
                </select>
                {detectedPreset && !selectedPreset && (
                  <span className="text-xs text-accent bg-accent/20 px-2 py-1 rounded">
                    Detected: {detectedPreset.name}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  const preset = SWITCH_PRESETS.find(p => p.id === selectedPreset);
                  if (preset) applyPreset(preset);
                }}
                disabled={!selectedPreset || selectedPreset === "manual"}
                className={`
                  px-6 py-2.5 rounded-lg font-display font-semibold text-sm
                  border transition-all duration-300 flex items-center gap-2
                  ${selectedPreset && selectedPreset !== "manual"
                    ? "bg-accent/10 border-accent/30 text-accent hover:bg-accent/20"
                    : "bg-muted/50 border-border text-muted-foreground cursor-not-allowed"
                  }
                `}
              >
                <Zap className="w-4 h-4" />
                Apply Preset
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
                  <option value="UTC">UTC (+0h)</option>
                  <option value="EST">EST (-5h)</option>
                  <option value="CST">CST (-6h)</option>
                  <option value="MST">MST (-7h)</option>
                  <option value="PST">PST (-8h)</option>
                  <option value="GMT">GMT (+0h)</option>
                  <option value="CET">CET (+1h)</option>
                  <option value="IST">IST (+5.5h)</option>
                  <option value="JST">JST (+9h)</option>
                  <option value="AEST">AEST (+10h)</option>
                </select>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-4 text-xs">
                <span className="text-muted-foreground">
                  Progress: <span className="text-accent font-medium">{requiredMappedCount}/{requiredFields.length}</span> required
                </span>
              </div>
            </div>
          </div>

          {/* Time Field Composite Mapping - show when any time field is mapped */}
          {(mapping.seize_time || mapping.answer_time || mapping.end_time) && (
            <div className="px-6 py-3 bg-accent/5 border-b border-border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-accent">Split Date/Time Columns</span>
                <span className="text-xs text-muted-foreground">(optional - if date and time are in separate columns)</span>
              </div>
              <div className="flex flex-wrap gap-4">
                {TIME_FIELDS_WITH_ALT.map((fieldKey) => {
                  const primaryValue = mapping[fieldKey];
                  if (!primaryValue) return null;

                  const fieldInfo = CANONICAL_FIELDS.find((f) => f.key === fieldKey);
                  const altKey = `${fieldKey}_alt`;
                  const altValue = mapping[altKey];
                  const availableHeaders = getAvailableHeadersForAlt(fieldKey);

                  return (
                    <div key={fieldKey} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                      <span className="text-xs font-medium text-foreground">{fieldInfo?.label}:</span>
                      <span className="text-xs font-mono text-accent">{primaryValue}</span>
                      <span className="text-xs text-muted-foreground">+</span>
                      <select
                        value={altValue || ""}
                        onChange={(e) => handleAltFieldSelect(fieldKey, e.target.value || null)}
                        className="px-2 py-1 rounded text-xs font-medium bg-muted/50 border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 min-w-[120px]"
                      >
                        <option value="">No time column</option>
                        {availableHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      {altValue && (
                        <span className="text-xs text-muted-foreground">
                          = &quot;{primaryValue}&quot; + &quot;{altValue}&quot;
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
                              {field.label} {field.required ? "*" : ""}
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
                  <AlertCircle className="w-4 h-4 text-mismatch" />
                  <span className="text-mismatch">
                    {requiredFields.length - requiredMappedCount} required field(s) remaining
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
