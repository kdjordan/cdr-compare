"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Database, Loader2, CheckCircle, AlertCircle, Users, RefreshCw } from "lucide-react";
import { useReconciliation, ReconciliationResults } from "@/context/ReconciliationContext";

// Translate cryptic error messages into user-friendly ones
function getFriendlyErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Network/connection errors
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "Network error. Please check your internet connection and try again.";
  }
  if (message.includes("aborted") || message.includes("ECONNRESET")) {
    return "The upload was interrupted. This can happen with large files on slow connections. Please try again.";
  }
  if (message.includes("Bad Gateway") || message.includes("502")) {
    return "The server is temporarily unavailable. Please wait a moment and try again.";
  }
  if (message.includes("timeout") || message.includes("Timeout")) {
    return "The request timed out. This can happen with very large files. Please try again.";
  }

  // Server errors (already user-friendly)
  if (message.includes("Server memory is low") || message.includes("Server is busy")) {
    return message;
  }

  // File errors
  if (message.includes("File size exceeds")) {
    return message;
  }
  if (message.includes("Invalid file type")) {
    return "This file type isn't supported. Please upload CSV, XLSX, ZIP, or GZ files.";
  }
  if (message.includes("no data") || message.includes("empty")) {
    return "One or both files appear to be empty. Please check your files and try again.";
  }

  // Default: return original if it seems user-friendly, otherwise generic message
  if (message.length < 150 && !message.includes("at ") && !message.includes("Error:")) {
    return message;
  }

  return "Something went wrong during processing. Please try again or contact support if the problem persists.";
}

const PROCESSING_STEPS = [
  { id: "uploading", label: "Uploading & processing files" },
  { id: "processing", label: "Parsing records" },
  { id: "matching", label: "Matching records" },
  { id: "analyzing", label: "Analyzing discrepancies" },
  { id: "complete", label: "Generating report" },
];

export default function ProcessingPage() {
  const router = useRouter();
  const { fileA, fileB, mappingA, mappingB, settingsA, settingsB, setResults } = useReconciliation();
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isServerBusy, setIsServerBusy] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const processingStarted = useRef(false);

  // Redirect if no data
  useEffect(() => {
    if (!fileA || !fileB || !mappingA || !mappingB) {
      router.push("/");
    }
  }, [fileA, fileB, mappingA, mappingB, router]);

  // Retry handler
  const handleRetry = () => {
    setIsServerBusy(false);
    setError(null);
    processingStarted.current = false;
    setRetryCount((c) => c + 1);
  };

  // Process the files
  useEffect(() => {
    if (!fileA || !fileB || !mappingA || !mappingB) return;
    if (processingStarted.current) return;
    processingStarted.current = true;

    const processFiles = async () => {
      try {
        // Reset states on retry
        setIsServerBusy(false);
        setError(null);

        // Step 1: Uploading - stays on this step until server responds
        setCurrentStep(0);

        const formData = new FormData();
        formData.append("fileA", fileA.file);
        formData.append("fileB", fileB.file);
        formData.append("mappingA", JSON.stringify(mappingA));
        formData.append("mappingB", JSON.stringify(mappingB));
        formData.append("settingsA", JSON.stringify(settingsA));
        formData.append("settingsB", JSON.stringify(settingsB));

        // Upload and wait for server response
        // Note: fetch() includes both upload AND server processing time
        const response = await fetch("/api/process", {
          method: "POST",
          body: formData,
        });

        // Step 2-4: Server has responded, processing is done
        // (server does upload, parse, match, analyze all in one request)
        setCurrentStep(3);

        if (!response.ok) {
          // Handle server busy (503) specially
          if (response.status === 503) {
            setIsServerBusy(true);
            setCurrentStep(0);
            return;
          }
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
        setError(getFriendlyErrorMessage(err));
      }
    };

    processFiles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileA, fileB, mappingA, mappingB, router, setResults, retryCount]);

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
                CDR<span className="text-accent">Check</span>
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
                {error ? "Processing Error" : isServerBusy ? "Server Busy" : isComplete ? "Processing Complete" : "Processing Your CDRs"}
              </h1>
              <p className="text-muted-foreground">
                {error
                  ? "An error occurred during processing"
                  : isServerBusy
                    ? "All processing slots are currently in use"
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

            {/* Server Busy State */}
            {isServerBusy && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="relative rounded-2xl p-px bg-gradient-to-b from-blue-500/30 via-border/50 to-border/20"
              >
                <div className="relative bg-gradient-to-b from-card to-background rounded-2xl p-8">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <Users className="w-6 h-6 text-blue-500" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-display font-semibold text-lg mb-2">Server is at Capacity</h3>
                      <p className="text-muted-foreground text-sm mb-4">
                        Other users are currently processing files. Please wait a moment and try again.
                        Your files are still ready - just click retry when you&apos;re ready.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={handleRetry}
                          className="px-6 py-3 rounded-xl font-display font-semibold text-sm border bg-blue-500/10 border-blue-500/30 text-blue-500 hover:bg-blue-500/20 transition-all flex items-center gap-2"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Try Again
                        </button>
                        <button
                          onClick={() => router.push("/")}
                          className="px-6 py-3 rounded-xl font-display font-medium text-sm bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                        >
                          Start Over
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Progress Card */}
            {!error && !isServerBusy && (
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
