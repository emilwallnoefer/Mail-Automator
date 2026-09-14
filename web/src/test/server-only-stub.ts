/**
 * `server-only` is resolved by the Next.js bundler, not installed as a package,
 * so importing any `"server-only"` module from vitest fails to resolve.
 *
 * Aliased to this no-op in `vitest.config.ts` purely so server modules can be
 * imported by tests. It changes nothing about how they build or run in Next.
 */
export {};
