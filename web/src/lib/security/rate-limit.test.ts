import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetInMemoryRateLimitStore,
  checkRateLimit,
  checkRateLimitInMemory,
  createRateLimitHeaders,
  getClientIp,
} from "./rate-limit";

const WINDOW = { windowMs: 60_000, max: 3 };

function req(headers: Record<string, string>) {
  return new Request("https://example.com/", { headers });
}

beforeEach(() => {
  __resetInMemoryRateLimitStore();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getClientIp", () => {
  it("prefers platform headers over the client-controllable x-forwarded-for", () => {
    expect(getClientIp(req({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" }))).toBe("1.1.1.1");
    expect(
      getClientIp(req({ "x-vercel-forwarded-for": "2.2.2.2, 3.3.3.3", "x-forwarded-for": "9.9.9.9" })),
    ).toBe("2.2.2.2");
  });

  it("falls back to x-forwarded-for only when no platform header is present", () => {
    expect(getClientIp(req({ "x-forwarded-for": "9.9.9.9, 8.8.8.8" }))).toBe("9.9.9.9");
    expect(getClientIp(req({}))).toBe("unknown");
  });
});

describe("in-memory limiter", () => {
  it("allows up to max then blocks", () => {
    const results = [1, 2, 3, 4].map(() => checkRateLimitInMemory("k", WINDOW));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results.every((r) => r.backend === "memory")).toBe(true);
  });

  it("keys are independent", () => {
    checkRateLimitInMemory("a", WINDOW);
    checkRateLimitInMemory("a", WINDOW);
    expect(checkRateLimitInMemory("b", WINDOW).remaining).toBe(2);
  });
});

describe("checkRateLimit backend selection", () => {
  it("uses the in-memory store when no durable store is configured", async () => {
    const result = await checkRateLimit("k", WINDOW);
    expect(result.backend).toBe("memory");
  });

  it("uses the durable store when configured, and anchors the window to the first hit", async () => {
    process.env.KV_REST_API_URL = "https://kv.example.com";
    process.env.KV_REST_API_TOKEN = "token";

    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(
          JSON.stringify([{ result: 2 }, { result: 0 }, { result: 30_000 }]),
          { status: 200 },
        );
      }),
    );

    const result = await checkRateLimit("some-key", WINDOW);
    expect(result.backend).toBe("durable");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
    expect(result.retryAfterSec).toBe(30);

    // EXPIRE must carry NX, or every request would slide the window forward and
    // the limit would never actually trigger for a steady stream of traffic.
    expect(bodies[0]).toEqual([
      ["INCR", "rl:some-key"],
      ["EXPIRE", "rl:some-key", "60", "NX"],
      ["PTTL", "rl:some-key"],
    ]);
  });

  it("blocks once the durable counter exceeds max", async () => {
    process.env.KV_REST_API_URL = "https://kv.example.com";
    process.env.KV_REST_API_TOKEN = "token";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify([{ result: 4 }, { result: 0 }, { result: 10_000 }]), {
            status: 200,
          }),
      ),
    );

    const result = await checkRateLimit("k", WINDOW);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("falls back to in-memory when the durable store errors — it must not fail open", async () => {
    process.env.KV_REST_API_URL = "https://kv.example.com";
    process.env.KV_REST_API_TOKEN = "token";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Still counts, still blocks past max — just on the weaker backend.
    const results = [1, 2, 3, 4].map(() => 0);
    const out = [];
    for (const _ of results) out.push(await checkRateLimit("k", WINDOW));
    expect(out.map((r) => r.backend)).toEqual(["memory", "memory", "memory", "memory"]);
    expect(out.map((r) => r.allowed)).toEqual([true, true, true, false]);
  });

  it("falls back when the store returns a command-level error", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://kv.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify([{ error: "WRONGTYPE" }]), { status: 200 }),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await checkRateLimit("k", WINDOW)).backend).toBe("memory");
  });
});

describe("createRateLimitHeaders", () => {
  it("emits the standard trio", () => {
    expect(
      createRateLimitHeaders({
        allowed: false,
        limit: 10,
        remaining: 0,
        retryAfterSec: 42,
        backend: "memory",
      }),
    ).toEqual({
      "X-RateLimit-Limit": "10",
      "X-RateLimit-Remaining": "0",
      "Retry-After": "42",
    });
  });
});
