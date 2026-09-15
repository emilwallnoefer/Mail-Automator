import { describe, expect, it } from "vitest";
import { isMissingFleetTable } from "./missing-table";

/**
 * This predicate decides whether a failed read is served as a labelled demo
 * board or as a 500. Getting it wrong in either direction is bad: too loose and
 * a real outage renders as fake data, too tight and the module is unreviewable
 * until the migration has been applied by hand.
 */
describe("isMissingFleetTable", () => {
  it("recognises the Postgres code", () => {
    expect(isMissingFleetTable(new Error('42P01: relation "fleet_assets" does not exist'))).toBe(true);
  });

  it("recognises the PostgREST code and its message", () => {
    expect(isMissingFleetTable(new Error("PGRST205"))).toBe(true);
    expect(
      isMissingFleetTable(new Error("Could not find the table 'public.fleet_assets' in the schema cache")),
    ).toBe(true);
  });

  it("recognises the re-thrown relation message, whatever the case", () => {
    expect(isMissingFleetTable(new Error("relation public.fleet_reservations does not exist"))).toBe(true);
    expect(isMissingFleetTable(new Error("RELATION FLEET_SETTINGS DOES NOT EXIST"))).toBe(true);
  });

  it("accepts a non-Error thrown value", () => {
    expect(isMissingFleetTable("PGRST205")).toBe(true);
    expect(isMissingFleetTable(null)).toBe(false);
  });

  it("does not swallow a real failure", () => {
    expect(isMissingFleetTable(new Error("permission denied for table fleet_assets"))).toBe(false);
    expect(isMissingFleetTable(new Error("connection terminated unexpectedly"))).toBe(false);
    // A missing table in some OTHER module is not the fleet migration's problem.
    expect(isMissingFleetTable(new Error("relation chat_messages does not exist"))).toBe(false);
  });
});
