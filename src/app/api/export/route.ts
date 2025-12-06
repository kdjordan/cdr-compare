import { NextRequest, NextResponse } from "next/server";

interface Discrepancy {
  type: string;
  a_number: string;
  b_number: string;
  seize_time: number | null;
  your_duration: number | null;
  provider_duration: number | null;
  your_rate: number | null;
  provider_rate: number | null;
  difference: number | null;
}

interface Summary {
  totalRecordsA: number;
  totalRecordsB: number;
  matchedRecords: number;
  missingInYours: number;
  missingInProvider: number;
  durationMismatches: number;
  rateMismatches: number;
  totalDiscrepancies: number;
  monetaryImpact: number;
}

export async function POST(request: NextRequest) {
  try {
    const { discrepancies, summary } = (await request.json()) as {
      discrepancies: Discrepancy[];
      summary: Summary;
    };

    // Generate CSV content
    const headers = [
      "Type",
      "A-Number",
      "B-Number",
      "Seize Time",
      "Your Duration (s)",
      "Provider Duration (s)",
      "Your Rate",
      "Provider Rate",
      "Difference ($)",
    ];

    const rows = discrepancies.map((d) => [
      d.type === "missing_in_a"
        ? "Missing in Your Records"
        : d.type === "missing_in_b"
          ? "Missing in Provider Records"
          : d.type === "duration_mismatch"
            ? "Duration Mismatch"
            : d.type === "rate_mismatch"
              ? "Rate Mismatch"
              : d.type,
      d.a_number,
      d.b_number,
      d.seize_time ? new Date(d.seize_time * 1000).toISOString() : "",
      d.your_duration ?? "",
      d.provider_duration ?? "",
      d.your_rate?.toFixed(4) ?? "",
      d.provider_rate?.toFixed(4) ?? "",
      d.difference?.toFixed(4) ?? "",
    ]);

    // Build CSV with summary header
    const summaryRows = [
      ["CDR Reconciliation Report"],
      ["Generated", new Date().toISOString()],
      [""],
      ["Summary"],
      ["Your Total Records", summary.totalRecordsA],
      ["Provider Total Records", summary.totalRecordsB],
      ["Matched Records", summary.matchedRecords],
      ["Missing in Your Records", summary.missingInYours],
      ["Missing in Provider Records", summary.missingInProvider],
      ["Duration Mismatches", summary.durationMismatches],
      ["Rate Mismatches", summary.rateMismatches],
      ["Total Discrepancies", summary.totalDiscrepancies],
      ["Total Monetary Impact", `$${summary.monetaryImpact}`],
      [""],
      ["Discrepancy Details"],
      headers,
      ...rows,
    ];

    const csv = summaryRows
      .map((row) =>
        row
          .map((cell) => {
            const str = String(cell ?? "");
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(",")
      )
      .join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cdr-reconciliation-${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
