"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

const screenshots = [
  {
    id: "mapping",
    label: "Column Mapping",
    src: "/screenshots/mapping.png",
    description: "Smart auto-detection maps your columns to standard CDR fields",
  },
  {
    id: "verify",
    label: "Verify",
    src: "/screenshots/verify.png",
    description: "Review your mappings and validate data before processing",
  },
  {
    id: "processing",
    label: "Processing",
    src: "/screenshots/processing.png",
    description: "Watch as millions of records are compared in seconds",
  },
  {
    id: "report",
    label: "Results",
    src: "/screenshots/report.png",
    description: "Detailed breakdown of matches, mismatches, and missing calls",
  },
];

export function ScreenshotShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isInView, setIsInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = screenshots[activeIndex];

  // Intersection Observer - start auto-rotate when in viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0.3 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Auto-rotate every 2 seconds when in view
  useEffect(() => {
    if (!isInView) return;

    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % screenshots.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [isInView]);

  return (
    <div ref={containerRef} className="w-full max-w-5xl mx-auto">
      {/* Tab buttons */}
      <div className="flex justify-center gap-2 mb-6">
        {screenshots.map((screenshot, index) => (
          <button
            key={screenshot.id}
            onClick={() => setActiveIndex(index)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300
              ${
                index === activeIndex
                  ? "bg-accent/20 text-accent border border-accent/30"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-transparent"
              }
            `}
          >
            {screenshot.label}
          </button>
        ))}
      </div>

      {/* Browser mockup with glowing border */}
      <div className="relative group">
        {/* Animated glow effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-accent/50 via-accent/20 to-accent/50 rounded-xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
        <div className="absolute -inset-0.5 bg-gradient-to-b from-accent/30 via-border/50 to-border/20 rounded-xl" />

        {/* Browser frame */}
        <div className="relative rounded-xl overflow-hidden bg-gradient-to-b from-card to-background">
          {/* Browser header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border/50">
            {/* Traffic lights */}
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            {/* URL bar */}
            <div className="flex-1 mx-4">
              <div className="bg-background/50 rounded-md px-3 py-1.5 text-xs text-muted-foreground font-mono flex items-center gap-2">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                cdrcheck.com
              </div>
            </div>
          </div>

          {/* Screenshot content */}
          <div className="relative aspect-[16/10] bg-background">
            <AnimatePresence mode="wait">
              <motion.div
                key={active.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0"
              >
                <Image
                  src={active.src}
                  alt={active.label}
                  fill
                  className="object-cover object-top"
                  priority
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Description */}
      <AnimatePresence mode="wait">
        <motion.p
          key={active.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="text-center text-muted-foreground mt-6"
        >
          {active.description}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
