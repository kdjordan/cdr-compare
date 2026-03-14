# TODOs

## Future Enhancements

### Configurable MAX_CONCURRENT_JOBS via Environment Variable

**What:** Allow MAX_CONCURRENT_JOBS to be set via an environment variable (e.g., `CDRCOMPARE_MAX_JOBS`) instead of being hardcoded.

**Why:** When selling instances of CDRCheck to customers who deploy on their own Hetzner boxes, different instance sizes have different resource capacities. A CPX11 (2 vCPU, 2GB RAM) should use a lower limit than a CPX41 (8 vCPU, 16GB RAM).

**Current state:** `MAX_CONCURRENT_JOBS = 2` is hardcoded in `/src/app/api/process/route.ts` (line 16).

**Implementation:**
1. Read from `process.env.CDRCOMPARE_MAX_JOBS`
2. Parse as integer with validation (min 1, max 10)
3. Fall back to 2 if not set or invalid
4. Document in README for customer deployments

**Depends on:** Nothing - can be implemented anytime.
