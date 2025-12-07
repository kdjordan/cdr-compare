# Security Audit Report - CDR Reconciliation Tool

**Audit Date:** December 6, 2025
**Auditor:** Security Review (20-year veteran perspective)

---

## Executive Summary

Comprehensive security review completed. Application hardened with rate limiting, input validation, file size limits, and security headers. Deployed on Coolify/Hetzner.

---

## Changes Implemented

### 1. Rate Limiting (`src/middleware.ts`)
- 10 requests per minute per IP on API routes
- Uses X-Forwarded-For for proxied requests
- Returns 429 Too Many Requests when exceeded

### 2. File Upload Security (`src/app/api/process/route.ts`)
- **File size limit:** 100MB per file
- **File type whitelist:** CSV, XLSX, XLS, ZIP only
- **Row limit:** 2 million rows max per file
- **Mapping validation:** Strict key whitelist to prevent prototype pollution

### 3. Security Headers (`next.config.js` + `middleware.ts`)
| Header | Value | Purpose |
|--------|-------|---------|
| X-Frame-Options | DENY | Prevent clickjacking |
| X-Content-Type-Options | nosniff | Prevent MIME sniffing |
| X-XSS-Protection | 1; mode=block | Legacy XSS protection |
| Referrer-Policy | strict-origin-when-cross-origin | Control referrer info |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | Disable unused APIs |

### 4. Other Hardening
- Reduced body size limit from 500MB to 250MB
- Disabled `X-Powered-By` header (fingerprinting)
- Proper temp file cleanup with UUID-based names

---

## What Was Already Secure

| Area | Status | Notes |
|------|--------|-------|
| SQL Injection | ✅ Safe | Using parameterized queries (better-sqlite3) |
| Path Traversal | ✅ Safe | UUID-based temp files in /tmp, no user input in paths |
| Dependencies | ✅ Clean | `npm audit` = 0 vulnerabilities |
| Secrets | ✅ Clean | No hardcoded credentials |
| Gitignore | ✅ Proper | Excludes .env, databases |

---

## Coolify/Hetzner Configuration

### Coolify Admin Panel
1. **Enable HTTPS Only** - Force HTTPS in app settings
2. **Resource Limits:**
   - Memory: 2GB
   - CPU: 2 cores
3. **Health Checks:**
   - Path: `/`
   - Interval: 30s
4. **Environment Variables** - Use Coolify's UI, not repo

### Hetzner Firewall Rules
```
Inbound:
- Port 22 (SSH): Your IP only
- Port 80 (HTTP): Any (redirects to HTTPS)
- Port 443 (HTTPS): Any
- All else: DENY
```

---

## Optional Enhancements (Not Implemented)

### Authentication
If tool should not be public:
```typescript
// Add to middleware.ts
const AUTH_USER = process.env.BASIC_AUTH_USER;
const AUTH_PASS = process.env.BASIC_AUTH_PASS;
```

### Request Logging
For audit trails:
```typescript
console.log(`[${new Date().toISOString()}] ${request.method} ${pathname} from ${ip}`);
```

### Content Security Policy
Stricter CSP if needed:
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'
```

### IP Allowlisting
Restrict to specific IPs in middleware if internal-only tool.

### File Scanning
Integrate ClamAV for malware scanning on uploads (high-security environments).

---

## Files Modified

- `src/middleware.ts` - NEW: Rate limiting + security headers
- `src/app/api/process/route.ts` - Added file/row limits, input validation
- `next.config.js` - Security headers, reduced body limit, disabled powered-by

---

## Maintenance

- Run `npm audit` periodically
- Keep dependencies updated
- Monitor Coolify logs for 429 errors (potential attacks)
- Review Hetzner firewall rules quarterly
