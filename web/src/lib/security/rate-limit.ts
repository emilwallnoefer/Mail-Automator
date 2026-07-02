type RateLimitConfig = {
  windowMs: number;
  max: number;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
};

type Entry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Entry>();

function nowMs() {
  return Date.now();
}

function cleanupExpired() {
  const now = nowMs();
  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) store.delete(key);
  }
}

export function getClientIp(request: Request) {
  // Prefer x-real-ip / x-vercel-forwarded-for: these are set by the hosting
  // platform (Vercel) at the edge and cannot be forged by the client. The
  // left-most x-forwarded-for entry is client-controllable behind a proxy, so
  // it must never be the primary key for rate limiting — use it only as a
  // last-resort fallback for non-Vercel environments.
  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel && vercel.trim()) return vercel.split(",")[0]!.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  cleanupExpired();
  const now = nowMs();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + config.windowMs;
    store.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      limit: config.max,
      remaining: Math.max(0, config.max - 1),
      retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  store.set(key, current);
  const remaining = Math.max(0, config.max - current.count);
  return {
    allowed: current.count <= config.max,
    limit: config.max,
    remaining,
    retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export function createRateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "Retry-After": String(result.retryAfterSec),
  };
}
