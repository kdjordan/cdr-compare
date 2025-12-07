"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

export type DurationUnit = "seconds" | "milliseconds";
export type RatePrecision = 4 | 5 | 6;

export interface FilePreview {
  file: File;
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
}

export interface ColumnMapping {
  a_number: string | null;
  b_number: string | null;
  seize_time: string | null;
  answer_time: string | null;
  end_time: string | null;
  billed_duration: string | null;
  rate: string | null;
}

// Settings for how to interpret data from each file
export interface FileSettings {
  durationUnit: DurationUnit;
  ratePrecision: RatePrecision;
}

export const DEFAULT_FILE_SETTINGS: FileSettings = {
  durationUnit: "seconds",
  ratePrecision: 4,
};

export interface Discrepancy {
  type: "missing_in_a" | "missing_in_b" | "zero_duration_in_a" | "zero_duration_in_b" | "duration_mismatch" | "rate_mismatch" | "cost_mismatch";
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
  source_index?: number;
  source_index_a?: number;
  source_index_b?: number;
}

export interface ImpactBreakdown {
  missingInYours: number;
  missingInProvider: number;
  durationMismatches: number;
  rateMismatches: number;
  costMismatches: number;
}

export interface ReconciliationSummary {
  totalRecordsA: number;
  totalRecordsB: number;
  matchedRecords: number;
  // TOTAL BILLED - key numbers for invoice comparison
  yourTotalBilled: number;
  providerTotalBilled: number;
  billingDifference: number;
  // TOTAL MINUTES - for invoice cross-reference
  yourTotalMinutes: number;
  providerTotalMinutes: number;
  minutesDifference: number;
  // Missing record counts
  missingInYours: number;
  missingInProvider: number;
  // Zero-duration breakdown (unanswered attempts vs billed calls)
  zeroDurationInYours: number;
  zeroDurationInProvider: number;
  billedMissingInYours: number;
  billedMissingInProvider: number;
  // Mismatch counts
  durationMismatches: number;
  rateMismatches: number;
  costMismatches: number;
  totalDiscrepancies: number;
  monetaryImpact: number;
  impactBreakdown: ImpactBreakdown;
}

export interface ReconciliationResults {
  jobId: string;
  summary: ReconciliationSummary;
  discrepancies: Discrepancy[];
  hasMore: boolean;
  totalDiscrepancyCount: number;
}

interface ReconciliationState {
  fileA: FilePreview | null;
  fileB: FilePreview | null;
  mappingA: ColumnMapping | null;
  mappingB: ColumnMapping | null;
  settingsA: FileSettings;
  settingsB: FileSettings;
  results: ReconciliationResults | null;
  step: "upload" | "mapping" | "processing" | "results";
}

interface ReconciliationContextType extends ReconciliationState {
  setFileA: (file: FilePreview | null) => void;
  setFileB: (file: FilePreview | null) => void;
  setMappingA: (mapping: ColumnMapping | null) => void;
  setMappingB: (mapping: ColumnMapping | null) => void;
  setSettingsA: (settings: FileSettings) => void;
  setSettingsB: (settings: FileSettings) => void;
  setResults: (results: ReconciliationResults | null) => void;
  setStep: (step: ReconciliationState["step"]) => void;
  reset: () => void;
}

const initialState: ReconciliationState = {
  fileA: null,
  fileB: null,
  mappingA: null,
  mappingB: null,
  settingsA: DEFAULT_FILE_SETTINGS,
  settingsB: DEFAULT_FILE_SETTINGS,
  results: null,
  step: "upload",
};

const ReconciliationContext = createContext<ReconciliationContextType | null>(null);

export function ReconciliationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ReconciliationState>(initialState);

  const setFileA = (file: FilePreview | null) =>
    setState((prev) => ({ ...prev, fileA: file }));

  const setFileB = (file: FilePreview | null) =>
    setState((prev) => ({ ...prev, fileB: file }));

  const setMappingA = (mapping: ColumnMapping | null) =>
    setState((prev) => ({ ...prev, mappingA: mapping }));

  const setMappingB = (mapping: ColumnMapping | null) =>
    setState((prev) => ({ ...prev, mappingB: mapping }));

  const setSettingsA = (settings: FileSettings) =>
    setState((prev) => ({ ...prev, settingsA: settings }));

  const setSettingsB = (settings: FileSettings) =>
    setState((prev) => ({ ...prev, settingsB: settings }));

  const setResults = (results: ReconciliationResults | null) =>
    setState((prev) => ({ ...prev, results }));

  const setStep = (step: ReconciliationState["step"]) =>
    setState((prev) => ({ ...prev, step }));

  const reset = () => setState(initialState);

  return (
    <ReconciliationContext.Provider
      value={{
        ...state,
        setFileA,
        setFileB,
        setMappingA,
        setMappingB,
        setSettingsA,
        setSettingsB,
        setResults,
        setStep,
        reset,
      }}
    >
      {children}
    </ReconciliationContext.Provider>
  );
}

export function useReconciliation() {
  const context = useContext(ReconciliationContext);
  if (!context) {
    throw new Error("useReconciliation must be used within a ReconciliationProvider");
  }
  return context;
}
