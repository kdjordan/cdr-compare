"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Database,
  CheckCircle,
  XCircle,
  AlertTriangle,
  DollarSign,
  Download,
  ArrowLeft,
  Filter,
  Clock,
  ChevronDown,
  ChevronUp,
  Info,
  TrendingUp,
  TrendingDown,
  Phone,
  PhoneOff,
  PhoneForwarded,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useReconciliation, Discrepancy } from "@/context/ReconciliationContext";

type DiscrepancyFilter = "all" | "missing_in_a" | "missing_in_b" | "duration_mismatch" | "rate_mismatch" | "cost_mismatch" | "lrn_mismatch" | "zero_duration" | "hung_calls";

const FILTER_OPTIONS: { value: DiscrepancyFilter; label: string; description?: string }[] = [
  { value: "all", label: "All", description: "All discrepancies" },
  { value: "missing_in_a", label: "Missing in Yours", description: "Provider billing you for calls you don't have" },
  { value: "missing_in_b", label: "Missing in Provider", description: "Calls you have that provider doesn't" },
  { value: "lrn_mismatch", label: "LRN", description: "Different LRN dip results" },
  { value: "duration_mismatch", label: "Duration", description: "Same call, different duration" },
  { value: "rate_mismatch", label: "Rate", description: "Same call, different rate" },
  { value: "cost_mismatch", label: "Combined", description: "Both rate & duration differ" },
  { value: "zero_duration", label: "Unanswered", description: "Zero-duration call attempts" },
  { value: "hung_calls", label: "Hung Calls", description: "Potential stuck switch - identical durations" },
];

// Column visibility based on filter type
type ColumnKey = "type" | "a_number" | "b_number" | "time" | "your_dur" | "prov_dur" | "your_cost" | "prov_cost" | "difference" | "your_row" | "prov_row" | "your_lrn" | "prov_lrn" | "hung_count";

const getVisibleColumns = (filter: DiscrepancyFilter): Set<ColumnKey> => {
  const base: ColumnKey[] = ["a_number", "b_number", "time"];

  switch (filter) {
    case "missing_in_a":
      // Provider has it, you don't - show provider data only
      return new Set([...base, "prov_dur", "prov_cost", "difference", "prov_row"]);
    case "missing_in_b":
      // You have it, provider doesn't - show your data only
      return new Set([...base, "your_dur", "your_cost", "difference", "your_row"]);
    case "zero_duration":
      // Show which side has it
      return new Set([...base, "type", "your_dur", "prov_dur", "your_row", "prov_row"]);
    case "lrn_mismatch":
      // Show LRN comparison
      return new Set([...base, "your_lrn", "prov_lrn", "your_cost", "prov_cost", "difference", "your_row", "prov_row"]);
    case "duration_mismatch":
      // Compare durations
      return new Set([...base, "your_dur", "prov_dur", "your_cost", "prov_cost", "difference", "your_row", "prov_row"]);
    case "rate_mismatch":
      // Compare costs (rates reflected in cost) - include LRNs since rate differences often relate to LRN dips
      return new Set([...base, "your_lrn", "prov_lrn", "your_dur", "prov_dur", "your_cost", "prov_cost", "difference", "your_row", "prov_row"]);
    case "cost_mismatch":
      // Show everything for combined mismatches
      return new Set([...base, "your_dur", "prov_dur", "your_cost", "prov_cost", "difference", "your_row", "prov_row"]);
    case "hung_calls":
      // Show hung call specific columns
      return new Set([...base, "type", "your_dur", "prov_dur", "your_cost", "prov_cost", "hung_count", "your_row", "prov_row"]);
    case "all":
    default:
      // Show all columns including type
      return new Set(["type", ...base, "your_dur", "prov_dur", "your_cost", "prov_cost", "difference", "your_row", "prov_row"]);
  }
};

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return "-";
  return new Date(timestamp * 1000).toLocaleString();
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "-";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatMoney(amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}$${amount.toFixed(2)}`;
}

function formatDifference(amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}$${amount.toFixed(4)}`;
}

function formatCost(cost: number | null): string {
  if (cost === null) return "-";
  return `$${cost.toFixed(4)}`;
}

function getTypeLabel(type: Discrepancy["type"]): string {
  switch (type) {
    case "missing_in_a":
      return "Missing in Yours";
    case "missing_in_b":
      return "Missing in Provider";
    case "zero_duration_in_a":
      return "Unanswered (Provider)";
    case "zero_duration_in_b":
      return "Unanswered (Yours)";
    case "lrn_mismatch":
      return "LRN Mismatch";
    case "duration_mismatch":
      return "Duration Mismatch";
    case "rate_mismatch":
      return "Rate Mismatch";
    case "cost_mismatch":
      return "Cost Mismatch";
    case "hung_call_yours":
      return "Hung Call (Yours)";
    case "hung_call_provider":
      return "Hung Call (Provider)";
    default:
      return type;
  }
}

function formatSourceRow(d: Discrepancy): { yours: string; provider: string } {
  if (d.type === "missing_in_b" || d.type === "zero_duration_in_b" || d.type === "hung_call_yours") {
    // Record exists only in your file
    return {
      yours: d.source_index != null ? `${d.source_index + 2}` : "-",
      provider: "-",
    };
  } else if (d.type === "missing_in_a" || d.type === "zero_duration_in_a" || d.type === "hung_call_provider") {
    // Record exists only in provider file
    return {
      yours: "-",
      provider: d.source_index != null ? `${d.source_index + 2}` : "-",
    };
  } else {
    // Matched records (duration_mismatch, rate_mismatch, cost_mismatch)
    return {
      yours: d.source_index_a != null ? `${d.source_index_a + 2}` : "-",
      provider: d.source_index_b != null ? `${d.source_index_b + 2}` : "-",
    };
  }
}

function getTypeColor(type: Discrepancy["type"]): string {
  switch (type) {
    case "missing_in_a":
      return "text-destructive bg-destructive/10 border-destructive/20";
    case "missing_in_b":
      return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    case "zero_duration_in_a":
    case "zero_duration_in_b":
      return "text-slate-400 bg-slate-400/10 border-slate-400/20";
    case "lrn_mismatch":
      return "text-pink-500 bg-pink-500/10 border-pink-500/20";
    case "duration_mismatch":
      return "text-blue-500 bg-blue-500/10 border-blue-500/20";
    case "rate_mismatch":
      return "text-purple-500 bg-purple-500/10 border-purple-500/20";
    case "cost_mismatch":
      return "text-orange-500 bg-orange-500/10 border-orange-500/20";
    case "hung_call_yours":
    case "hung_call_provider":
      return "text-cyan-500 bg-cyan-500/10 border-cyan-500/20";
    default:
      return "text-muted-foreground bg-muted/10 border-muted/20";
  }
}

type SortField = "duration" | "group_size" | "time" | "your_cost" | "prov_cost" | "difference" | "a_number" | "b_number" | null;
type SortDirection = "asc" | "desc";

// Column tooltips explaining what each column shows
const COLUMN_TOOLTIPS: Record<string, string> = {
  type: "The type of discrepancy detected",
  a_number: "Calling party number (originating number)",
  b_number: "Called party number (destination number)",
  time: "When the call was initiated",
  your_lrn: "Location Routing Number from your CDR - used for rate determination",
  prov_lrn: "Location Routing Number from provider's CDR",
  your_dur: "Call duration recorded in your CDR",
  prov_dur: "Call duration recorded in provider's CDR",
  your_cost: "Calculated cost based on your CDR (duration × rate)",
  prov_cost: "Calculated cost based on provider's CDR",
  difference: "Cost difference: positive = you're owed, negative = you owe",
  hung_count: "Number of calls with this exact duration - higher numbers suggest stuck switch",
  your_row: "Row number in your original file",
  prov_row: "Row number in provider's original file",
};

export default function ResultsPage() {
  const router = useRouter();
  const { results, reset } = useReconciliation();
  const [filter, setFilter] = useState<DiscrepancyFilter>("all");
  const [isExporting, setIsExporting] = useState(false);
  const [showSynopsis, setShowSynopsis] = useState(true);
  const [hideZeroDuration, setHideZeroDuration] = useState(true);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Redirect if no results
  useEffect(() => {
    if (!results) {
      router.push("/");
    }
  }, [results, router]);

  // Reset sort when filter changes
  useEffect(() => {
    setSortField(null);
    setSortDirection("desc");
  }, [filter]);

  if (!results) {
    return null;
  }

  const { summary, discrepancies } = results;

  // Filter discrepancies based on selection
  const getFilteredDiscrepancies = () => {
    switch (filter) {
      case "all":
        return hideZeroDuration
          ? discrepancies.filter(d => d.type !== "zero_duration_in_a" && d.type !== "zero_duration_in_b")
          : discrepancies;
      case "missing_in_a":
        return discrepancies.filter(d => d.type === "missing_in_a");
      case "missing_in_b":
        return discrepancies.filter(d => d.type === "missing_in_b");
      case "lrn_mismatch":
        return discrepancies.filter(d => d.type === "lrn_mismatch");
      case "duration_mismatch":
        return discrepancies.filter(d => d.type === "duration_mismatch");
      case "rate_mismatch":
        return discrepancies.filter(d => d.type === "rate_mismatch");
      case "cost_mismatch":
        return discrepancies.filter(d => d.type === "cost_mismatch");
      case "zero_duration":
        return discrepancies.filter(d => d.type === "zero_duration_in_a" || d.type === "zero_duration_in_b");
      case "hung_calls":
        return discrepancies.filter(d => d.type === "hung_call_yours" || d.type === "hung_call_provider");
      default:
        return discrepancies;
    }
  };

  // Sort discrepancies
  const sortDiscrepancies = (items: Discrepancy[]): Discrepancy[] => {
    if (!sortField) {
      // Default sort for hung calls: by duration descending (groups together)
      if (filter === "hung_calls") {
        return [...items].sort((a, b) => {
          const durA = a.your_duration ?? a.provider_duration ?? 0;
          const durB = b.your_duration ?? b.provider_duration ?? 0;
          return durB - durA; // Descending by default
        });
      }
      return items;
    }

    return [...items].sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;

      switch (sortField) {
        case "duration":
          valA = a.your_duration ?? a.provider_duration ?? 0;
          valB = b.your_duration ?? b.provider_duration ?? 0;
          break;
        case "group_size":
          valA = a.hung_call_count ?? 0;
          valB = b.hung_call_count ?? 0;
          break;
        case "time":
          valA = a.seize_time ?? 0;
          valB = b.seize_time ?? 0;
          break;
        case "your_cost":
          valA = a.your_cost ?? 0;
          valB = b.your_cost ?? 0;
          break;
        case "prov_cost":
          valA = a.provider_cost ?? 0;
          valB = b.provider_cost ?? 0;
          break;
        case "difference":
          valA = Math.abs(a.cost_difference ?? 0);
          valB = Math.abs(b.cost_difference ?? 0);
          break;
        case "a_number":
          valA = a.a_number ?? "";
          valB = b.a_number ?? "";
          break;
        case "b_number":
          valA = b.b_number ?? "";
          valB = b.b_number ?? "";
          break;
      }

      // Handle string comparison for phone numbers
      if (typeof valA === "string" && typeof valB === "string") {
        return sortDirection === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      return sortDirection === "asc" ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const filteredDiscrepancies = sortDiscrepancies(getFilteredDiscrepancies());

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discrepancies, summary }),
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cdr-reconciliation-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export results");
    } finally {
      setIsExporting(false);
    }
  };

  const handleNewComparison = () => {
    reset();
    router.push("/");
  };

  // Calculate real billing issues (excluding zero-duration)
  const realBillingIssues = (summary.billedMissingInYours || 0) +
    (summary.billedMissingInProvider || 0) +
    summary.durationMismatches +
    summary.rateMismatches +
    summary.costMismatches;

  const totalZeroDuration = (summary.zeroDurationInYours || 0) + (summary.zeroDurationInProvider || 0);

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 gradient-mesh" />
      <div className="fixed inset-0 grid-pattern opacity-30" />

      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-border/50 backdrop-blur-sm bg-background/50 sticky top-0 z-20">
          <div className="container mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Database className="w-4 h-4 text-accent" />
              </div>
              <span className="font-display font-semibold tracking-tight">
                CDR<span className="text-accent">Reconcile</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleNewComparison}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-muted/50 hover:bg-muted transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                New Comparison
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border bg-accent/10 border-accent/30 text-accent hover:bg-accent/20 transition-all disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isExporting ? "Exporting..." : "Export CSV"}
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <section className="py-8 px-6">
          <div className="container mx-auto max-w-7xl">
            {/* Page Title */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6"
            >
              <h1 className="font-display text-3xl font-bold tracking-tight mb-2">
                Reconciliation Results
              </h1>
              <p className="text-muted-foreground">
                Comparison of {summary.totalRecordsA.toLocaleString()} records against{" "}
                {summary.totalRecordsB.toLocaleString()} records
              </p>
            </motion.div>

            {/* Summary Cards */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
            >
              {/* Matched */}
              <div className="rounded-xl bg-card border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-display">{summary.matchedRecords.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Matched</p>
                  </div>
                </div>
              </div>

              {/* Billing Issues */}
              <div className="rounded-xl bg-card border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-display">{realBillingIssues.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Billing Issues</p>
                  </div>
                </div>
              </div>

              {/* Zero Duration (Attempts) */}
              <div className="rounded-xl bg-card border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-500/10 flex items-center justify-center">
                    <PhoneOff className="w-5 h-5 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-display text-slate-400">{totalZeroDuration.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Unanswered Attempts</p>
                  </div>
                </div>
              </div>

              {/* Monetary Impact */}
              <div className="rounded-xl bg-card border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className={`text-2xl font-bold font-display ${summary.monetaryImpact >= 0 ? "text-accent" : "text-destructive"}`}>
                      {formatMoney(summary.monetaryImpact)}
                    </p>
                    <p className="text-xs text-muted-foreground">Net Impact</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Synopsis Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-xl bg-card border border-border overflow-hidden mb-6"
            >
              <button
                onClick={() => setShowSynopsis(!showSynopsis)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Info className="w-5 h-5 text-accent" />
                  <h2 className="font-display font-semibold text-lg">Synopsis</h2>
                </div>
                {showSynopsis ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>

              {showSynopsis && (
                <div className="px-6 pb-6 space-y-4">
                  {/* Billing Totals Comparison - The key numbers */}
                  <div className="p-4 rounded-lg bg-muted/30 border border-border space-y-4">
                    {/* Cost Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Your CDR Total */}
                      <div className="text-center p-3 rounded-lg bg-accent/5 border border-accent/20">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Your CDR Total</p>
                        <p className="text-2xl font-bold font-display text-accent">
                          ${(summary.yourTotalBilled ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground">{summary.totalRecordsA.toLocaleString()} records</p>
                      </div>

                      {/* Provider CDR Total */}
                      <div className="text-center p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Provider CDR Total</p>
                        <p className="text-2xl font-bold font-display text-blue-500">
                          ${(summary.providerTotalBilled ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground">{summary.totalRecordsB.toLocaleString()} records</p>
                      </div>

                      {/* Difference */}
                      <div className={`text-center p-3 rounded-lg ${
                        (summary.billingDifference ?? 0) >= 0
                          ? "bg-accent/5 border border-accent/20"
                          : "bg-destructive/5 border border-destructive/20"
                      }`}>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Difference</p>
                        <p className={`text-2xl font-bold font-display ${
                          (summary.billingDifference ?? 0) >= 0 ? "text-accent" : "text-destructive"
                        }`}>
                          {formatMoney(summary.billingDifference ?? 0)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(summary.billingDifference ?? 0) < 0
                            ? "Provider billing more"
                            : (summary.billingDifference ?? 0) > 0
                              ? "Your records higher"
                              : "No difference"}
                        </p>
                      </div>
                    </div>

                    {/* Minutes Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Your Total Minutes */}
                      <div className="text-center p-3 rounded-lg bg-accent/5 border border-accent/20">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Your Total Minutes</p>
                        <p className="text-xl font-bold font-display text-accent">
                          {(summary.yourTotalMinutes ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>

                      {/* Provider Total Minutes */}
                      <div className="text-center p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Provider Total Minutes</p>
                        <p className="text-xl font-bold font-display text-blue-500">
                          {(summary.providerTotalMinutes ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>

                      {/* Minutes Difference */}
                      <div className={`text-center p-3 rounded-lg ${
                        (summary.minutesDifference ?? 0) >= 0
                          ? "bg-accent/5 border border-accent/20"
                          : "bg-destructive/5 border border-destructive/20"
                      }`}>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Minutes Difference</p>
                        <p className={`text-xl font-bold font-display ${
                          (summary.minutesDifference ?? 0) >= 0 ? "text-accent" : "text-destructive"
                        }`}>
                          {(summary.minutesDifference ?? 0) >= 0 ? "+" : ""}{(summary.minutesDifference ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Impact Breakdown - Clickable cards to filter table */}
                  {summary.impactBreakdown && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {summary.impactBreakdown.missingInYours !== 0 && (
                        <button
                          onClick={() => setFilter("missing_in_a")}
                          className={`p-3 rounded-lg text-left transition-all ${
                            filter === "missing_in_a"
                              ? "bg-destructive/15 border-2 border-destructive/40 ring-2 ring-destructive/20"
                              : "bg-destructive/5 border border-destructive/20 hover:bg-destructive/10"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <XCircle className="w-4 h-4 text-destructive" />
                            <span className="text-sm font-medium">Missing in Your Records</span>
                          </div>
                          <p className="text-lg font-bold text-destructive">{formatMoney(summary.impactBreakdown.missingInYours)}</p>
                          <p className="text-xs text-muted-foreground">{summary.billedMissingInYours || 0} billed calls provider has that you don&apos;t</p>
                        </button>
                      )}

                      {summary.impactBreakdown.missingInProvider !== 0 && (
                        <button
                          onClick={() => setFilter("missing_in_b")}
                          className={`p-3 rounded-lg text-left transition-all ${
                            filter === "missing_in_b"
                              ? "bg-amber-500/15 border-2 border-amber-500/40 ring-2 ring-amber-500/20"
                              : "bg-amber-500/5 border border-amber-500/20 hover:bg-amber-500/10"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            <span className="text-sm font-medium">Missing in Provider</span>
                          </div>
                          <p className="text-lg font-bold text-amber-500">{formatMoney(summary.impactBreakdown.missingInProvider)}</p>
                          <p className="text-xs text-muted-foreground">{summary.billedMissingInProvider || 0} billed calls you have that provider doesn&apos;t</p>
                        </button>
                      )}

                      {(summary.impactBreakdown.durationMismatches !== 0 || summary.durationMismatches > 0) && (
                        <button
                          onClick={() => setFilter("duration_mismatch")}
                          className={`p-3 rounded-lg text-left transition-all ${
                            filter === "duration_mismatch"
                              ? "bg-blue-500/15 border-2 border-blue-500/40 ring-2 ring-blue-500/20"
                              : "bg-blue-500/5 border border-blue-500/20 hover:bg-blue-500/10"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="w-4 h-4 text-blue-500" />
                            <span className="text-sm font-medium">Duration Differences</span>
                          </div>
                          <p className="text-lg font-bold text-blue-500">{formatMoney(summary.impactBreakdown.durationMismatches)}</p>
                          <p className="text-xs text-muted-foreground">{summary.durationMismatches} calls with different durations</p>
                        </button>
                      )}

                      {(summary.impactBreakdown.rateMismatches !== 0 || summary.rateMismatches > 0) && (
                        <button
                          onClick={() => setFilter("rate_mismatch")}
                          className={`p-3 rounded-lg text-left transition-all ${
                            filter === "rate_mismatch"
                              ? "bg-purple-500/15 border-2 border-purple-500/40 ring-2 ring-purple-500/20"
                              : "bg-purple-500/5 border border-purple-500/20 hover:bg-purple-500/10"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <DollarSign className="w-4 h-4 text-purple-500" />
                            <span className="text-sm font-medium">Rate Differences</span>
                          </div>
                          <p className="text-lg font-bold text-purple-500">{formatMoney(summary.impactBreakdown.rateMismatches)}</p>
                          <p className="text-xs text-muted-foreground">{summary.rateMismatches} calls with different rates</p>
                        </button>
                      )}

                      {(summary.impactBreakdown.costMismatches !== 0 || summary.costMismatches > 0) && (
                        <button
                          onClick={() => setFilter("cost_mismatch")}
                          className={`p-3 rounded-lg text-left transition-all ${
                            filter === "cost_mismatch"
                              ? "bg-orange-500/15 border-2 border-orange-500/40 ring-2 ring-orange-500/20"
                              : "bg-orange-500/5 border border-orange-500/20 hover:bg-orange-500/10"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-4 h-4 text-orange-500" />
                            <span className="text-sm font-medium">Combined Mismatches</span>
                          </div>
                          <p className="text-lg font-bold text-orange-500">{formatMoney(summary.impactBreakdown.costMismatches)}</p>
                          <p className="text-xs text-muted-foreground">{summary.costMismatches} calls with both rate & duration differences</p>
                        </button>
                      )}

                      {(summary.lrnMismatches ?? 0) > 0 && (
                        <button
                          onClick={() => setFilter("lrn_mismatch")}
                          className={`p-3 rounded-lg text-left transition-all ${
                            filter === "lrn_mismatch"
                              ? "bg-pink-500/15 border-2 border-pink-500/40 ring-2 ring-pink-500/20"
                              : "bg-pink-500/5 border border-pink-500/20 hover:bg-pink-500/10"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Database className="w-4 h-4 text-pink-500" />
                            <span className="text-sm font-medium">LRN Mismatches</span>
                          </div>
                          <p className="text-lg font-bold text-pink-500">{summary.lrnMismatches}</p>
                          <p className="text-xs text-muted-foreground">Calls with different LRN dip results - potential billing rate issues</p>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Hung Calls Section - Potential stuck switch issues */}
                  {((summary.hungCallsInYours ?? 0) > 0 || (summary.hungCallsInProvider ?? 0) > 0) && (
                    <button
                      onClick={() => setFilter("hung_calls")}
                      className={`w-full p-4 rounded-lg text-left transition-all ${
                        filter === "hung_calls"
                          ? "bg-cyan-500/15 border-2 border-cyan-500/40 ring-2 ring-cyan-500/20"
                          : "bg-cyan-500/5 border border-cyan-500/20 hover:bg-cyan-500/10"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <PhoneForwarded className="w-5 h-5 text-cyan-500 mt-0.5" />
                        <div>
                          <p className="font-medium mb-1 text-cyan-500">
                            {((summary.hungCallsInYours ?? 0) + (summary.hungCallsInProvider ?? 0)).toLocaleString()} potential hung calls detected
                          </p>
                          <p className="text-sm text-muted-foreground mb-2">
                            Calls with identical durations (3+ calls with exact same duration &gt; 30s) may indicate a stuck switch issue.
                          </p>
                          <div className="flex gap-4 text-sm">
                            {(summary.hungCallsInYours ?? 0) > 0 && (
                              <span className="text-muted-foreground">
                                <span className="font-medium text-foreground">{(summary.hungCallsInYours ?? 0).toLocaleString()}</span> in your records
                                <span className="text-xs ml-1">({summary.hungCallGroupsYours ?? 0} groups)</span>
                              </span>
                            )}
                            {(summary.hungCallsInProvider ?? 0) > 0 && (
                              <span className="text-muted-foreground">
                                <span className="font-medium text-foreground">{(summary.hungCallsInProvider ?? 0).toLocaleString()}</span> in provider records
                                <span className="text-xs ml-1">({summary.hungCallGroupsProvider ?? 0} groups)</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  )}

                  {/* Zero Duration Explanation - Clickable */}
                  {totalZeroDuration > 0 && (
                    <button
                      onClick={() => setFilter("zero_duration")}
                      className={`w-full p-4 rounded-lg text-left transition-all ${
                        filter === "zero_duration"
                          ? "bg-slate-500/15 border-2 border-slate-500/40 ring-2 ring-slate-500/20"
                          : "bg-slate-500/5 border border-slate-500/20 hover:bg-slate-500/10"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <PhoneOff className="w-5 h-5 text-slate-400 mt-0.5" />
                        <div>
                          <p className="font-medium mb-1">
                            {totalZeroDuration.toLocaleString()} records are unanswered call attempts (0 seconds duration)
                          </p>
                          <p className="text-sm text-muted-foreground mb-2">
                            These don&apos;t represent billing discrepancies. One CDR source logs all call attempts while the other only logs answered/billed calls.
                          </p>
                          <div className="flex gap-4 text-sm">
                            {(summary.zeroDurationInYours || 0) > 0 && (
                              <span className="text-muted-foreground">
                                <span className="font-medium text-foreground">{(summary.zeroDurationInYours || 0).toLocaleString()}</span> in your records only
                              </span>
                            )}
                            {(summary.zeroDurationInProvider || 0) > 0 && (
                              <span className="text-muted-foreground">
                                <span className="font-medium text-foreground">{(summary.zeroDurationInProvider || 0).toLocaleString()}</span> in provider records only
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  )}

                  {/* Match Rate */}
                  <div className="flex items-center gap-6 pt-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-accent" />
                      <span className="text-muted-foreground">Match Rate:</span>
                      <span className="font-bold text-accent">
                        {((summary.matchedRecords / Math.max(summary.totalRecordsA, 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      Your Records: <span className="font-medium text-foreground">{summary.totalRecordsA.toLocaleString()}</span>
                    </div>
                    <div className="text-muted-foreground">
                      Provider Records: <span className="font-medium text-foreground">{summary.totalRecordsB.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Discrepancies Table */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-xl bg-card border border-border overflow-hidden"
            >
              {/* Table Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-border gap-4">
                <div>
                  <h2 className="font-display font-semibold text-lg">
                    Discrepancies
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      (showing {filteredDiscrepancies.length.toLocaleString()}
                      {results.hasMore && ` of ${results.totalDiscrepancyCount.toLocaleString()}`})
                    </span>
                  </h2>
                </div>
                <div className="flex items-center gap-4">
                  {/* Zero Duration Toggle */}
                  {filter === "all" && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hideZeroDuration}
                        onChange={(e) => setHideZeroDuration(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span className="text-muted-foreground">Hide zero-duration</span>
                    </label>
                  )}
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <div className="flex flex-wrap rounded-lg bg-muted/50 p-1">
                      {FILTER_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setFilter(option.value)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            filter === option.value
                              ? "bg-accent/20 text-accent"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          title={option.description}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Table with fixed height and scroll */}
              {(() => {
                const visibleColumns = getVisibleColumns(filter);
                const colCount = visibleColumns.size;

                // Helper to render sortable header with tooltip
                const renderHeader = (
                  columnKey: string,
                  label: string,
                  sortKey: SortField | null,
                  align: "left" | "right" | "center" = "left"
                ) => {
                  const isSortable = sortKey !== null;
                  const isActive = sortField === sortKey;
                  const tooltip = COLUMN_TOOLTIPS[columnKey];
                  const alignClass = align === "right" ? "text-right justify-end" : align === "center" ? "text-center justify-center" : "text-left";

                  return (
                    <th
                      className={`px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider ${alignClass} ${isSortable ? "cursor-pointer hover:text-foreground select-none" : ""} group relative`}
                      onClick={isSortable ? () => handleSort(sortKey) : undefined}
                      title={tooltip}
                    >
                      <span className={`flex items-center gap-1 ${alignClass}`}>
                        {label}
                        {isSortable && (
                          isActive
                            ? (sortDirection === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
                            : <ArrowUpDown className="w-3 h-3 opacity-40" />
                        )}
                      </span>
                    </th>
                  );
                };

                return (
                  <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
                    <table className="w-full min-w-max">
                      <thead className="sticky top-0 bg-card z-10">
                        <tr className="border-b border-border bg-muted/30">
                          {visibleColumns.has("type") && renderHeader("type", "Type", null)}
                          {visibleColumns.has("a_number") && renderHeader("a_number", "A-Number", "a_number")}
                          {visibleColumns.has("b_number") && renderHeader("b_number", "B-Number", "b_number")}
                          {visibleColumns.has("time") && renderHeader("time", "Time", "time")}
                          {visibleColumns.has("your_lrn") && renderHeader("your_lrn", "Your LRN", null)}
                          {visibleColumns.has("prov_lrn") && renderHeader("prov_lrn", "Prov. LRN", null)}
                          {visibleColumns.has("your_dur") && renderHeader(
                            "your_dur",
                            filter === "missing_in_b" || filter === "hung_calls" ? "Duration" : "Your Dur.",
                            "duration"
                          )}
                          {visibleColumns.has("prov_dur") && renderHeader(
                            "prov_dur",
                            filter === "missing_in_a" || filter === "hung_calls" ? "Duration" : "Prov. Dur.",
                            "duration"
                          )}
                          {visibleColumns.has("your_cost") && renderHeader(
                            "your_cost",
                            filter === "missing_in_b" ? "Cost" : "Your Cost",
                            "your_cost",
                            "right"
                          )}
                          {visibleColumns.has("prov_cost") && renderHeader(
                            "prov_cost",
                            filter === "missing_in_a" ? "Cost" : "Prov. Cost",
                            "prov_cost",
                            "right"
                          )}
                          {visibleColumns.has("hung_count") && renderHeader("hung_count", "Group Size", "group_size", "center")}
                          {visibleColumns.has("difference") && renderHeader("difference", "Difference", "difference", "right")}
                          {visibleColumns.has("your_row") && renderHeader(
                            "your_row",
                            filter === "missing_in_b" ? "Source Row" : "Your Row",
                            null,
                            "center"
                          )}
                          {visibleColumns.has("prov_row") && renderHeader(
                            "prov_row",
                            filter === "missing_in_a" ? "Source Row" : "Prov. Row",
                            null,
                            "center"
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {filteredDiscrepancies.length === 0 ? (
                          <tr>
                            <td colSpan={colCount} className="px-4 py-12 text-center text-muted-foreground">
                              No discrepancies found for this filter
                            </td>
                          </tr>
                        ) : (
                          filteredDiscrepancies.map((d, i) => (
                            <tr key={i} className="hover:bg-muted/10">
                              {visibleColumns.has("type") && (
                                <td className="px-4 py-3">
                                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-md border ${getTypeColor(d.type)}`}>
                                    {getTypeLabel(d.type)}
                                  </span>
                                </td>
                              )}
                              {visibleColumns.has("a_number") && (
                                <td className="px-4 py-3 font-mono text-sm">{d.a_number}</td>
                              )}
                              {visibleColumns.has("b_number") && (
                                <td className="px-4 py-3 font-mono text-sm">{d.b_number}</td>
                              )}
                              {visibleColumns.has("time") && (
                                <td className="px-4 py-3 text-sm text-muted-foreground">{formatTimestamp(d.seize_time)}</td>
                              )}
                              {visibleColumns.has("your_lrn") && (
                                <td className="px-4 py-3 font-mono text-sm">{d.your_lrn || "-"}</td>
                              )}
                              {visibleColumns.has("prov_lrn") && (
                                <td className="px-4 py-3 font-mono text-sm">{d.provider_lrn || "-"}</td>
                              )}
                              {visibleColumns.has("your_dur") && (
                                <td className="px-4 py-3 font-mono text-sm">{formatDuration(d.your_duration)}</td>
                              )}
                              {visibleColumns.has("prov_dur") && (
                                <td className="px-4 py-3 font-mono text-sm">{formatDuration(d.provider_duration)}</td>
                              )}
                              {visibleColumns.has("your_cost") && (
                                <td className="px-4 py-3 font-mono text-sm text-right">{formatCost(d.your_cost)}</td>
                              )}
                              {visibleColumns.has("prov_cost") && (
                                <td className="px-4 py-3 font-mono text-sm text-right">{formatCost(d.provider_cost)}</td>
                              )}
                              {visibleColumns.has("hung_count") && (
                                <td className="px-4 py-3 font-mono text-sm text-center text-cyan-500 font-bold">
                                  {d.hung_call_count ?? "-"}
                                </td>
                              )}
                              {visibleColumns.has("difference") && (
                                <td className={`px-4 py-3 font-mono text-sm text-right ${
                                  d.cost_difference > 0 ? "text-accent" : d.cost_difference < 0 ? "text-destructive" : "text-muted-foreground"
                                }`}>
                                  {formatDifference(d.cost_difference)}
                                </td>
                              )}
                              {visibleColumns.has("your_row") && (
                                <td className="px-4 py-3 font-mono text-xs text-center text-muted-foreground">
                                  {formatSourceRow(d).yours}
                                </td>
                              )}
                              {visibleColumns.has("prov_row") && (
                                <td className="px-4 py-3 font-mono text-xs text-center text-muted-foreground">
                                  {formatSourceRow(d).provider}
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        </section>
      </div>
    </main>
  );
}
