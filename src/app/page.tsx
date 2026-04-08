"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Zap,
  Target,
  BarChart3,
  Shield,
  Clock,
  Database,
  Loader2,
  Check,
} from "lucide-react";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { Ripple } from "@/components/ui/ripple";
import { CapacityBanner } from "@/components/ui/CapacityBanner";
import { useReconciliation, ColumnMapping, FilePreview, FileSettings } from "@/context/ReconciliationContext";
import { parseFile } from "@/lib/parser";
import { ColumnMappingModal } from "@/components/mapping/ColumnMappingModal";
import { ScreenshotShowcase } from "@/components/home/ScreenshotShowcase";

// Translate cryptic error messages into user-friendly ones
function getFriendlyErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // JavaScript runtime errors
  if (message.includes("Invalid string length")) {
    return "This file is too large for your browser to process. Try compressing it as a ZIP file, or split it into smaller files.";
  }
  if (message.includes("out of memory") || message.includes("Out of memory")) {
    return "Your browser ran out of memory processing this file. Try closing other tabs or using a smaller file.";
  }
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "Network error. Please check your internet connection and try again.";
  }
  if (message.includes("aborted") || message.includes("ECONNRESET")) {
    return "The connection was interrupted. This may happen with large files on slow connections. Please try again.";
  }

  // File parsing errors
  if (message.includes("Unsupported file format")) {
    return "This file type isn't supported. Please upload a CSV, XLSX, ZIP, or GZ file.";
  }
  if (message.includes("Empty spreadsheet") || message.includes("no data")) {
    return "This file appears to be empty. Please check the file and try again.";
  }
  if (message.includes("No CSV or XLSX files found")) {
    return "No CDR files found in this ZIP archive. Make sure it contains CSV or XLSX files.";
  }

  // Server errors
  if (message.includes("Bad Gateway") || message.includes("502")) {
    return "The server is temporarily unavailable. Please wait a moment and try again.";
  }
  if (message.includes("Server memory is low")) {
    return message; // Already user-friendly
  }
  if (message.includes("Server is busy")) {
    return message; // Already user-friendly
  }

  // Default: return original if it seems user-friendly, otherwise generic message
  if (message.length < 100 && !message.includes("at ") && !message.includes("Error:")) {
    return message;
  }

  return "Something went wrong processing your file. Please try again or contact support if the problem persists.";
}

type UploadStep = "file_a" | "mapping_a" | "file_b" | "mapping_b" | "ready";

export default function Home() {
  const router = useRouter();
  const { setFileA, setFileB, setMappingA, setMappingB, setSettingsA, setSettingsB, mappingA, mappingB, fileA, fileB } = useReconciliation();

  const [step, setStep] = useState<UploadStep>("file_a");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File A state
  const [localFileA, setLocalFileA] = useState<File | null>(null);
  const [parsedFileA, setParsedFileA] = useState<FilePreview | null>(null);
  const [localMappingA, setLocalMappingA] = useState<ColumnMapping | null>(null);

  // File B state
  const [localFileB, setLocalFileB] = useState<File | null>(null);
  const [parsedFileB, setParsedFileB] = useState<FilePreview | null>(null);
  const [localMappingB, setLocalMappingB] = useState<ColumnMapping | null>(null);

  // Settings state
  const [localSettingsA, setLocalSettingsA] = useState<FileSettings | null>(null);
  const [localSettingsB, setLocalSettingsB] = useState<FileSettings | null>(null);

  // Navigation state - wait for context to update before navigating
  const [pendingVerify, setPendingVerify] = useState(false);

  // Server capacity state
  const [isServerBusy, setIsServerBusy] = useState(false);

  // Check server capacity on mount and poll while busy
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    const checkCapacity = async () => {
      try {
        const res = await fetch("/api/process");
        if (res.ok) {
          const data = await res.json();
          setIsServerBusy(!data.available);
        } else {
          // Fail-open: if endpoint errors, assume available
          setIsServerBusy(false);
        }
      } catch {
        // Fail-open: if fetch fails, assume available
        setIsServerBusy(false);
      }
    };

    // Initial check
    checkCapacity();

    // Start polling every 15s
    pollInterval = setInterval(checkCapacity, 15000);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  useEffect(() => {
    if (pendingVerify && fileA && fileB && mappingA && mappingB) {
      setPendingVerify(false);
      router.push("/mapping/verify");
    }
  }, [pendingVerify, fileA, fileB, mappingA, mappingB, router]);

  // Handle File A upload
  const handleFileASelect = async (file: File) => {
    console.log("[Page] handleFileASelect called with:", file.name);
    setLocalFileA(file);
    setIsProcessing(true);
    setError(null);

    try {
      console.log("[Page] About to parse file");
      const parsed = await parseFile(file);
      console.log("[Page] File parsed successfully:", parsed.headers.length, "columns");
      setParsedFileA({
        file,
        headers: parsed.headers,
        sampleRows: parsed.sampleRows,
        totalRows: parsed.totalRows,
      });
      setStep("mapping_a");
    } catch (err) {
      console.error("[Page] Parse error:", err);
      setError(getFriendlyErrorMessage(err));
      setLocalFileA(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle File A mapping confirmation
  const handleMappingAConfirm = (mapping: ColumnMapping, settings: FileSettings) => {
    setLocalMappingA(mapping);
    setLocalSettingsA(settings);
    setStep("file_b");
  };

  // Handle File B upload
  const handleFileBSelect = async (file: File) => {
    setLocalFileB(file);
    setIsProcessing(true);
    setError(null);

    try {
      const parsed = await parseFile(file);
      setParsedFileB({
        file,
        headers: parsed.headers,
        sampleRows: parsed.sampleRows,
        totalRows: parsed.totalRows,
      });
      setStep("mapping_b");
    } catch (err) {
      console.error("[Page] Parse error:", err);
      setError(getFriendlyErrorMessage(err));
      setLocalFileB(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle File B mapping confirmation
  const handleMappingBConfirm = (mapping: ColumnMapping, settings: FileSettings) => {
    setLocalMappingB(mapping);
    setLocalSettingsB(settings);
    setStep("ready");
  };

  // Handle start processing - go to verification first
  const handleStartProcessing = () => {
    if (!parsedFileA || !parsedFileB || !localMappingA || !localMappingB || !localSettingsA || !localSettingsB) return;

    setFileA(parsedFileA);
    setFileB(parsedFileB);
    setMappingA(localMappingA);
    setMappingB(localMappingB);
    setSettingsA(localSettingsA);
    setSettingsB(localSettingsB);
    setPendingVerify(true);
  };

  // Reset file A and start over
  const handleClearFileA = () => {
    setLocalFileA(null);
    setParsedFileA(null);
    setLocalMappingA(null);
    setLocalFileB(null);
    setParsedFileB(null);
    setLocalMappingB(null);
    setStep("file_a");
  };

  // Reset file B
  const handleClearFileB = () => {
    setLocalFileB(null);
    setParsedFileB(null);
    setLocalMappingB(null);
    setStep("file_b");
  };

  const isFileAComplete = step !== "file_a" && step !== "mapping_a";
  const isFileBComplete = step === "ready";

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background layers */}
      <div className="fixed inset-0 gradient-mesh" />
      <div className="fixed inset-0 grid-pattern opacity-30" />
      <div className="fixed inset-0 noise pointer-events-none" />

      {/* Content */}
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
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span>System Online</span>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="pt-20 pb-8 px-6 relative">
          {/* Ripple effect centered in hero - hidden on mobile for performance */}
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden hidden md:flex">
            <div className="relative w-[1400px] h-[1400px]">
              <Ripple
                mainCircleSize={120}
                mainCircleOpacity={0.45}
                numCircles={10}
              />
            </div>
          </div>

          <div className="container mx-auto max-w-5xl relative z-10">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex justify-center mb-8"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/5 border border-accent/20 text-sm">
                <Zap className="w-3.5 h-3.5 text-accent" />
                <span className="text-muted-foreground">
                  Professional-Grade Reconciliation
                </span>
              </div>
            </motion.div>

            {/* Main heading */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-center mb-6"
            >
              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
                Identify billing
                <br />
                <span className="text-gradient">discrepancies</span>
                <br />
                in minutes
              </h1>
            </motion.div>

            {/* Subheading */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-center text-lg text-muted-foreground max-w-2xl mx-auto mb-16 leading-relaxed"
            >
              Upload your internal CDRs alongside provider records. Our matching
              engine normalizes, compares, and surfaces every mismatch, missing
              record, and billing difference.
            </motion.p>

            {/* Stats row */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex justify-center gap-12 mb-16"
            >
              {[
                { value: "2M+", label: "Records/file" },
                { value: "<30s", label: "Match time" },
                { value: "1s", label: "Time tolerance" },
              ].map((stat, i) => (
                <div key={i} className="text-center">
                  <div className="font-mono text-2xl font-bold text-accent tabular-nums">
                    {stat.value}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
                    {stat.label}
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Upload Section - Primary CTA */}
        <section className="py-16 px-6 relative">
          {/* Section background glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/[0.03] to-transparent" />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="container mx-auto max-w-4xl relative"
          >
            {/* Glowing card container */}
            <div className="relative rounded-2xl p-px bg-gradient-to-b from-accent/40 via-accent/10 to-transparent">
              {/* Inner glow effect */}
              <div className="absolute -inset-1 bg-accent/20 rounded-2xl blur-xl opacity-50" />

              {/* Card content */}
              <div className="relative bg-gradient-to-b from-card to-background rounded-2xl p-8 md:p-10">
                {/* Capacity warning banner */}
                <CapacityBanner visible={isServerBusy} />

                {/* Section header */}
                <div className="text-center mb-8">
                  <h2 className="font-display text-2xl font-bold tracking-tight mb-2">
                    Start Your Reconciliation
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Upload and map each file, then compare
                  </p>
                </div>

                {/* Progress stepper */}
                <div className="flex items-center justify-center gap-2 mb-8">
                  {/* Step 1: Your CDRs */}
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
                    isFileAComplete ? 'bg-accent/20 text-accent' : step === 'file_a' || step === 'mapping_a' ? 'bg-accent/10 text-accent' : 'bg-muted/50 text-muted-foreground'
                  }`}>
                    {isFileAComplete ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-current flex items-center justify-center text-[10px] font-bold">1</div>
                    )}
                    <span>Your CDRs</span>
                  </div>

                  <div className={`w-8 h-px ${isFileAComplete ? 'bg-accent' : 'bg-border'}`} />

                  {/* Step 2: Their CDRs */}
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
                    isFileBComplete ? 'bg-accent/20 text-accent' : step === 'file_b' || step === 'mapping_b' ? 'bg-accent/10 text-accent' : 'bg-muted/50 text-muted-foreground'
                  }`}>
                    {isFileBComplete ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-current flex items-center justify-center text-[10px] font-bold">2</div>
                    )}
                    <span>Their CDRs</span>
                  </div>

                  <div className={`w-8 h-px ${isFileBComplete ? 'bg-accent' : 'bg-border'}`} />

                  {/* Step 3: Compare */}
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
                    step === 'ready' ? 'bg-accent/10 text-accent' : 'bg-muted/50 text-muted-foreground'
                  }`}>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-current flex items-center justify-center text-[10px] font-bold">3</div>
                    <span>Compare</span>
                  </div>
                </div>

                {/* Dynamic upload area */}
                <div className="space-y-6 mb-8">
                  {/* File A section */}
                  {!isFileAComplete ? (
                    <FileDropzone
                      label="Your CDRs"
                      sublabel="Internal call detail records"
                      selectedFile={localFileA}
                      onFileSelect={handleFileASelect}
                      onClear={handleClearFileA}
                      disabled={isServerBusy}
                    />
                  ) : (
                    <div className="flex items-center justify-between p-4 rounded-xl bg-accent/5 border border-accent/20">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                          <Check className="w-5 h-5 text-accent" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">Your CDRs</p>
                          <p className="text-xs text-muted-foreground font-mono">{localFileA?.name}</p>
                        </div>
                      </div>
                      <button
                        onClick={handleClearFileA}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Change
                      </button>
                    </div>
                  )}

                  {/* File B section - only show after File A is complete */}
                  {isFileAComplete && (
                    <>
                      {!isFileBComplete ? (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <FileDropzone
                            label="Their CDRs"
                            sublabel="Counterparty records to compare"
                            selectedFile={localFileB}
                            onFileSelect={handleFileBSelect}
                            onClear={handleClearFileB}
                            disabled={isServerBusy}
                          />
                        </motion.div>
                      ) : (
                        <div className="flex items-center justify-between p-4 rounded-xl bg-accent/5 border border-accent/20">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                              <Check className="w-5 h-5 text-accent" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">Their CDRs</p>
                              <p className="text-xs text-muted-foreground font-mono">{localFileB?.name}</p>
                            </div>
                          </div>
                          <button
                            onClick={handleClearFileB}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Change
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Error message */}
                {error && (
                  <div className="text-center text-sm text-destructive mb-4">
                    {error}
                  </div>
                )}

                {/* Processing indicator */}
                {isProcessing && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Parsing file...</span>
                  </div>
                )}

                {/* CTA Button - only show when ready */}
                {step === 'ready' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center"
                  >
                    <button
                      onClick={handleStartProcessing}
                      className="group relative px-10 py-4 rounded-xl font-display font-semibold text-base border bg-accent/10 border-accent/30 text-accent hover:bg-accent/20 transition-all duration-300 flex items-center gap-3"
                    >
                      <span>Start Comparison</span>
                      <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </button>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </section>

        {/* Column Mapping Modals */}
        {parsedFileA && (
          <ColumnMappingModal
            isOpen={step === "mapping_a"}
            onClose={handleClearFileA}
            onConfirm={handleMappingAConfirm}
            fileName={parsedFileA.file.name}
            headers={parsedFileA.headers}
            sampleRows={parsedFileA.sampleRows}
            fileLabel="Your CDRs"
          />
        )}

        {parsedFileB && (
          <ColumnMappingModal
            isOpen={step === "mapping_b"}
            onClose={handleClearFileB}
            onConfirm={handleMappingBConfirm}
            fileName={parsedFileB.file.name}
            headers={parsedFileB.headers}
            sampleRows={parsedFileB.sampleRows}
            fileLabel="Their CDRs"
          />
        )}

        {/* Divider */}
        <div className="container mx-auto max-w-5xl px-6">
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>

        {/* Features Section */}
        <section className="py-20 px-6">
          <div className="container mx-auto max-w-5xl">
            {/* Section header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-center mb-16"
            >
              <h2 className="font-display text-3xl font-bold tracking-tight mb-4">
                Built for scale and precision
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                Purpose-built for VoIP carriers handling millions of daily
                records. Every detail matters when reconciling billing.
              </p>
            </motion.div>

            {/* Features grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  icon: Zap,
                  title: "Lightning Fast",
                  description:
                    "Process millions of records in under 30 seconds using optimized SQLite matching.",
                  delay: 0,
                },
                {
                  icon: Target,
                  title: "Intelligent Matching",
                  description:
                    "Automatic phone number normalization handles international formats and prefixes.",
                  delay: 0.1,
                },
                {
                  icon: BarChart3,
                  title: "Clear Reports",
                  description:
                    "Detailed breakdown of discrepancies with monetary impact calculations.",
                  delay: 0.2,
                },
                {
                  icon: Shield,
                  title: "Data Privacy",
                  description:
                    "All processing happens in ephemeral memory. Your CDRs never leave your session.",
                  delay: 0.3,
                },
                {
                  icon: Clock,
                  title: "1s Tolerance",
                  description:
                    "Configurable time window for matching calls across provider systems.",
                  delay: 0.4,
                },
                {
                  icon: Database,
                  title: "Format Flexible",
                  description:
                    "Upload CSV, XLSX, or ZIP files. Map any column schema to our canonical format.",
                  delay: 0.5,
                },
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: feature.delay }}
                  className="group relative"
                >
                  {/* Glow border container */}
                  <div className="relative rounded-xl p-px bg-gradient-to-b from-accent/30 via-border/50 to-border/20 hover:from-accent/50 hover:via-accent/20 hover:to-border/30 transition-all duration-500">
                    {/* Hover glow effect */}
                    <div className="absolute -inset-1 bg-accent/10 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    {/* Card content */}
                    <div className="relative bg-gradient-to-b from-card to-card/80 rounded-xl p-6">
                      <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center mb-4 group-hover:bg-accent/20 group-hover:border-accent/40 transition-all duration-300">
                        <feature.icon className="w-5 h-5 text-accent/70 group-hover:text-accent transition-colors duration-300" />
                      </div>
                      <h3 className="font-display font-semibold mb-2 tracking-tight">
                        {feature.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 px-6 relative">
          {/* Section background */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/[0.02] to-transparent" />

          <div className="container mx-auto max-w-5xl relative">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-center mb-16"
            >
              <h2 className="font-display text-3xl font-bold tracking-tight mb-4">
                Three steps to reconciliation
              </h2>
              <p className="text-muted-foreground">
                From upload to actionable insights in under a minute
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  step: "01",
                  title: "Upload Files",
                  description:
                    "Drop your internal CDRs and provider records. We handle CSV, XLSX, and ZIP.",
                },
                {
                  step: "02",
                  title: "Map Columns",
                  description:
                    "Our smart detection suggests mappings. Confirm A-number, B-number, timestamps, and rates.",
                },
                {
                  step: "03",
                  title: "Review Results",
                  description:
                    "See every discrepancy: missing calls, duration mismatches, rate differences.",
                },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.15 }}
                  className="group relative"
                >
                  {/* Glow border container */}
                  <div className="relative rounded-xl p-px bg-gradient-to-b from-accent/20 via-border/40 to-border/10 hover:from-accent/40 hover:via-accent/15 transition-all duration-500">
                    {/* Hover glow */}
                    <div className="absolute -inset-1 bg-accent/10 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    {/* Card content */}
                    <div className="relative bg-gradient-to-b from-card to-background rounded-xl p-6 h-full">
                      {/* Step number */}
                      <div className="font-mono text-4xl font-bold text-accent/20 group-hover:text-accent/40 transition-colors duration-300 mb-3">
                        {item.step}
                      </div>
                      <h3 className="font-display font-semibold text-lg mb-2 tracking-tight">
                        {item.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  {/* Connector arrow */}
                  {i < 2 && (
                    <div className="hidden md:flex absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                      <div className="w-6 h-px bg-gradient-to-r from-accent/40 to-accent/10" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Screenshot Showcase */}
        <section className="py-20 px-6">
          <div className="container mx-auto max-w-5xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-center mb-12"
            >
              <h2 className="font-display text-3xl font-bold tracking-tight mb-4">
                See it in action
              </h2>
              <p className="text-muted-foreground">
                A clean, intuitive interface designed for speed and clarity
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <ScreenshotShowcase />
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 px-6 border-t border-border/50">
          <div className="container mx-auto max-w-5xl">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="text-sm text-muted-foreground">
                © 2026 CDRCheck - All rights reserved.
              </div>
              <div className="text-xs text-muted-foreground">
                Built with <span className="text-red-500">❤️</span> by{" "}
                <a
                  href="https://kevinjordan.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:text-accent/80 transition-colors font-medium group"
                >
                  Kevin Jordan
                  <svg
                    className="w-3 h-3 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H7M17 7v10" />
                  </svg>
                </a>
              </div>
              <div className="text-xs text-muted-foreground">
                If you like this, you might like{" "}
                <a
                  href="https://voipaccelerator.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:text-accent/80 transition-colors font-medium group"
                >
                  VoIP Accelerator
                  <svg
                    className="w-3 h-3 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H7M17 7v10" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
