# CDRCheck Process Log

## About

CDRCheck is a free CDR (Call Detail Record) reconciliation tool for telecom companies. Users upload two CSV files—their own CDRs and their provider's CDRs—and the app compares them to find billing discrepancies: missing calls, duration mismatches, rate differences, and cost variances.

Live at: https://cdrcheck.com

## Session: 2026-03-22

### Capacity Throttling

Added server-side throttling to prevent crashes when too many users try to process files simultaneously.

- `MAX_CONCURRENT_JOBS = 1` (reduced from 2 due to memory constraints)
- `GET /api/process` returns capacity status
- Frontend polls every 15s and disables upload UI when busy
- Amber banner warns users when server is at capacity
- Fail-open behavior: if capacity check fails, uploads are allowed

**Files:** `src/app/api/process/route.ts`, `src/components/ui/CapacityBanner.tsx`, `src/app/page.tsx`

### Usage Metrics

Added tracking of total CDRs processed and total bytes for marketing/analytics.

- SQLite database at `./data/metrics.db`
- Incremented after each successful reconciliation
- Secret-protected endpoint: `GET /api/metrics?key=SECRET`
- Persistent storage mounted: `/data/cdrcheck/metrics` → `/app/data`

**Check stats:**
```bash
curl "https://cdrcheck.com/api/metrics?key=$METRICS_SECRET"
```

Returns: `totalCdrs`, `totalBytes`, `formattedBytes`, `updatedAt`

**Files:** `src/lib/metrics.ts`, `src/app/api/metrics/route.ts`

### Health Check

Added health endpoint for Coolify container orchestration.

- `GET /api/health` returns `{"status":"ok"}`
- Configured with 30s start period for Next.js boot time

**Files:** `src/app/api/health/route.ts`

### Timezone Refactor

Replaced ambiguous timezone abbreviations (EST, PST, etc.) with explicit GMT offsets.

- Now supports GMT-12 through GMT+14, including half-hour offsets (GMT+5:30, GMT+9:30)
- Eliminates DST confusion for international CDR comparison
- Default: GMT+0

**Files:** `src/context/ReconciliationContext.tsx`, `src/components/mapping/ColumnMappingModal.tsx`, `src/app/api/process/route.ts`

### Server Stability

Fixed OOM (Out of Memory) kills during large file processing.

- Added 4GB swap on Hetzner instance
- Reduced `MAX_CONCURRENT_JOBS` from 2 to 1
- Large files (100-300MB each) now process without crashing

### Infrastructure

- Hosted on Coolify at Hetzner
- CI/CD deploys from `main` branch
- Persistent volume for metrics database survives container restarts

## Session: 2026-04-08

### Concurrency Lock Fix

Fixed race condition allowing multiple jobs to run simultaneously despite `MAX_CONCURRENT_JOBS = 1`.

**Problem:** Module-level variables and SQLite locks don't work across Next.js workers or Coolify rolling updates (two containers share volume during deploy).

**Solution:** File-based lock with atomic file creation (`writeFileSync` with `wx` flag):
- Lock file at `/app/data/.job.lock` on persistent volume
- Lock acquired when user clicks "Start Processing" (not after upload)
- Heartbeat every 30s keeps lock alive during long uploads
- 2-minute timeout releases abandoned sessions
- Second user sees "Server at capacity" immediately

**Files:** `src/lib/metrics.ts`, `src/app/api/process/route.ts`, `src/app/mapping/verify/page.tsx`, `src/app/processing/page.tsx`

### Removed Speed Test

Removed connection speed test UI - no longer needed with heartbeat system. Any upload duration is now supported.

**Deleted:** `src/app/api/speed-test/route.ts`
