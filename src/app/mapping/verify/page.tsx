"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Database,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Lightbulb,
  Phone,
  Clock,
  Timer,
  DollarSign,
} from "lucide-react";
import { useReconciliation, ColumnMapping } from "@/context/ReconciliationContext";

// Validation types
interface ColumnValidation {
  field: keyof ColumnMapping;
  label: string;
  isValid: boolean;
  warnings: string[];
  suggestions: string[];
  sampleValues: { rowNumber: number; raw: string; normalized: string }[];
}

interface FileValidation {
  columns: ColumnValidation[];
  overallValid: boolean;
  warningCount: number;
}

// Phone number normalization (same as backend)
function normalizePhoneNumber(input: string | null | undefined): string {
  if (input === null || input === undefined || input === "null") return "";
  let digits = String(input).replace(/\D/g, "");
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

// Check if value looks like a phone number
function isPhoneNumberLike(value: string): boolean {
  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

// Check if value looks like a timestamp
function isTimestampLike(value: string): boolean {
  if (!value || value === "null") return false;
  // Try parsing as date
  const date = new Date(value);
  if (!isNaN(date.getTime())) return true;
  // Check for common date patterns
  if (/\d{4}-\d{2}-\d{2}/.test(value)) return true;
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(value)) return true;
  return false;
}

// Check if value looks like a duration (numeric)
function isDurationLike(value: string): boolean {
  if (!value || value === "null") return false;
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0;
}

// Check if value looks like a rate (small decimal)
function isRateLike(value: string): boolean {
  if (!value || value === "null") return false;
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0;
}

// Find columns that might be better matches
function findAlternativeColumns(
  headers: string[],
  sampleRows: Record<string, string>[],
  fieldType: "phone" | "timestamp" | "duration" | "rate",
  currentColumn: string | null
): string[] {
  const alternatives: string[] = [];

  for (const header of headers) {
    if (header === currentColumn) continue;

    // Check sample values
    const sampleValues = sampleRows.slice(0, 5).map(row => row[header]);
    const validCount = sampleValues.filter(v => {
      if (!v || v === "null") return false;
      switch (fieldType) {
        case "phone": return isPhoneNumberLike(v);
        case "timestamp": return isTimestampLike(v);
        case "duration": return isDurationLike(v);
        case "rate": return isRateLike(v);
      }
    }).length;

    // If most samples look valid for this type, suggest it
    if (validCount >= 3) {
      alternatives.push(header);
    }
  }

  return alternatives.slice(0, 3); // Max 3 suggestions
}

// Validate a single column mapping
function validateColumn(
  field: keyof ColumnMapping,
  label: string,
  columnName: string | null,
  headers: string[],
  sampleRows: Record<string, string>[],
  fieldType: "phone" | "timestamp" | "duration" | "rate"
): ColumnValidation {
  const warnings: string[] = [];
  const suggestions: string[] = [];
  const sampleValues: { rowNumber: number; raw: string; normalized: string }[] = [];

  if (!columnName) {
    return {
      field,
      label,
      isValid: false,
      warnings: ["No column mapped"],
      suggestions: findAlternativeColumns(headers, sampleRows, fieldType, null),
      sampleValues: [],
    };
  }

  // Get sample values
  const samples = sampleRows.slice(0, 5).map(row => row[columnName] || "");

  // Check for null/empty values
  const nullCount = samples.filter(v => !v || v === "null" || v === "").length;
  if (nullCount > 0) {
    warnings.push(`${nullCount} of ${samples.length} sample values are empty/null`);
  }

  // Validate based on field type
  let validCount = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    const rowNumber = i + 1; // 1-indexed row number (excluding header)
    let normalized = "";
    let isValid = false;

    switch (fieldType) {
      case "phone":
        normalized = normalizePhoneNumber(value);
        isValid = normalized.length >= 7;
        sampleValues.push({ rowNumber, raw: value || "(empty)", normalized: normalized || "(empty)" });
        break;
      case "timestamp":
        isValid = isTimestampLike(value);
        normalized = isValid ? "✓ valid" : "✗ invalid";
        sampleValues.push({ rowNumber, raw: value || "(empty)", normalized });
        break;
      case "duration":
        isValid = isDurationLike(value);
        normalized = isValid ? `${parseFloat(value)}s` : "✗ invalid";
        sampleValues.push({ rowNumber, raw: value || "(empty)", normalized });
        break;
      case "rate":
        isValid = isRateLike(value);
        normalized = isValid ? `$${parseFloat(value).toFixed(4)}` : "✗ invalid";
        sampleValues.push({ rowNumber, raw: value || "(empty)", normalized });
        break;
    }

    if (isValid) validCount++;
  }

  // Check validity ratio
  const nonNullSamples = samples.filter(v => v && v !== "null" && v !== "").length;
  if (nonNullSamples > 0 && validCount < nonNullSamples * 0.5) {
    warnings.push(`Data doesn't look like ${fieldType === "phone" ? "phone numbers" : fieldType}s`);
  }

  // Find alternatives if there are warnings
  if (warnings.length > 0) {
    const alts = findAlternativeColumns(headers, sampleRows, fieldType, columnName);
    suggestions.push(...alts);
  }

  return {
    field,
    label,
    isValid: warnings.length === 0,
    warnings,
    suggestions,
    sampleValues,
  };
}

// Validate entire file mapping
function validateFileMapping(
  mapping: ColumnMapping,
  headers: string[],
  sampleRows: Record<string, string>[]
): FileValidation {
  const columns: ColumnValidation[] = [
    validateColumn("a_number", "A-Number (Caller)", mapping.a_number, headers, sampleRows, "phone"),
    validateColumn("b_number", "B-Number (Called)", mapping.b_number, headers, sampleRows, "phone"),
    validateColumn("seize_time", "Seize Time", mapping.seize_time, headers, sampleRows, "timestamp"),
    validateColumn("billed_duration", "Billed Duration", mapping.billed_duration, headers, sampleRows, "duration"),
  ];

  // Only validate rate if mapped
  if (mapping.rate) {
    columns.push(validateColumn("rate", "Rate", mapping.rate, headers, sampleRows, "rate"));
  }

  const warningCount = columns.reduce((sum, col) => sum + col.warnings.length, 0);

  return {
    columns,
    overallValid: warningCount === 0,
    warningCount,
  };
}

// Field icon component
function FieldIcon({ field }: { field: keyof ColumnMapping }) {
  switch (field) {
    case "a_number":
    case "b_number":
      return <Phone className="w-4 h-4" />;
    case "seize_time":
    case "answer_time":
    case "end_time":
      return <Clock className="w-4 h-4" />;
    case "billed_duration":
      return <Timer className="w-4 h-4" />;
    case "rate":
      return <DollarSign className="w-4 h-4" />;
    default:
      return null;
  }
}

// Validation card component
function ValidationCard({
  title,
  fileName,
  validation,
  mapping,
}: {
  title: string;
  fileName: string;
  validation: FileValidation;
  mapping: ColumnMapping;
}) {
  return (
    <div className="relative rounded-xl p-px bg-gradient-to-b from-accent/30 via-border/50 to-border/20">
      <div className="relative bg-gradient-to-b from-card to-background rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-lg">{title}</h3>
            <p className="text-xs text-muted-foreground font-mono">{fileName}</p>
          </div>
          {validation.overallValid ? (
            <div className="flex items-center gap-2 text-accent">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Valid</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm font-medium">{validation.warningCount} warnings</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {validation.columns.map((col) => (
            <div
              key={col.field}
              className={`rounded-lg border p-4 ${
                col.isValid
                  ? "border-border bg-muted/10"
                  : "border-amber-500/30 bg-amber-500/5"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FieldIcon field={col.field} />
                  <span className="font-medium text-sm">{col.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    {mapping[col.field] || "not mapped"}
                  </span>
                  {col.isValid ? (
                    <CheckCircle className="w-4 h-4 text-accent" />
                  ) : (
                    <XCircle className="w-4 h-4 text-amber-500" />
                  )}
                </div>
              </div>

              {/* Sample values */}
              {col.sampleValues.length > 0 && (
                <div className="mb-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left py-1 pr-3 w-12">Row</th>
                        <th className="text-left py-1 pr-4">Raw Value</th>
                        <th className="text-left py-1">Normalized</th>
                      </tr>
                    </thead>
                    <tbody>
                      {col.sampleValues.slice(0, 3).map((sv, i) => (
                        <tr key={i} className="border-t border-border/30">
                          <td className="py-1 pr-3 font-mono text-muted-foreground">{sv.rowNumber}</td>
                          <td className="py-1 pr-4 font-mono text-foreground/70">{sv.raw}</td>
                          <td className="py-1 font-mono text-foreground/70">{sv.normalized}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Warnings */}
              {col.warnings.length > 0 && (
                <div className="space-y-1 mb-2">
                  {col.warnings.map((warning, i) => (
                    <div key={i} className="flex items-start gap-2 text-amber-500 text-xs">
                      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Suggestions */}
              {col.suggestions.length > 0 && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md p-2">
                  <Lightbulb className="w-3 h-3 mt-0.5 flex-shrink-0 text-accent" />
                  <div>
                    <span>Try instead: </span>
                    {col.suggestions.map((s, i) => (
                      <span key={s}>
                        <code className="bg-accent/20 text-accent px-1 rounded">{s}</code>
                        {i < col.suggestions.length - 1 && ", "}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function VerifyMappingPage() {
  const router = useRouter();
  const { fileA, fileB, mappingA, mappingB } = useReconciliation();
  const [acknowledged, setAcknowledged] = useState(false);

  // Redirect if no data
  useEffect(() => {
    if (!fileA || !fileB || !mappingA || !mappingB) {
      router.push("/mapping");
    }
  }, [fileA, fileB, mappingA, mappingB, router]);

  // Validate mappings
  const validationA = useMemo(() => {
    if (!fileA || !mappingA) return null;
    return validateFileMapping(mappingA, fileA.headers, fileA.sampleRows);
  }, [fileA, mappingA]);

  const validationB = useMemo(() => {
    if (!fileB || !mappingB) return null;
    return validateFileMapping(mappingB, fileB.headers, fileB.sampleRows);
  }, [fileB, mappingB]);

  if (!fileA || !fileB || !mappingA || !mappingB || !validationA || !validationB) {
    return null;
  }

  const hasWarnings = !validationA.overallValid || !validationB.overallValid;
  const totalWarnings = validationA.warningCount + validationB.warningCount;

  const handleProceed = () => {
    router.push("/processing");
  };

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 gradient-mesh" />
      <div className="fixed inset-0 grid-pattern opacity-30" />

      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-border/50 backdrop-blur-sm bg-background/50">
          <div className="container mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Database className="w-4 h-4 text-accent" />
              </div>
              <span className="font-display font-semibold tracking-tight">
                CDR<span className="text-accent">Reconcile</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <span>Step 2.5 of 4</span>
              <span className="text-accent">Verify Mapping</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <section className="py-12 px-6">
          <div className="container mx-auto max-w-6xl">
            {/* Page header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-10"
            >
              <h1 className="font-display text-3xl font-bold tracking-tight mb-3">
                Verify Your Mappings
              </h1>
              <p className="text-muted-foreground max-w-lg mx-auto">
                Review the sample data below to ensure your column mappings are correct
                before processing.
              </p>
            </motion.div>

            {/* Warning banner */}
            {hasWarnings && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-amber-500 mb-1">
                      {totalWarnings} potential {totalWarnings === 1 ? "issue" : "issues"} detected
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Some of your mapped columns may not contain the expected data.
                      Review the warnings below and consider adjusting your mappings.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Validation cards */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10"
            >
              <ValidationCard
                title="Your CDRs"
                fileName={fileA.file.name}
                validation={validationA}
                mapping={mappingA}
              />
              <ValidationCard
                title="Provider CDRs"
                fileName={fileB.file.name}
                validation={validationB}
                mapping={mappingB}
              />
            </motion.div>

            {/* Acknowledge checkbox if warnings */}
            {hasWarnings && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex justify-center mb-6"
              >
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="w-5 h-5 rounded border-border bg-muted/50 text-accent focus:ring-accent/50"
                  />
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    I understand there are warnings and want to proceed anyway
                  </span>
                </label>
              </motion.div>
            )}

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex justify-center gap-4"
            >
              <button
                onClick={() => router.push("/mapping")}
                className="px-6 py-3 rounded-xl font-display font-medium text-sm bg-muted/50 text-muted-foreground hover:bg-muted transition-colors flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Adjust Mappings
              </button>
              <button
                onClick={handleProceed}
                disabled={hasWarnings && !acknowledged}
                className={`
                  group px-8 py-3 rounded-xl font-display font-semibold text-sm
                  border transition-all duration-300 flex items-center gap-2
                  ${
                    !hasWarnings || acknowledged
                      ? "bg-accent/10 border-accent/30 text-accent hover:bg-accent/20"
                      : "bg-muted/50 border-border text-muted-foreground cursor-not-allowed"
                  }
                `}
              >
                Start Processing
                <ArrowRight className={`w-4 h-4 transition-transform ${!hasWarnings || acknowledged ? "group-hover:translate-x-1" : ""}`} />
              </button>
            </motion.div>
          </div>
        </section>
      </div>
    </main>
  );
}
