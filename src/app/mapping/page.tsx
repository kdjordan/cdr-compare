"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Database,
  Check,
  AlertCircle,
} from "lucide-react";
import { useReconciliation, ColumnMapping } from "@/context/ReconciliationContext";

const CANONICAL_FIELDS = [
  { key: "a_number", label: "A-Number", description: "Calling party number", required: true },
  { key: "b_number", label: "B-Number", description: "Called party number", required: true },
  { key: "seize_time", label: "Seize Time", description: "Call attempt time", required: true },
  { key: "answer_time", label: "Answer Time", description: "Call connect time", required: false },
  { key: "end_time", label: "End Time", description: "Call end time", required: false },
  { key: "billed_duration", label: "Billed Duration", description: "Duration in seconds", required: true },
  { key: "rate", label: "Rate", description: "Per-minute rate", required: false },
  { key: "lrn", label: "LRN", description: "Location Routing Number", required: true },
] as const;

// Common header patterns for auto-detection
const HEADER_PATTERNS: Record<string, string[]> = {
  a_number: ["ani", "a_number", "a-number", "calling", "from", "origination", "caller", "src", "source"],
  b_number: ["dnis", "b_number", "b-number", "called", "to", "destination", "dialed", "dst", "dest"],
  seize_time: ["seize", "start", "attempt", "origination_time", "call_start", "start_time", "starttime"],
  answer_time: ["answer", "connect", "answer_time", "answertime", "connected"],
  end_time: ["end", "disconnect", "release", "call_end", "end_time", "endtime", "hangup"],
  billed_duration: ["duration", "billed", "seconds", "bill_sec", "billsec", "length", "dur"],
  rate: ["rate", "price", "cost", "per_min", "permin", "charge"],
  lrn: ["lrn", "urn", "lrn_number", "routing", "ported", "location_routing"],
};

function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    a_number: null,
    b_number: null,
    seize_time: null,
    answer_time: null,
    end_time: null,
    billed_duration: null,
    rate: null,
    lrn: null,
  };

  for (const header of headers) {
    const lowerHeader = header.toLowerCase().replace(/[^a-z0-9]/g, "");

    for (const [field, patterns] of Object.entries(HEADER_PATTERNS)) {
      if (mapping[field as keyof ColumnMapping] === null) {
        for (const pattern of patterns) {
          if (lowerHeader.includes(pattern.replace(/[^a-z0-9]/g, ""))) {
            mapping[field as keyof ColumnMapping] = header;
            break;
          }
        }
      }
    }
  }

  return mapping;
}

interface ColumnMapperProps {
  title: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
}

function ColumnMapper({ title, headers, sampleRows, mapping, onMappingChange }: ColumnMapperProps) {
  const handleFieldChange = (field: keyof ColumnMapping, value: string | null) => {
    onMappingChange({
      ...mapping,
      [field]: value === "" ? null : value,
    });
  };

  return (
    <div className="relative rounded-xl p-px bg-gradient-to-b from-accent/30 via-border/50 to-border/20">
      <div className="absolute -inset-1 bg-accent/5 rounded-xl blur-xl" />
      <div className="relative bg-gradient-to-b from-card to-background rounded-xl p-6">
        <h3 className="font-display font-semibold text-lg mb-4">{title}</h3>

        {/* Field mappings */}
        <div className="space-y-3 mb-6">
          {CANONICAL_FIELDS.map((field) => (
            <div key={field.key} className="flex items-center gap-3">
              <div className="w-36 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{field.label}</span>
                  {field.required && (
                    <span className="text-[10px] text-accent">*</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{field.description}</span>
              </div>
              <div className="flex-1">
                <select
                  value={mapping[field.key as keyof ColumnMapping] || ""}
                  onChange={(e) => handleFieldChange(field.key as keyof ColumnMapping, e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                >
                  <option value="">-- Select column --</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-6 flex-shrink-0">
                {mapping[field.key as keyof ColumnMapping] ? (
                  <Check className="w-4 h-4 text-accent" />
                ) : field.required ? (
                  <AlertCircle className="w-4 h-4 text-mismatch" />
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Sample data preview */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border flex justify-between items-center">
            <span>Sample Data Preview</span>
            <span className="text-accent">{headers.length} columns</span>
          </div>
          <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
            <table className="text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-card">
                  {headers.map((header) => (
                    <th key={header} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap bg-card">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                    {headers.map((header) => (
                      <td key={header} className="px-3 py-2 font-mono text-foreground/80 whitespace-nowrap">
                        {row[header] || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MappingPage() {
  const router = useRouter();
  const { fileA, fileB, mappingA, mappingB, setMappingA, setMappingB } = useReconciliation();

  const [localMappingA, setLocalMappingA] = useState<ColumnMapping>(() => {
    if (mappingA) return mappingA;
    if (fileA) return autoDetectMapping(fileA.headers);
    return {
      a_number: null,
      b_number: null,
      seize_time: null,
      answer_time: null,
      end_time: null,
      billed_duration: null,
      rate: null,
      lrn: null,
    };
  });

  const [localMappingB, setLocalMappingB] = useState<ColumnMapping>(() => {
    if (mappingB) return mappingB;
    if (fileB) return autoDetectMapping(fileB.headers);
    return {
      a_number: null,
      b_number: null,
      seize_time: null,
      answer_time: null,
      end_time: null,
      billed_duration: null,
      rate: null,
      lrn: null,
    };
  });

  // Redirect if no files
  useEffect(() => {
    if (!fileA || !fileB) {
      router.push("/");
    }
  }, [fileA, fileB, router]);

  // Auto-detect on mount
  useEffect(() => {
    if (fileA && !mappingA) {
      setLocalMappingA(autoDetectMapping(fileA.headers));
    }
    if (fileB && !mappingB) {
      setLocalMappingB(autoDetectMapping(fileB.headers));
    }
  }, [fileA, fileB, mappingA, mappingB]);

  if (!fileA || !fileB) {
    return null;
  }

  const requiredFields: (keyof ColumnMapping)[] = ["a_number", "b_number", "seize_time", "billed_duration", "lrn"];

  const isValidMapping = (mapping: ColumnMapping) =>
    requiredFields.every((field) => mapping[field] !== null);

  const canProceed = isValidMapping(localMappingA) && isValidMapping(localMappingB);
  const [isNavigating, setIsNavigating] = useState(false);

  // Navigate after mappings are confirmed in context
  useEffect(() => {
    if (isNavigating && mappingA && mappingB) {
      // Verify the mappings match what we set
      const mappingsMatch =
        mappingA.a_number === localMappingA.a_number &&
        mappingA.b_number === localMappingA.b_number &&
        mappingB.a_number === localMappingB.a_number &&
        mappingB.b_number === localMappingB.b_number;

      if (mappingsMatch) {
        setIsNavigating(false);
        router.push("/mapping/verify");
      }
    }
  }, [isNavigating, mappingA, mappingB, localMappingA, localMappingB, router]);

  const handleProceed = () => {
    setMappingA(localMappingA);
    setMappingB(localMappingB);
    setIsNavigating(true);
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
              <span>Step 2 of 4</span>
              <span className="text-accent">Column Mapping</span>
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
                Map Your Columns
              </h1>
              <p className="text-muted-foreground max-w-lg mx-auto">
                Match your file columns to the standard CDR fields. We&apos;ve auto-detected
                some mappings based on common naming patterns.
              </p>
            </motion.div>

            {/* File info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex justify-center gap-8 mb-10"
            >
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Your CDRs</div>
                <div className="font-mono text-sm">{fileA.file.name}</div>
                <div className="text-xs text-accent">{fileA.totalRows.toLocaleString()} rows</div>
              </div>
              <div className="w-px h-12 bg-border" />
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Provider CDRs</div>
                <div className="font-mono text-sm">{fileB.file.name}</div>
                <div className="text-xs text-accent">{fileB.totalRows.toLocaleString()} rows</div>
              </div>
            </motion.div>

            {/* Mapping columns */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10"
            >
              <ColumnMapper
                title="Your CDRs"
                headers={fileA.headers}
                sampleRows={fileA.sampleRows}
                mapping={localMappingA}
                onMappingChange={setLocalMappingA}
              />
              <ColumnMapper
                title="Provider CDRs"
                headers={fileB.headers}
                sampleRows={fileB.sampleRows}
                mapping={localMappingB}
                onMappingChange={setLocalMappingB}
              />
            </motion.div>

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex justify-center gap-4"
            >
              <button
                onClick={() => router.push("/")}
                className="px-6 py-3 rounded-xl font-display font-medium text-sm bg-muted/50 text-muted-foreground hover:bg-muted transition-colors flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={handleProceed}
                disabled={!canProceed}
                className={`
                  group px-8 py-3 rounded-xl font-display font-semibold text-sm
                  border transition-all duration-300 flex items-center gap-2
                  ${
                    canProceed
                      ? "bg-accent/10 border-accent/30 text-accent hover:bg-accent/20"
                      : "bg-muted/50 border-border text-muted-foreground cursor-not-allowed"
                  }
                `}
              >
                Review & Verify
                <ArrowRight className={`w-4 h-4 transition-transform ${canProceed ? "group-hover:translate-x-1" : ""}`} />
              </button>
            </motion.div>

            {!canProceed && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-sm text-mismatch mt-4"
              >
                Please map all required fields (*) for both files
              </motion.p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
