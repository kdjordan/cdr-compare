# Current Work - CDR Reconcile

## What We're Building
A CDR (Call Detail Record) reconciliation tool that compares call records from two different sources (e.g., your switch vs provider's switch) to find billing discrepancies.

## Current Status: WORKING

The core matching and cost comparison is now functional.

### Latest Test Results
- **783,198** records in File A (Veriswitch)
- **767,785** records in File B (SipNav)
- **765,979** matched records (97.8% match rate)
- Discrepancies properly detected and displayed

### Recently Completed

1. **Fixed matching issues:**
   - Updated Veriswitch preset: `b_number` now maps to `dialed` instead of `lrn` (LRN was often empty)
   - Fixed timestamp parsing for US date format (`M/D/YYYY HH:mm`) - now treated as UTC
   - Increased time tolerance to 60 seconds (SipNav only has minute-level precision)

2. **Implemented proper billing calculation:**
   - VoIP uses 6-second increment billing
   - `billingIncrements = ceil(durationSeconds / 6)`
   - `cost = increments × (rate / 10)` (rate is per-minute, so /10 for 6-second increment)
   - Example: 13 seconds = 3 increments, cost = 3 × (rate/10)

3. **Updated results display:**
   - Shows "Your Cost" and "Provider Cost" columns
   - Shows cost difference (positive = you're overpaying)
   - Added "cost_mismatch" discrepancy type

4. **UI consistency:**
   - All primary buttons use outline style: `bg-accent/10 border-accent/30 text-accent`
   - Rate precision default changed to 4 digits

### Remaining Work

#### 1. Pass file settings to API (NOT YET IMPLEMENTED)
The UI has settings but they're not being sent to the API:
```typescript
interface FileSettings {
  durationUnit: "seconds" | "milliseconds";
  ratePrecision: 4 | 5 | 6;
}
```

Need to:
- Pass `settingsA` and `settingsB` in FormData to `/api/process`
- Update `normalizeDuration()` to convert milliseconds → seconds if needed
- Use ratePrecision for rate comparison tolerance

#### 2. Test the new cost calculations
- Run a comparison and verify costs are calculated correctly
- Verify the 6-second billing logic is working as expected

## Key Files

### API Processing
- `/src/app/api/process/route.ts` - Main matching and cost calculation logic
  - `calculateBillingIncrements()` - 6-second increment calculation
  - `calculateCallCost()` - Cost using increments × (rate/10)

### Presets
- `/src/lib/presets.ts` - Switch format definitions
  - Veriswitch: `a_number: ani_out`, `b_number: dialed`, `seize_time: seized_time`
  - SipNav: `a_number: src_number`, `b_number: dst_number`, `seize_time: date`

### Context
- `/src/context/ReconciliationContext.tsx` - State management, type definitions

### Results Display
- `/src/app/results/page.tsx` - Shows discrepancies with cost columns

## Technical Notes

### Billing Calculation (6-second increments)
```typescript
function calculateBillingIncrements(durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return Math.ceil(durationSeconds / 6);
}

function calculateCallCost(durationSeconds: number, ratePerMinute: number): number {
  const increments = calculateBillingIncrements(durationSeconds);
  const costPerIncrement = ratePerMinute / 10; // 10 increments per minute
  return increments * costPerIncrement;
}
```

### Matching Algorithm
1. Join on `a_number + b_number`
2. Time tolerance: 60 seconds (for minute-level precision systems)
3. 1-to-1 matching: Each record matches only once, preferring closest time

### Discrepancy Types
- `missing_in_a` - Provider has record you don't (they're billing you)
- `missing_in_b` - You have record they don't (you're not being billed)
- `duration_mismatch` - Same call, different duration
- `rate_mismatch` - Same call, different rate
- `cost_mismatch` - Both duration and rate differ

### Timestamp Formats
- Veriswitch: `2025-11-07 23:59:35+00` (ISO with timezone)
- SipNav: `11/7/2025 16:55` (US format, no timezone - treated as UTC)
