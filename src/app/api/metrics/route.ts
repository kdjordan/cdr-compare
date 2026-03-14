import { NextRequest, NextResponse } from "next/server";
import { getMetrics } from "@/lib/metrics";

const METRICS_SECRET = process.env.METRICS_SECRET;

export async function GET(request: NextRequest) {
  // Check for secret key
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!METRICS_SECRET) {
    return NextResponse.json(
      { error: "Metrics endpoint not configured. Set METRICS_SECRET env var." },
      { status: 503 }
    );
  }

  if (key !== METRICS_SECRET) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const metrics = getMetrics();
    return NextResponse.json(metrics);
  } catch (error) {
    console.error("[Metrics] Error fetching metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
