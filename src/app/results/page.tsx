"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Database,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  DollarSign,
  Download,
  ArrowLeft,
  Filter,
} from "lucide-react";
import { useReconciliation, Discrepancy } from "@/context/ReconciliationContext";

type DiscrepancyFilter = "all" | "missing_in_a" | "missing_in_b" | "duration_mismatch" | "rate_mismatch" | "cost_mismatch";

const FILTER_OPTIONS: { value: DiscrepancyFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "missing_in_a", label: "Missing in Yours" },
  { value: "missing_in_b", label: "Missing in Provider" },
  { value: "duration_mismatch", label: "Duration" },
  { value: "rate_mismatch", label: "Rate" },
  { value: "cost_mismatch", label: "Cost" },
];

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

function formatRate(rate: number | null): string {
  if (rate === null) return "-";
  return `$${rate.toFixed(4)}`;
}

function formatMoney(amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}$${amount.toFixed(2)}`;
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
    case "duration_mismatch":
      return "Duration Mismatch";
    case "rate_mismatch":
      return "Rate Mismatch";
    case "cost_mismatch":
      return "Cost Mismatch";
    default:
      return type;
  }
}

function getTypeColor(type: Discrepancy["type"]): string {
  switch (type) {
    case "missing_in_a":
      return "text-destructive bg-destructive/10 border-destructive/20";
    case "missing_in_b":
      return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    case "duration_mismatch":
      return "text-blue-500 bg-blue-500/10 border-blue-500/20";
    case "rate_mismatch":
      return "text-purple-500 bg-purple-500/10 border-purple-500/20";
    case "cost_mismatch":
      return "text-orange-500 bg-orange-500/10 border-orange-500/20";
    default:
      return "text-muted-foreground bg-muted/10 border-muted/20";
  }
}

export default function ResultsPage() {
  const router = useRouter();
  const { results, reset } = useReconciliation();
  const [filter, setFilter] = useState<DiscrepancyFilter>("all");
  const [isExporting, setIsExporting] = useState(false);

  // Redirect if no results
  useEffect(() => {
    if (!results) {
      router.push("/");
    }
  }, [results, router]);

  if (!results) {
    return null;
  }

  const { summary, discrepancies } = results;

  const filteredDiscrepancies =
    filter === "all" ? discrepancies : discrepancies.filter((d) => d.type === filter);

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
        <section className="py-12 px-6">
          <div className="container mx-auto max-w-7xl">
            {/* Page Title */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
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
              className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
            >
              {/* Matched */}
              <div className="rounded-xl bg-card border border-border p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-display">{summary.matchedRecords.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Matched</p>
                  </div>
                </div>
              </div>

              {/* Missing */}
              <div className="rounded-xl bg-card border border-border p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-display">
                      {(summary.missingInYours + summary.missingInProvider).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Missing</p>
                  </div>
                </div>
              </div>

              {/* Mismatches */}
              <div className="rounded-xl bg-card border border-border p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-display">
                      {(summary.durationMismatches + summary.rateMismatches).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Mismatches</p>
                  </div>
                </div>
              </div>

              {/* Monetary Impact */}
              <div className="rounded-xl bg-card border border-border p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p
                      className={`text-2xl font-bold font-display ${
                        summary.monetaryImpact >= 0 ? "text-accent" : "text-destructive"
                      }`}
                    >
                      {formatMoney(summary.monetaryImpact)}
                    </p>
                    <p className="text-xs text-muted-foreground">Net Impact</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Detailed Summary */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-xl bg-card border border-border p-6 mb-8"
            >
              <h2 className="font-display font-semibold text-lg mb-4">Breakdown</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Your Records</p>
                  <p className="font-mono font-medium">{summary.totalRecordsA.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Provider Records</p>
                  <p className="font-mono font-medium">{summary.totalRecordsB.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Missing in Yours</p>
                  <p className="font-mono font-medium text-destructive">{summary.missingInYours.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Missing in Provider</p>
                  <p className="font-mono font-medium text-amber-500">
                    {summary.missingInProvider.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Duration Mismatches</p>
                  <p className="font-mono font-medium text-blue-500">{summary.durationMismatches.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Rate Mismatches</p>
                  <p className="font-mono font-medium text-purple-500">{summary.rateMismatches.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Total Discrepancies</p>
                  <p className="font-mono font-medium">{summary.totalDiscrepancies.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Match Rate</p>
                  <p className="font-mono font-medium text-accent">
                    {((summary.matchedRecords / Math.max(summary.totalRecordsA, 1)) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Discrepancies Table */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-xl bg-card border border-border overflow-hidden"
            >
              {/* Table Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="font-display font-semibold text-lg">
                  Discrepancies
                  {results.hasMore && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      (showing {discrepancies.length.toLocaleString()} of{" "}
                      {results.totalDiscrepancyCount.toLocaleString()})
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <div className="flex rounded-lg bg-muted/50 p-1">
                    {FILTER_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setFilter(option.value)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          filter === option.value
                            ? "bg-accent/20 text-accent"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        A-Number
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        B-Number
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <Clock className="w-3 h-3 inline mr-1" />
                        Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Your Dur.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Prov. Dur.
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Your Cost
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Prov. Cost
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Difference
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filteredDiscrepancies.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                          No discrepancies found for this filter
                        </td>
                      </tr>
                    ) : (
                      filteredDiscrepancies.map((d, i) => (
                        <tr key={i} className="hover:bg-muted/10">
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-md border ${getTypeColor(d.type)}`}>
                              {getTypeLabel(d.type)}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-sm">{d.a_number}</td>
                          <td className="px-4 py-3 font-mono text-sm">{d.b_number}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{formatTimestamp(d.seize_time)}</td>
                          <td className="px-4 py-3 font-mono text-sm">{formatDuration(d.your_duration)}</td>
                          <td className="px-4 py-3 font-mono text-sm">{formatDuration(d.provider_duration)}</td>
                          <td className="px-4 py-3 font-mono text-sm text-right">{formatCost(d.your_cost)}</td>
                          <td className="px-4 py-3 font-mono text-sm text-right">{formatCost(d.provider_cost)}</td>
                          <td
                            className={`px-4 py-3 font-mono text-sm text-right ${
                              d.cost_difference >= 0 ? "text-accent" : "text-destructive"
                            }`}
                          >
                            {formatMoney(d.cost_difference)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        </section>
      </div>
    </main>
  );
}
