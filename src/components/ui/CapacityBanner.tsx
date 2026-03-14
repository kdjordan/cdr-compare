"use client";

import { AlertCircle } from "lucide-react";

interface CapacityBannerProps {
  visible: boolean;
}

export function CapacityBanner({ visible }: CapacityBannerProps) {
  if (!visible) return null;

  return (
    <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-amber-200">
            Server at capacity
          </p>
          <p className="text-xs text-amber-200/70">
            CDRCheck is a free service with limited compute. The server is
            currently busy processing other reports. Please try again in a
            moment.
          </p>
        </div>
      </div>
    </div>
  );
}
