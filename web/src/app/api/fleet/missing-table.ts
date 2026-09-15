/**
 * True when the failure is "relation does not exist" rather than a real error.
 * Postgres reports 42P01; PostgREST surfaces an unknown table as PGRST205 with a
 * "Could not find the table" message, and the wrapper in fleet-queries re-throws
 * it as an Error, so match on the text too.
 *
 * Kept out of `route.ts` so it can be unit-tested, for the same reason as
 * `window.ts`: `route.ts` reaches the service-role client, which is
 * `"server-only"` and cannot be imported from a test.
 */
export function isMissingFleetTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /42P01/.test(message) ||
    /PGRST205/.test(message) ||
    /Could not find the table/i.test(message) ||
    /relation .*fleet_.* does not exist/i.test(message)
  );
}
