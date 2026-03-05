import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple in-memory rate limiter
// For production at scale, use Redis or a proper rate limiting service
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PROCESS = 5; // 5 requests per minute for /api/process (heavy endpoint)
const MAX_REQUESTS_API = 30; // 30 requests per minute for other API routes

function getRateLimitKey(request: NextRequest): string {
  // Use X-Forwarded-For for proxied requests (Coolify/Traefik)
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  return ip;
}

function checkRateLimit(key: string, maxRequests: number): { limited: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return { limited: false, remaining: maxRequests - 1, resetIn: RATE_LIMIT_WINDOW };
  }

  record.count++;
  const remaining = Math.max(0, maxRequests - record.count);
  const resetIn = record.resetTime - now;

  return {
    limited: record.count > maxRequests,
    remaining,
    resetIn
  };
}

// Clean up old entries periodically (runs in Node.js environment)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }, 60 * 1000);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Stricter rate limiting for heavy /api/process endpoint
  if (pathname === "/api/process" && request.method === "POST") {
    const key = `process:${getRateLimitKey(request)}`;
    const { limited, remaining, resetIn } = checkRateLimit(key, MAX_REQUESTS_PROCESS);

    if (limited) {
      return NextResponse.json(
        {
          error: "Too many requests. Please wait before processing more files.",
          retryAfter: Math.ceil(resetIn / 1000)
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(resetIn / 1000)),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(resetIn / 1000))
          }
        }
      );
    }

    // Continue but add rate limit headers
    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    response.headers.set("X-RateLimit-Limit", String(MAX_REQUESTS_PROCESS));
    addSecurityHeaders(response);
    return response;
  }

  // General rate limiting for other API routes
  if (pathname.startsWith("/api/")) {
    const key = `api:${getRateLimitKey(request)}`;
    const { limited } = checkRateLimit(key, MAX_REQUESTS_API);

    if (limited) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }
  }

  // Add security headers to all responses
  const response = NextResponse.next();
  addSecurityHeaders(response);
  return response;
}

function addSecurityHeaders(response: NextResponse) {
  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");

  // XSS Protection (legacy but still useful)
  response.headers.set("X-XSS-Protection", "1; mode=block");

  // Referrer Policy
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions Policy (disable unnecessary features)
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );
}

export const config = {
  matcher: [
    // Match all paths except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
