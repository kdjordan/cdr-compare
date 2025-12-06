# Source Line Export - Implementation Plan

## Overview
Add source file row numbers to export and UI so users can trace discrepancies back to original files.

## Problem
- `source_index` fields are captured in the API but not exposed
- Users can't find the original row in a 700K record file
- Makes dispute resolution difficult

## Implementation

### 1. Update Export Route

**File:** `/src/app/api/export/route.ts`

Update the `Discrepancy` interface to include source fields:
```typescript
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
  // ADD THESE:
  source_index?: number;
  source_index_a?: number;
  source_index_b?: number;
}
```

Add columns to headers array:
```typescript
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
  "Your Source Row",      // NEW
  "Provider Source Row",  // NEW
];
```

Add source row logic to row mapping:
```typescript
const rows = discrepancies.map((d) => {
  // Calculate source rows (+2 for header row and 0-indexing)
  let yourSourceRow = "";
  let providerSourceRow = "";

  if (d.type === "missing_in_b" || d.type === "zero_duration_in_b") {
    yourSourceRow = d.source_index != null ? String(d.source_index + 2) : "";
  } else if (d.type === "missing_in_a" || d.type === "zero_duration_in_a") {
    providerSourceRow = d.source_index != null ? String(d.source_index + 2) : "";
  } else {
    // Matched records (duration_mismatch, rate_mismatch, cost_mismatch)
    yourSourceRow = d.source_index_a != null ? String(d.source_index_a + 2) : "";
    providerSourceRow = d.source_index_b != null ? String(d.source_index_b + 2) : "";
  }

  return [
    // ... existing columns ...
    yourSourceRow,
    providerSourceRow,
  ];
});
```

### 2. Update Results Page

**File:** `/src/app/results/page.tsx`

Add helper function:
```typescript
function formatSourceRow(d: Discrepancy): string {
  if (d.type === "missing_in_b" || d.type === "zero_duration_in_b") {
    return d.source_index != null ? `Row ${d.source_index + 2}` : "-";
  } else if (d.type === "missing_in_a" || d.type === "zero_duration_in_a") {
    return d.source_index != null ? `Row ${d.source_index + 2}` : "-";
  } else {
    const yourRow = d.source_index_a != null ? d.source_index_a + 2 : "?";
    const provRow = d.source_index_b != null ? d.source_index_b + 2 : "?";
    return `${yourRow} / ${provRow}`;
  }
}
```

Add column header:
```tsx
<th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
  Source
</th>
```

Add column data in row:
```tsx
<td className="px-4 py-3 font-mono text-xs text-muted-foreground">
  {formatSourceRow(d)}
</td>
```

## Testing
1. Run a comparison
2. Export CSV - verify source row columns are populated
3. Check UI table shows source rows
4. Open original CSV, verify row numbers match
