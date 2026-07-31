/**
 * Request rate limiting.
 *
 * Two backends, chosen at call time:
 *
 *   1. **Durable (preferred)** — an Upstash-compatible Redis REST endpoint. This
 *      is what makes the limit real on Vercel, where every lambda instance
 *      otherwise keeps its own counter, so the effective ceiling is `max` times
 *      the number of warm instances and resets on every cold start.
 *      Configure either pair (Vercel KV is Upstash underneath and sets the
 *      `KV_*` names for you):
 *        KV_REST_API_URL        + KV_REST_API_TOKEN
 *        UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *
 *   2. **In-memory fallback** — the original `Map`. Used when no store is
 *      configured (local dev, tests) and when the durable store errors out.
 *
 * On a store failure we fall back rather than fail open: a Redis blip should not
 * remove the limit entirely, and it should not take the app down either. The
 * fallback is weaker, not absent. Failures are logged at most once a minute so a
 * misconfigured store is visible without flooding the logs.
 *
 * SECURITY.md T1.2 / security audit run-3 H2.
 */

type RateLimitConfig = {
  windowMs: number;
  max: number;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
  /** Which backend produced this result. Useful in tests and for ops visibility. */
  backend: "durable" | "memory";
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

function durableStoreConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

let lastStoreErrorLoggedAt = 0;
function logStoreErrorThrottled(error: unknown) {
  const now = nowMs();
  if (now - lastStoreErrorLoggedAt < 60_000) return;
  lastStoreErrorLoggedAt = now;
  console.error("rate-limit: durable store unavailable, falling back to in-memory", error);
}

/**
 * Fixed-window counter in Redis, in one round trip.
 *
 * INCR creates the key at 1 on the first hit; `EXPIRE ... NX` then sets the TTL
 * only when none exists, so the window is anchored to the FIRST request rather
 * than sliding forward on every subsequent one. PTTL reports what is left of it.
 */
async function checkDurable(
  key: string,
  config: RateLimitConfig,
  cfg: { url: string; token: string },
): Promise<RateLimitResult> {
  const ttlSec = Math.max(1, Math.ceil(config.windowMs / 1000));
  const namespaced = `rl:${key}`;

  const response = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", namespaced],
      ["EXPIRE", namespaced, String(ttlSec), "NX"],
      ["PTTL", namespaced],
    ]),
    cache: "no-store",
    signal: AbortSignal.timeout(2000),
  });

  if (!response.ok) {
    throw new Error(`rate-limit store HTTP ${response.status}`);
  }

  const body = (await response.json()) as Array<{ result?: unknown; error?: string }>;
  const failed = Array.isArray(body) ? body.find((entry) => entry?.error) : null;
  if (failed) throw new Error(`rate-limit store error: ${failed.error}`);

  const count = Number(body?.[0]?.result ?? 0);
  const pttlMs = Number(body?.[2]?.result ?? -1);
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error("rate-limit store returned no counter");
  }

  // PTTL is -1 (no expiry) or -2 (key gone) in edge cases; fall back to the window.
  const remainingMs = pttlMs > 0 ? pttlMs : config.windowMs;

  return {
    allowed: count <= config.max,
    limit: config.max,
    remaining: Math.max(0, config.max - count),
    retryAfterSec: Math.max(1, Math.ceil(remainingMs / 1000)),
    backend: "durable",
  };
}

export function checkRateLimitInMemory(key: string, config: RateLimitConfig): RateLimitResult {
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
      backend: "memory",
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
    backend: "memory",
  };
}

/**
 * Consume one unit against `key`. Uses the durable store when configured, and
 * falls back to the in-memory counter otherwise (or on store failure).
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const cfg = durableStoreConfig();
  if (!cfg) return checkRateLimitInMemory(key, config);

  try {
    return await checkDurable(key, config, cfg);
  } catch (error) {
    logStoreErrorThrottled(error);
    return checkRateLimitInMemory(key, config);
  }
}

export function createRateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "Retry-After": String(result.retryAfterSec),
  };
}

/** Test-only: drop the in-memory counters so cases don't bleed into each other. */
export function __resetInMemoryRateLimitStore() {
  store.clear();
}
