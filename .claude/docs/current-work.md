# Current Work - CDR Reconcile

## What We're Building
A CDR (Call Detail Record) reconciliation tool that compares call records from two different sources (e.g., your switch vs provider's switch) to find billing discrepancies.

## Current Status: PRODUCTION READY

Core matching, cost comparison, results display, and security hardening complete.

---

## Latest Session Summary (Dec 6, 2025)

### Completed This Session

#### 1. Source Line Export
- Added source row numbers to CSV export and UI table
- Users can now trace discrepancies back to original file rows
- Format: Row numbers are +2 (header + 0-indexing)

#### 2. SipNav Duration Unit Fix
- Changed SipNav preset default from seconds to milliseconds

#### 3. Refactored Filter Tabs
- Removed confusing "Billing Issues" aggregate filter
- Tabs now match Analysis Synopsis categories exactly:
  - All, Missing in Yours, Missing in Provider, Duration, Rate, Combined, Unanswered
- Synopsis cards are now clickable - click to filter table

#### 4. Dynamic Table Columns
- Table columns change based on selected filter
- Single-source filters show simplified columns (Duration, Cost, Source Row)
- Comparison filters show both sides

#### 5. Fixed Discrepancy Sampling
- Was only returning first 1000 (all same type)
- Now returns proportional sample from each category (up to 5000)
- Minimum 100 per category, sorted by cost impact

#### 6. Billing Totals Comparison
- Added to Analysis Synopsis:
  - Your CDR Total: $X
  - Provider CDR Total: $Y
  - Difference: $Z
- Key numbers for invoice comparison workflow

#### 7. Updated CSV Export
- Now includes all new fields:
  - Billing totals section
  - Impact breakdown by category
  - Zero-duration counts
  - Source row columns

#### 8. Security Hardening
- Rate limiting: 10 req/min per IP
- File size limit: 100MB per file
- Row limit: 2 million rows max
- File type whitelist: CSV, XLSX, XLS, ZIP
- Security headers: X-Frame-Options, X-Content-Type-Options, etc.
- Input validation on column mappings
- See: `.claude/docs/security.md`

---

## Latest Completed: LRN Mismatch Feature (Dec 7, 2025)

### What Was Done
Added LRN (Location Routing Number) comparison to detect when carriers have different LRN dip results, which can cause billing rate discrepancies.

**Changes:**

1. **Presets** (`/src/lib/presets.ts`)
   - Veriswitch: maps `urn` column to `lrn`
   - SipNav: maps `lrn_number` column to `lrn`
   - LRN is now a required field in preset validation

2. **Types** (`/src/context/ReconciliationContext.tsx`)
   - Added `lrn` to `ColumnMapping` interface
   - Added `lrn_mismatch` to `Discrepancy` type
   - Added `your_lrn` and `provider_lrn` to `Discrepancy` interface
   - Added `lrnMismatches` count to `ReconciliationSummary`

3. **Mapping UI** (`/src/app/mapping/page.tsx` & `/src/components/mapping/ColumnMappingModal.tsx`)
   - Added LRN field to mapping UI (required)
   - Auto-detection patterns: lrn, urn, lrn_number, routing, ported

4. **API** (`/src/app/api/process/route.ts`)
   - LRN stored in database tables
   - LRN comparison during matching - creates `lrn_mismatch` discrepancy when LRNs differ
   - Added `lrnMismatches` count to summary

5. **Results Page** (`/src/app/results/page.tsx`)
   - New "LRN" filter tab
   - New pink "LRN Mismatches" card in synopsis (shows count of mismatches)
   - LRN columns (Your LRN, Provider LRN) shown when LRN filter is selected
   - Pink color theme for LRN mismatch badges

6. **CSV Export** (`/src/app/api/export/route.ts`)
   - Added "Your LRN" and "Provider LRN" columns
   - Added "LRN Mismatches" count to summary section

---

## Previous: Total Minutes Display (Dec 6, 2025)

Added total minutes display to help users cross-reference CDR data with invoices that bill by minute.

---

## Next Task: (none scheduled)

---

## Key Files

### API Processing
- `/src/app/api/process/route.ts` - Main matching and cost calculation
- `/src/app/api/export/route.ts` - CSV export

### Results Display
- `/src/app/results/page.tsx` - Results with synopsis, filters, table

### Context & Types
- `/src/context/ReconciliationContext.tsx` - State management, type definitions

### Security
- `/src/proxy.ts` - Rate limiting, security headers (renamed from middleware.ts in Next.js 16)
- `/next.config.js` - Security headers, body limits

### Presets
- `/src/lib/presets.ts` - Switch format definitions (Veriswitch, SipNav)

### Documentation
- `.claude/docs/security.md` - Security audit and recommendations
- `.claude/docs/enhancements.md` - Future enhancement ideas

---

## Discrepancy Types

| Type | Meaning |
|------|---------|
| `missing_in_a` | Provider has billed call you don't (they're billing you) |
| `missing_in_b` | You have billed call they don't (you're not being billed) |
| `zero_duration_in_a` | Provider has 0-sec call you don't (unanswered attempt) |
| `zero_duration_in_b` | You have 0-sec call they don't (unanswered attempt) |
| `lrn_mismatch` | Same call, different LRN (potential rate deck issue) |
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

### Security Limits
- File size: 100MB max per file
- Row count: 2 million max per file
- Rate limit: 10 requests/minute per IP
- Body size: 250MB total

---

## Test Results (Last Run)
- **783,198** records in File A (Veriswitch)
- **767,785** records in File B (SipNav)
- **765,979** matched records (97.8% match rate)
- Billing totals calculated and displayed
- All discrepancy categories populated
te