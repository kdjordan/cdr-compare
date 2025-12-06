# Current Work - CDR Reconcile

## What We're Building
A CDR (Call Detail Record) reconciliation tool that compares call records from two different sources (e.g., your switch vs provider's switch) to find billing discrepancies.

## Current Status: WORKING + IMPROVED

Core matching, cost comparison, and results display are functional with recent improvements.

### Latest Test Results
- **783,198** records in File A (Veriswitch)
- **767,785** records in File B (SipNav)
- **765,979** matched records (97.8% match rate)
- Discrepancies properly detected and displayed

---

## Recently Completed (This Session)

### 1. Fixed FileDropzone Browser Crash
- **Problem:** Clicking dropzone to upload file crashed browser
- **Cause:** Using `ref.click()` to trigger file input programmatically
- **Fix:** Switched to native `<label htmlFor={inputId}>` pattern
- **Note:** Added to CLAUDE.md to prevent recurrence

### 2. Zero-Duration Record Separation
- **Problem:** 17,000+ "Missing in Provider" records were all 0-second calls cluttering results
- **Insight:** One CDR logs all attempts, other only logs billed calls - not a billing discrepancy
- **Solution:**
  - New types: `zero_duration_in_a`, `zero_duration_in_b`
  - Separate from real billing issues (`missing_in_a`, `missing_in_b`)
  - New summary fields: `zeroDurationInYours`, `zeroDurationInProvider`, `billedMissingInYours`, `billedMissingInProvider`

### 3. Analysis Synopsis Section
- Added collapsible "Analysis Synopsis" on results page
- Explains net impact in plain language
- Shows impact breakdown by category (missing calls, duration/rate differences)
- Explains zero-duration records are unanswered attempts

### 4. Improved Filters
- New "Billing Issues" filter (default) - shows only real cost discrepancies
- New "Zero Duration" filter - view unanswered attempts separately
- Toggle: "Hide zero-duration" when viewing "All"
- Scrollable table with 500px max height

### 5. Impact Breakdown in API
- `impactBreakdown` object shows monetary impact by category
- Helps users understand WHERE the discrepancy cost comes from

---

## Next Task: Source Line Export

### Problem
Users can't trace discrepancies back to original files - `source_index` is captured but not exposed.

### Implementation
See: `.claude/docs/source-line-implementation.md`

**Files to modify:**
1. `/src/app/api/export/route.ts` - Add source row columns to CSV
2. `/src/app/results/page.tsx` - Display source rows in table

---

## Future Enhancements (Documented)

See: `.claude/docs/enhancements.md`

1. **Configurable Time Tolerance** - Let users adjust 10s-300s
2. **Billing Increment Model** - Support 1/1, 6/6, 30/6, 60/60
3. **Timezone Offset** - Per-file timezone setting
4. **Pattern Detection** - Detect systematic issues
5. **Data Quality Warnings** - Warn about bad data before processing

---

## Key Files

### API Processing
- `/src/app/api/process/route.ts` - Main matching and cost calculation
- `/src/app/api/export/route.ts` - CSV export

### Results Display
- `/src/app/results/page.tsx` - Results with synopsis, filters, table

### Context & Types
- `/src/context/ReconciliationContext.tsx` - State management, type definitions

### Presets
- `/src/lib/presets.ts` - Switch format definitions

---

## Discrepancy Types

| Type | Meaning |
|------|---------|
| `missing_in_a` | Provider has billed call you don't (they're billing you) |
| `missing_in_b` | You have billed call they don't (you're not being billed) |
| `zero_duration_in_a` | Provider has 0-sec call you don't (unanswered attempt) |
| `zero_duration_in_b` | You have 0-sec call they don't (unanswered attempt) |
| `duration_mismatch` | Same call, different duration |
| `rate_mismatch` | Same call, different rate |
| `cost_mismatch` | Both duration and rate differ |

---

## Technical Notes

### Billing Calculation (6-second increments)
```typescript
function calculateBillingIncrements(durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return Math.ceil(durationSeconds / 6);
}

function calculateCallCost(durationSeconds: number, ratePerMinute: number): number {
  const increments = calculateBillingIncrements(durationSeconds);
  const costPerIncrement = ratePerMinute / 10;
  return increments * costPerIncrement;
}
```

### Matching Algorithm
1. Join on `a_number + b_number` (normalized)
2. Time tolerance: 60 seconds
3. 1-to-1 matching: Each record matches only once, preferring closest time
