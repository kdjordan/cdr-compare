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
  your_cost: number | null;
  provider_cost: number | null;
  cost_difference: number;
  source_index?: number;
  source_index_a?: number;
  source_index_b?: number;
}

interface Summary {
  totalRecordsA: number;
  totalRecordsB: number;
  matchedRecords: number;
  // Billing totals
  yourTotalBilled?: number;
  providerTotalBilled?: number;
  billingDifference?: number;
  // Record counts
  missingInYours: number;
  missingInProvider: number;
  zeroDurationInYours?: number;
  zeroDurationInProvider?: number;
  billedMissingInYours?: number;
  billedMissingInProvider?: number;
  // Mismatch counts
  durationMismatches: number;
  rateMismatches: number;
  costMismatches?: number;
  totalDiscrepancies: number;
  monetaryImpact: number;
  impactBreakdown?: {
    missingInYours: number;
    missingInProvider: number;
    durationMismatches: number;
    rateMismatches: number;
    costMismatches: number;
  };
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
      "Your Cost",
      "Provider Cost",
      "Difference ($)",
      "Your Source Row",
      "Provider Source Row",
    ];

    const rows = discrepancies.map((d) => {
      // Calculate source rows (+2 for header row and 0-indexing)
      let yourSourceRow = "";
      let providerSourceRow = "";

      if (d.type === "missing_in_b" || d.type === "zero_duration_in_b") {
        // Record exists only in your file
        yourSourceRow = d.source_index != null ? String(d.source_index + 2) : "";
      } else if (d.type === "missing_in_a" || d.type === "zero_duration_in_a") {
        // Record exists only in provider file
        providerSourceRow = d.source_index != null ? String(d.source_index + 2) : "";
      } else {
        // Matched records (duration_mismatch, rate_mismatch, cost_mismatch)
        yourSourceRow = d.source_index_a != null ? String(d.source_index_a + 2) : "";
        providerSourceRow = d.source_index_b != null ? String(d.source_index_b + 2) : "";
      }

      const typeLabel = d.type === "missing_in_a"
        ? "Missing in Your Records"
        : d.type === "missing_in_b"
          ? "Missing in Provider Records"
          : d.type === "zero_duration_in_a"
            ? "Unanswered (Provider)"
            : d.type === "zero_duration_in_b"
              ? "Unanswered (Yours)"
              : d.type === "duration_mismatch"
                ? "Duration Mismatch"
                : d.type === "rate_mismatch"
                  ? "Rate Mismatch"
                  : d.type === "cost_mismatch"
                    ? "Cost Mismatch"
                    : d.type;

      return [
        typeLabel,
        d.a_number,
        d.b_number,
        d.seize_time ? new Date(d.seize_time * 1000).toISOString() : "",
        d.your_duration ?? "",
        d.provider_duration ?? "",
        d.your_rate?.toFixed(4) ?? "",
        d.provider_rate?.toFixed(4) ?? "",
        d.your_cost?.toFixed(4) ?? "",
        d.provider_cost?.toFixed(4) ?? "",
        d.cost_difference?.toFixed(4) ?? "",
        yourSourceRow,
        providerSourceRow,
      ];
    });

    // Build CSV with summary header
    const summaryRows: (string | number)[][] = [
      ["CDR Reconciliation Report"],
      ["Generated", new Date().toISOString()],
      [""],
      ["=== BILLING TOTALS ==="],
      ["Your CDR Total", summary.yourTotalBilled != null ? `$${summary.yourTotalBilled.toFixed(2)}` : "N/A"],
      ["Provider CDR Total", summary.providerTotalBilled != null ? `$${summary.providerTotalBilled.toFixed(2)}` : "N/A"],
      ["Billing Difference", summary.billingDifference != null ? `$${summary.billingDifference.toFixed(2)}` : "N/A"],
      [""],
      ["=== RECORD COUNTS ==="],
      ["Your Total Records", summary.totalRecordsA],
      ["Provider Total Records", summary.totalRecordsB],
      ["Matched Records", summary.matchedRecords],
      [""],
      ["=== DISCREPANCY BREAKDOWN ==="],
      ["Missing in Your Records (Billed)", summary.billedMissingInYours ?? summary.missingInYours],
      ["Missing in Provider Records (Billed)", summary.billedMissingInProvider ?? summary.missingInProvider],
      ["Duration Mismatches", summary.durationMismatches],
      ["Rate Mismatches", summary.rateMismatches],
      ["Combined Mismatches", summary.costMismatches ?? 0],
      ["Zero Duration (Unanswered) - Yours", summary.zeroDurationInYours ?? 0],
      ["Zero Duration (Unanswered) - Provider", summary.zeroDurationInProvider ?? 0],
      ["Total Discrepancies", summary.totalDiscrepancies],
      [""],
      ["=== MONETARY IMPACT ==="],
      ["Net Impact", `$${summary.monetaryImpact.toFixed(2)}`],
    ];

    // Add impact breakdown if available
    if (summary.impactBreakdown) {
      summaryRows.push(
        ["Impact from Missing in Yours", `$${summary.impactBreakdown.missingInYours.toFixed(2)}`],
        ["Impact from Missing in Provider", `$${summary.impactBreakdown.missingInProvider.toFixed(2)}`],
        ["Impact from Duration Mismatches", `$${summary.impactBreakdown.durationMismatches.toFixed(2)}`],
        ["Impact from Rate Mismatches", `$${summary.impactBreakdown.rateMismatches.toFixed(2)}`],
        ["Impact from Combined Mismatches", `$${summary.impactBreakdown.costMismatches.toFixed(2)}`]
      );
    }

    summaryRows.push(
      [""],
      ["=== DISCREPANCY DETAILS ==="],
      headers,
      ...rows
    );

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
