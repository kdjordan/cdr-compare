import { NextRequest, NextResponse } from "next/server";

// Speed test endpoint - receives a small payload and returns timing info
// Used to estimate upload speed before large file uploads

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Read the test payload
    const blob = await request.blob();
    const bytesReceived = blob.size;

    const endTime = Date.now();
    const durationMs = endTime - startTime;

    // Calculate speed in bytes per second
    const bytesPerSecond = durationMs > 0 ? (bytesReceived / durationMs) * 1000 : 0;

    return NextResponse.json({
      success: true,
      bytesReceived,
      durationMs,
      bytesPerSecond,
      mbPerSecond: bytesPerSecond / (1024 * 1024),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Speed test failed" },
      { status: 500 }
    );
  }
}

// Also support GET for health check
export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "speed-test" });
}
