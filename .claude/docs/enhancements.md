# CDR Reconcile - Future Enhancements

These enhancements were identified through research into VoIP billing practices and analysis of the codebase. They should be implemented after the core functionality is stable.

---

## 1. Configurable Time Tolerance

### Problem
Time tolerance is hardcoded at 60 seconds. Different carrier systems have different logging precision - some log to the second, others only to the minute.

### Solution
Add a UI slider on the mapping/verify page to let users set time tolerance (10s - 300s).

### Files to Modify
- `/src/app/mapping/verify/page.tsx` - Add slider UI
- `/src/app/processing/page.tsx` - Pass tolerance to API
- `/src/app/api/process/route.ts` - Use dynamic tolerance (currently line 435)
- `/src/context/ReconciliationContext.tsx` - Add tolerance to state

### Implementation
```typescript
// Add to FormData in processing
formData.append("timeTolerance", String(timeTolerance));

// In API route
const TIME_TOLERANCE_SECONDS = parseInt(formData.get("timeTolerance") as string) || 60;
```

---

## 2. Configurable Billing Increment Model

### Problem
The tool assumes 6-second billing increments, but carriers use various models:
- **1/1**: Per-second billing (modern VoIP)
- **6/6**: 6-second increments (common wholesale)
- **30/6**: 30-second minimum, then 6-second increments
- **60/60**: Full minute rounding (legacy)

When billing models differ, EVERY call shows a cost mismatch even if the underlying data is correct.

### Sources
- [United World Telecom - Billing Increments](https://www.unitedworldtelecom.com/blog/how-voip-calls-are-charged-understanding-billing-increments/)
- [iCONX - 60-60 vs Incremental Billing](https://www.iconxsolutions.com/60-60-or-incremental-billing-is-on-the-rise-what-you-need-to-know/)

### Solution
Add billing increment configuration per file, with presets for common models.

### Files to Modify
- `/src/lib/presets.ts` - Add billing model to presets
- `/src/context/ReconciliationContext.tsx` - Add to FileSettings
- `/src/components/mapping/ColumnMappingModal.tsx` - Add billing model selector
- `/src/app/api/process/route.ts` - Dynamic cost calculation

### New Types
```typescript
interface BillingModel {
  minimumSeconds: number;  // e.g., 30
  incrementSeconds: number; // e.g., 6
}

const BILLING_MODELS = {
  "1/1": { minimumSeconds: 1, incrementSeconds: 1 },
  "6/6": { minimumSeconds: 6, incrementSeconds: 6 },
  "30/6": { minimumSeconds: 30, incrementSeconds: 6 },
  "60/60": { minimumSeconds: 60, incrementSeconds: 60 },
};

function calculateBilledDuration(actualSeconds: number, model: BillingModel): number {
  if (actualSeconds <= 0) return 0;
  if (actualSeconds <= model.minimumSeconds) return model.minimumSeconds;
  const additional = actualSeconds - model.minimumSeconds;
  const additionalIncrements = Math.ceil(additional / model.incrementSeconds);
  return model.minimumSeconds + (additionalIncrements * model.incrementSeconds);
}
```

---

## 3. Timezone Offset Configuration

### Problem
CDR systems often log timestamps in different timezones. One system might use UTC, another local time. This causes massive false negatives or requires widening tolerance to compensate.

### Sources
- [3CX Forums - CDR Timezone Issues](https://www.3cx.com/community/threads/how-to-fix-the-cdr-timezone.125630/)
- CDR best practice: "Always store in UTC, convert in application"

### Solution
Add timezone offset dropdown per file (+/- hours from UTC).

### Files to Modify
- `/src/context/ReconciliationContext.tsx` - Add timezoneOffset to FileSettings
- `/src/components/mapping/ColumnMappingModal.tsx` - Add timezone selector
- `/src/app/api/process/route.ts` - Apply offset before matching

### Implementation
```typescript
// In FileSettings
timezoneOffset: number; // Hours from UTC (-12 to +14)

// In timestamp normalization
const offsetSeconds = timezoneOffset * 3600;
return Math.floor(date.getTime() / 1000) + offsetSeconds;
```

### Auto-Detection (Optional)
After initial matching with low results, detect if timestamps are consistently offset by a common amount (1, 2, 5, 8 hours) and suggest correction.

---

## 4. Pattern Detection & Smart Insights

### Problem
Users see thousands of individual discrepancies but no pattern analysis. Common patterns that indicate systematic issues:
- All durations differ by ~5% (different rounding)
- All rates differ by a fixed amount (wrong rate card)
- Timestamps consistently offset (timezone issue)

### Solution
Add pattern detection that identifies systematic discrepancies and explains likely causes.

### Files to Modify
- `/src/app/api/process/route.ts` - Add pattern analysis after matching
- `/src/app/results/page.tsx` - Display pattern insights in Synopsis

### Patterns to Detect
```typescript
interface PatternAnalysis {
  // Duration patterns
  avgDurationDiffPercent: number;
  durationDiffStdDev: number;

  // Rate patterns
  avgRateDiff: number;
  uniqueRatePairs: number;

  // Timing patterns
  avgTimestampOffset: number;

  // Actionable insights
  likelyCause: string;
  suggestedAction: string;
}
```

### Example Insights
- "Duration differences average -4.8% - this suggests provider uses different rounding"
- "Timestamps are consistently 5 hours behind - likely timezone mismatch (UTC vs EST)"
- "55,890 rate mismatches all show $0.0002 difference - possible rate card version mismatch"

---

## 5. Data Quality Warnings

### Problem
Bad input data causes confusing results:
- Empty phone numbers match each other (false positives)
- Durations in milliseconds interpreted as seconds (300,000 second calls)
- Invalid timestamps cause null matches
- Rates with extreme values ($1000/min)

### Solution
Add a data validation step that warns users about potential issues before processing.

### Files to Modify
- `/src/app/api/process/route.ts` - Add validation pass before matching
- `/src/app/processing/page.tsx` - Show warnings with option to proceed

### Validations
```typescript
interface DataQualityReport {
  emptyPhoneNumbers: number;
  invalidTimestamps: number;
  suspiciouslyLongDurations: number; // > 24 hours
  negativeRates: number;
  extremeRates: number; // > $10/min
  duplicateRecords: number;
}
```

### UI
Show warning panel before results if issues detected:
- "⚠️ 1,234 records have empty phone numbers - these may create false matches"
- "⚠️ 567 records have durations over 24 hours - are these in milliseconds?"

---

## Priority Order

| # | Enhancement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Time Tolerance Config | High | Low |
| 2 | Billing Increment Model | High | Medium |
| 3 | Timezone Offset | High | Medium |
| 4 | Pattern Detection | High | Medium |
| 5 | Data Quality Warnings | Medium | Medium |
