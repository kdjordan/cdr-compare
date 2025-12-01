"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Zap,
  Target,
  BarChart3,
  Shield,
  Clock,
  Database,
} from "lucide-react";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { Ripple } from "@/components/ui/ripple";

export default function Home() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);

  const bothFilesSelected = fileA && fileB;

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
                CDR<span className="text-accent">Reconcile</span>
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
          {/* Ripple effect centered in hero */}
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <div className="relative w-[1400px] h-[1400px]">
              <Ripple
                mainCircleSize={120}
                mainCircleOpacity={0.45}
                numCircles={14}
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
                in seconds
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
                {/* Section header */}
                <div className="text-center mb-8">
                  <h2 className="font-display text-2xl font-bold tracking-tight mb-2">
                    Start Your Reconciliation
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Upload both files to begin comparing records
                  </p>
                </div>

                {/* Upload grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <FileDropzone
                    label="Your CDRs"
                    sublabel="Internal call detail records"
                    selectedFile={fileA}
                    onFileSelect={setFileA}
                    onClear={() => setFileA(null)}
                  />

                  <FileDropzone
                    label="Provider CDRs"
                    sublabel="Counterparty records to compare"
                    selectedFile={fileB}
                    onFileSelect={setFileB}
                    onClear={() => setFileB(null)}
                  />
                </div>

                {/* Progress indicator */}
                <div className="flex items-center justify-center gap-3 mb-6">
                  <div className={`flex items-center gap-2 text-sm ${fileA ? 'text-accent' : 'text-muted-foreground'}`}>
                    <div className={`w-2 h-2 rounded-full ${fileA ? 'bg-accent' : 'bg-muted-foreground/30'}`} />
                    <span>Your CDRs</span>
                  </div>
                  <div className="w-8 h-px bg-border" />
                  <div className={`flex items-center gap-2 text-sm ${fileB ? 'text-accent' : 'text-muted-foreground'}`}>
                    <div className={`w-2 h-2 rounded-full ${fileB ? 'bg-accent' : 'bg-muted-foreground/30'}`} />
                    <span>Provider CDRs</span>
                  </div>
                  <div className="w-8 h-px bg-border" />
                  <div className={`flex items-center gap-2 text-sm ${bothFilesSelected ? 'text-accent' : 'text-muted-foreground'}`}>
                    <div className={`w-2 h-2 rounded-full ${bothFilesSelected ? 'bg-accent' : 'bg-muted-foreground/30'}`} />
                    <span>Ready</span>
                  </div>
                </div>

                {/* CTA Button */}
                <div className="flex justify-center">
                  <button
                    disabled={!bothFilesSelected}
                    className={`
                      group relative px-10 py-4 rounded-xl font-display font-semibold text-base
                      transition-all duration-300 flex items-center gap-3
                      ${
                        bothFilesSelected
                          ? "bg-accent text-accent-foreground glow-accent hover:scale-[1.02] active:scale-[0.98]"
                          : "bg-muted/50 text-muted-foreground cursor-not-allowed"
                      }
                    `}
                  >
                    <span>Continue to Column Mapping</span>
                    <ArrowRight
                      className={`w-4 h-4 transition-transform duration-300 ${
                        bothFilesSelected ? "group-hover:translate-x-1" : ""
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

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

        {/* Footer */}
        <footer className="py-8 px-6 border-t border-border/50">
          <div className="container mx-auto max-w-5xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="w-6 h-6 rounded bg-accent/10 flex items-center justify-center">
                  <Database className="w-3 h-3 text-accent" />
                </div>
                <span className="font-display">CDRReconcile</span>
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                Demo Test Build • December 2025
              </div>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
