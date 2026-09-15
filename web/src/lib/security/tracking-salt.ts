/**
 * `TRACKING_SALT` resolution for the public click redirector.
 *
 * `app/r/[id]/route.ts` stores a SHA-256 of each clicking recipient's IP in
 * `mail_link_clicks`. The salt is the only thing that makes that digest
 * irreversible — the whole IPv4 space hashes in seconds, so an *unsalted*
 * SHA-256 of an IP is a reversible encoding of it, and the promise in
 * `supabase/2026-05-06-mail-link-tracking.sql` ("IP addresses are never stored
 * raw") would silently stop being true.
 *
 * This module therefore fails **closed**: there is no code path that produces a
 * hash without a usable salt. When the salt is missing, blank or implausibly
 * short, `hashIp()` returns `null` and the click row is written with a null
 * `ip_hash` (the column is nullable and already null for unknown IPs) — or, in
 * an environment where the salt is required, the click is not written at all
 * and the failure is logged loudly. The recipient's redirect is never affected:
 * a config mistake must not break customer links.
 *
 * Pure and env-injectable so it can be tested without touching `process.env`.
 */

import { createHash } from "node:crypto";

/**
 * Minimum accepted salt length, in characters.
 *
 * The attack this defends against is precomputing the ~4.3e9 IPv4 addresses,
 * so any salt with real entropy defeats it outright; 16 characters of anything
 * random is already far past that. The number is a typo/placeholder floor
 * ("x", "test", "todo"), not a cryptographic one — deliberately below the
 * "≥32 bytes" the secrets runbook asks operators to generate, so that
 * tightening the guidance can never retroactively silence a production deploy
 * that is already configured. Salts between this floor and 32 characters are
 * accepted but warned about.
 */
export const MIN_SALT_LENGTH = 16;

/** Length at or above which no advisory warning is emitted. */
export const RECOMMENDED_SALT_LENGTH = 32;

export type SaltEnv = {
  TRACKING_SALT?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
};

export type SaltResolution =
  | { ok: true; salt: string; weak: boolean }
  | { ok: false; reason: "missing" | "too_short"; required: boolean };

/**
 * Is a usable salt mandatory here?
 *
 * True for any deployed environment that can serve `/r/<id>` against the real
 * database:
 *   - `VERCEL_ENV` is `production` or `preview` — a real deployment. Previews
 *     share the production Supabase project, so their click rows land in the
 *     same table as production's.
 *   - `NODE_ENV === "production"` with no `VERCEL_ENV` — a self-hosted or
 *     otherwise non-Vercel production server.
 *
 * False for local development and tests. `NODE_ENV` alone is not enough to
 * decide this: `next build` sets `NODE_ENV=production` on *every* machine,
 * including a contributor's laptop that has no salt, which is why `VERCEL_ENV`
 * is consulted first and why nothing in this module throws at module scope.
 * `vercel dev` (`VERCEL_ENV=development`) is treated as local.
 */
export function isSaltRequired(env: SaltEnv): boolean {
  const vercelEnv = env.VERCEL_ENV?.trim();
  if (vercelEnv) return vercelEnv === "production" || vercelEnv === "preview";
  return env.NODE_ENV === "production";
}

/** Resolve the salt, treating missing / blank / whitespace-only as unset. */
export function resolveTrackingSalt(env: SaltEnv): SaltResolution {
  const required = isSaltRequired(env);
  const raw = env.TRACKING_SALT;
  const salt = typeof raw === "string" ? raw.trim() : "";

  if (!salt) return { ok: false, reason: "missing", required };
  if (salt.length < MIN_SALT_LENGTH) return { ok: false, reason: "too_short", required };

  return { ok: true, salt, weak: salt.length < RECOMMENDED_SALT_LENGTH };
}

/** The one place a digest is ever produced. Never reachable without a salt. */
export function hashIpWithSalt(salt: string, ip: string): string {
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

export function describeSaltProblem(resolution: Extract<SaltResolution, { ok: false }>): string {
  const cause =
    resolution.reason === "missing"
      ? "TRACKING_SALT is not set (or is blank/whitespace-only)"
      : `TRACKING_SALT is shorter than ${MIN_SALT_LENGTH} characters`;
  return resolution.required
    ? `[tracking-salt] ${cause}. Click tracking is DISABLED: /r/<id> still redirects, but no click rows are recorded. ` +
        "An unsalted IP hash is reversible and will never be written. Set TRACKING_SALT in this environment."
    : `[tracking-salt] ${cause}. This is fine for local development — redirects work and clicks are recorded ` +
        "without an IP hash. Set TRACKING_SALT to exercise IP hashing locally.";
}

export type IpHasher = {
  /** Hash an IP, or `null` when there is no usable salt / no usable IP. */
  hashIp: (ip: string | null | undefined) => string | null;
  /** True when the environment requires a salt and does not have a usable one. */
  misconfigured: boolean;
  resolution: SaltResolution;
};

/**
 * Build a hasher for one environment, emitting the diagnostic exactly once.
 *
 * The route calls this at module scope, so a misconfigured deploy announces
 * itself on the first cold start rather than months later in the data.
 */
export function createIpHasher(env: SaltEnv, log: (message: string) => void = defaultLog): IpHasher {
  const resolution = resolveTrackingSalt(env);

  if (!resolution.ok) {
    log(describeSaltProblem(resolution));
    return {
      hashIp: () => null,
      misconfigured: resolution.required,
      resolution,
    };
  }

  if (resolution.weak) {
    log(
      `[tracking-salt] TRACKING_SALT is shorter than ${RECOMMENDED_SALT_LENGTH} characters. ` +
        "It is accepted, but generate at least 32 bytes (see docs/security-secrets-runbook.md).",
    );
  }

  const { salt } = resolution;
  return {
    hashIp: (ip) => (!ip || ip === "unknown" ? null : hashIpWithSalt(salt, ip)),
    misconfigured: false,
    resolution,
  };
}

function defaultLog(message: string) {
  // Errors, not warnings: a deployed environment without a salt is a
  // misconfiguration someone has to fix, and it should be greppable.
  console.error(message);
}
