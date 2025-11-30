"use client";

import React, { ComponentPropsWithoutRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface RippleProps extends ComponentPropsWithoutRef<"div"> {
  mainCircleSize?: number;
  mainCircleOpacity?: number;
  numCircles?: number;
}

export const Ripple = React.memo(function Ripple({
  mainCircleSize = 210,
  mainCircleOpacity = 0.24,
  numCircles = 8,
  className,
  ...props
}: RippleProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 select-none",
        className
      )}
      {...props}
    >
      {Array.from({ length: numCircles }, (_, i) => {
        const size = mainCircleSize + i * 70;
        const opacity = mainCircleOpacity - i * 0.015;
        const animationDelay = i * 0.15;

        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: size,
              height: size,
              opacity: Math.max(opacity, 0.08),
              border: "1px solid hsl(156 72% 48% / 0.45)",
              background: "hsl(156 72% 48% / 0.04)",
              top: "50%",
              left: "50%",
              x: "-50%",
              y: "-50%",
            }}
            animate={{
              scale: [1, 0.9, 1],
            }}
            transition={{
              duration: 3,
              ease: "easeInOut",
              repeat: Infinity,
              delay: animationDelay,
            }}
          />
        );
      })}
    </div>
  );
});

Ripple.displayName = "Ripple";
export type { RippleProps };
