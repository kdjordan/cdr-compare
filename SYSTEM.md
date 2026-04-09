# CDRCheck System Documentation

Hey, welcome to CDRCheck. This doc explains how the reconciliation engine works so you can work on it effectively.

## What This Does

CDRCheck compares two CDR (Call Detail Record) files - one from the user's switch and one from their telecom provider - to find billing discrepancies. Users upload CSVs, map columns, and get a report showing missing calls, duration mismatches, rate differences, etc.

Live at: https://cdrcheck.com

## The Core Flow

1. User uploads two CSV files (File A = yours, File B = provider)
2. User maps columns from each file to standard fields (ANI, DNIS, seize_time, duration, rate, LRN)
3. Backend parses both files, normalizes data, loads into SQLite
4. Matching algorithm pairs records by ANI + DNIS + timestamp
5. Discrepancies are detected and returned with monetary impact

## Column Mapping

Users can manually map columns or use presets. The presets are in `src/lib/presets.ts`:

**Veriswitch format:**
```
ani_out → a_number (calling party)
dialed → b_number (called party)
seized_time → seize_time
duration_vendor → billed_duration
vendor_rate → rate
lrn → lrn
```

**SipNav format:**
```
src_number → a_number
dst_number → b_number
date → seize_time
account_billed_duration → billed_duration
account_rate → rate
lrn_number → lrn
```

The frontend handles this in `src/components/mapping/ColumnMappingModal.tsx` and stores state in `src/context/ReconciliationContext.tsx`.

## Phone Number Normalization

All phone numbers are normalized before matching. See `normalizePhoneNumber()` in `route.ts:113-131`.

The logic:
1. Strip all non-digits
2. Remove common prefixes to get 10-digit US numbers:
   - `1` + 11 digits → strip to 10 (US domestic)
   - `01` + 12 digits → strip to 10
   - `001` + 13 digits → strip to 10

So `+1-555-123-4567`, `15551234567`, and `5551234567` all become `5551234567`.

## Timestamp Parsing & Timezone Handling

This is tricky. See `normalizeTimestamp()` in `route.ts:135-198`.

**Supported formats:**
- ISO with timezone: `2025-11-07 23:59:35+00` → parsed directly
- US format: `11/7/2025 16:55` → parsed as UTC, then offset applied
- Unix timestamps (seconds or milliseconds, auto-detected)
- Excel serial dates (days since 1900-01-01)

**Timezone correction:**
Users select a timezone (GMT-12 through GMT+14) for each file. The offset converts from the CDR's timezone to UTC:

```javascript
// If data is in PST (GMT-8), timezoneOffsetHours = -8
// offsetSeconds = -8 * 3600 = -28800
// result = timestamp - (-28800) = timestamp + 8 hours → UTC
const offsetSeconds = timezoneOffsetHours * 3600;
return timestamp - offsetSeconds;
```

**Important bug fix (2026-04-01):** US date format (`11/7/2025 16:55`) must be parsed with `Z` suffix to force UTC interpretation. Without it, JavaScript uses the server's local timezone, which breaks matching when server timezone differs from user's selected timezone.

## 6-Second Increment Billing

VoIP billing uses 6-second increments. See `route.ts:235-248`.

```javascript
function calculateBillingIncrements(durationSeconds) {
  return Math.ceil(durationSeconds / 6);  // Round up
}

function calculateCallCost(durationSeconds, ratePerMinute) {
  const increments = calculateBillingIncrements(durationSeconds);
  const costPerIncrement = ratePerMinute / 10;  // 10 increments per minute
  return increments * costPerIncrement;
}
```

Example: 30-second call at $0.015/min
- Increments: ceil(30/6) = 5
- Cost: 5 × (0.015/10) = $0.0075

## The Matching Algorithm

This is the heart of the system. See `route.ts:761-795`.

**Step 1: Find candidate matches**
```sql
SELECT ...
FROM records_a a
INNER JOIN records_b b
  ON a.a_number = b.a_number
  AND a.b_number = b.b_number
  AND ABS(a.seize_time - b.seize_time) <= 60  -- TIME_TOLERANCE_SECONDS
```

Records match if:
- Same ANI (normalized)
- Same DNIS (normalized)
- Seize times within 60 seconds

**Step 2: Sort by match quality**
```sql
ORDER BY (time_diff + duration_diff * 5) ASC
```

The combined score treats 1 second of duration mismatch as equivalent to 5 seconds of time mismatch. This prevents wrong pairings when multiple calls have the same ANI/DNIS within the time window.

**Why this matters:** If one CDR file has minute-only precision (`17:37`) and your file has seconds (`17:37:11`, `17:37:35`), you might have two calls in the same minute with different durations. The duration-weighted scoring ensures they pair correctly.

**Step 3: Greedy 1-to-1 matching**
```javascript
for (const match of matchQuery.iterate()) {
  if (!usedAIds.has(match.id_a) && !usedBIds.has(match.id_b)) {
    matches.push(match);
    usedAIds.add(match.id_a);
    usedBIds.add(match.id_b);
  }
}
```

Each record can only match once. First match wins (greedy), which is why the sort order matters.

## Discrepancy Types

After matching, unmatched and mismatched records are categorized. See `route.ts:980-1093`.

| Type | Meaning |
|------|---------|
| `missing_in_a` | Provider has it, you don't (you might be underbilled) |
| `missing_in_b` | You have it, provider doesn't (you might be overbilled) |
| `zero_duration_in_a/b` | Unanswered calls, no billing impact |
| `duration_mismatch` | Same call, different duration (>1 second diff) |
| `rate_mismatch` | Same call, different rate (>0.0001 diff) |
| `cost_mismatch` | Calculated cost differs |
| `lrn_mismatch` | LRN differs on matched calls |
| `hung_call_yours/provider` | Same duration appears 3+ times (potential switch issue) |

## Memory Optimization

Files can be 100-300MB with millions of records. Key optimizations:

1. **SQLite in-memory database** - All processing happens in SQL, not JS arrays
2. **Bounded discrepancy collector** - Only keeps top 1000 per category by cost impact
3. **Streaming iteration** - Uses `query.iterate()` instead of `query.all()`
4. **Batch inserts** - 10,000 rows per batch
5. **Temp file cleanup** - Deletes uploaded files immediately after parsing

## Key Files

| File | Purpose |
|------|---------|
| `src/app/api/process/route.ts` | The entire reconciliation engine (~1400 lines) |
| `src/lib/presets.ts` | Veriswitch & SipNav column mappings |
| `src/lib/parser/index.ts` | CSV/XLSX/ZIP/GZ file parsing |
| `src/context/ReconciliationContext.tsx` | Frontend state management |
| `src/components/mapping/ColumnMappingModal.tsx` | Column mapping UI |
| `src/app/page.tsx` | Main page with upload UI |

## Common Issues

**"Failed to parse body as FormData"**
- Check `next.config.js` body size limits. Currently set to 1GB for proxy, 500MB for server actions.

**Timestamps off by hours**
- Timezone mismatch. Make sure user selected correct timezone for each file.
- If US date format, ensure the `Z` suffix fix is in place.

**Wrong call pairings**
- Same ANI/DNIS within 60 seconds with different durations
- The combined score fix (time_diff + duration_diff * 5) should handle this

**OOM crashes**
- Memory safety checks are in place (see `route.ts:17-19`):
  - `MIN_FREE_MEMORY_MB = 1500` - Requires 1.5GB free RAM to start a job
- If memory is low, returns 503 with `reason: "low_memory"` instead of crashing
- Only 1 job at a time (enforced by file lock)
- Server has 4GB swap configured
- Max 2 million rows per file limit

## Concurrency Control

Only one job runs at a time. This is enforced with a file-based lock, not module variables (which don't work across Next.js workers or Coolify rolling updates).

**How it works:**

1. User clicks "Start Processing" on verify page
2. Frontend calls `GET /api/process?action=reserve`
3. Server creates lock file at `/app/data/.job.lock` using `writeFileSync` with `wx` flag (atomic - fails if file exists)
4. If lock acquired, returns `jobId`; if busy, returns `reserved: false`
5. Frontend stores `jobId` in sessionStorage, navigates to processing page
6. Processing page sends heartbeat every 30s: `GET /api/process?action=heartbeat&jobId=xxx`
7. Heartbeat refreshes lock timestamp to prevent stale detection
8. When job completes (success or error), lock file is deleted
9. If user closes tab (no heartbeats), lock expires after 2 minutes

**Key files:**
- `src/lib/metrics.ts` - `tryAcquireJobLock()`, `releaseJobLock()`, `refreshJobLock()`, `isJobLockHeld()`
- `src/app/api/process/route.ts` - Reserve/heartbeat endpoints in GET handler
- `src/app/mapping/verify/page.tsx` - Calls reserve on button click
- `src/app/processing/page.tsx` - Sends heartbeats during upload/processing

**Why file locks, not SQLite or module variables:**
- Module variables: Each Next.js worker has isolated memory
- SQLite: WAL mode + rolling updates = complex isolation issues
- File `wx` flag: Truly atomic across all processes sharing the volume

## Testing

Test data generator in `test-data/generate-real-scenario.js` creates edge cases:
- Same ANI/DNIS rapid calls (within same minute)
- Different timestamp precisions between files
- Duration/rate mismatches

Run tests:
```bash
cd test-data
node generate-real-scenario.js
node run-real-test.js
```

Good luck. The code is dense but it works.
