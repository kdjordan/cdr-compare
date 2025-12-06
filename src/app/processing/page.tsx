"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Database, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useReconciliation, ReconciliationResults } from "@/context/ReconciliationContext";

const PROCESSING_STEPS = [
  { id: "uploading", label: "Uploading files" },
  { id: "processing", label: "Processing CDRs" },
  { id: "matching", label: "Matching records" },
  { id: "analyzing", label: "Analyzing discrepancies" },
  { id: "complete", label: "Generating report" },
];

export default function ProcessingPage() {
  const router = useRouter();
  const { fileA, fileB, mappingA, mappingB, setResults } = useReconciliation();
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const processingStarted = useRef(false);

  // Redirect if no data
  useEffect(() => {
    if (!fileA || !fileB || !mappingA || !mappingB) {
      router.push("/");
    }
  }, [fileA, fileB, mappingA, mappingB, router]);

  // Process the files
  useEffect(() => {
    if (!fileA || !fileB || !mappingA || !mappingB) return;
    if (processingStarted.current) return;
    processingStarted.current = true;

    const processFiles = async () => {
      try {
        // Step 1: Uploading
        setCurrentStep(0);

        const formData = new FormData();
        formData.append("fileA", fileA.file);
        formData.append("fileB", fileB.file);
        formData.append("mappingA", JSON.stringify(mappingA));
        formData.append("mappingB", JSON.stringify(mappingB));

        // Step 2: Processing
        setCurrentStep(1);

        const response = await fetch("/api/process", {
          method: "POST",
          body: formData,
        });

        // Step 3: Matching
        setCurrentStep(2);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.details || errorData.error || "Processing failed");
        }

        // Step 4: Analyzing
        setCurrentStep(3);

        const data = await response.json();

        // Step 5: Complete
        setCurrentStep(4);

        // Store results in context
        const results: ReconciliationResults = {
          jobId: data.jobId,
          summary: data.summary,
          discrepancies: data.discrepancies,
          hasMore: data.hasMore,
          totalDiscrepancyCount: data.totalDiscrepancyCount,
        };
        setResults(results);

        // Small delay before marking complete
        await new Promise((resolve) => setTimeout(resolve, 500));
        setIsComplete(true);

        // Navigate to results after a brief delay
        setTimeout(() => {
          router.push("/results");
        }, 1000);
      } catch (err) {
        console.error("Processing error:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    };

    processFiles();
  }, [fileA, fileB, mappingA, mappingB, router, setResults]);

  if (!fileA || !fileB) {
    return null;
  }

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
              <span>Step 3 of 4</span>
              <span className="text-accent">Processing</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <section className="py-20 px-6">
          <div className="container mx-auto max-w-2xl">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-12"
            >
              <h1 className="font-display text-3xl font-bold tracking-tight mb-3">
                {error ? "Processing Error" : isComplete ? "Processing Complete" : "Processing Your CDRs"}
              </h1>
              <p className="text-muted-foreground">
                {error
                  ? "An error occurred during processing"
                  : isComplete
                    ? "Redirecting to your results..."
                    : `Comparing ${fileA.totalRows.toLocaleString()} records against ${fileB.totalRows.toLocaleString()} records`}
              </p>
            </motion.div>

            {/* Error State */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="relative rounded-2xl p-px bg-gradient-to-b from-destructive/30 via-border/50 to-border/20"
              >
                <div className="relative bg-gradient-to-b from-card to-background rounded-2xl p-8">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-6 h-6 text-destructive" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-display font-semibold text-lg mb-2">Processing Failed</h3>
                      <p className="text-muted-foreground text-sm mb-4">{error}</p>
                      <button
                        onClick={() => router.push("/")}
                        className="px-6 py-3 rounded-xl font-display font-semibold text-sm border bg-accent/10 border-accent/30 text-accent hover:bg-accent/20 transition-all"
                      >
                        Start Over
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Progress Card */}
            {!error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="relative rounded-2xl p-px bg-gradient-to-b from-accent/30 via-border/50 to-border/20"
              >
                <div className="relative bg-gradient-to-b from-card to-background rounded-2xl p-8">
                  {/* Steps */}
                  <div className="space-y-4">
                    {PROCESSING_STEPS.map((step, index) => {
                      const isActive = index === currentStep && !isComplete;
                      const isCompleted = index < currentStep || isComplete;

                      return (
                        <div
                          key={step.id}
                          className={`flex items-center gap-4 p-4 rounded-lg transition-colors ${
                            isActive ? "bg-accent/10" : isCompleted ? "bg-muted/30" : "bg-muted/10"
                          }`}
                        >
                          {/* Status icon */}
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              isCompleted
                                ? "bg-accent/20 text-accent"
                                : isActive
                                  ? "bg-accent/10 text-accent"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle className="w-5 h-5" />
                            ) : isActive ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <span className="text-sm font-mono">{index + 1}</span>
                            )}
                          </div>

                          {/* Label */}
                          <span
                            className={`font-medium ${
                              isActive ? "text-accent" : isCompleted ? "text-foreground" : "text-muted-foreground"
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
