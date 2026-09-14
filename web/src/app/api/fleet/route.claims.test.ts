import { describe, expect, it } from "vitest";
import {
  ADMIN,
  ASSET_ID,
  get,
  MEMBER,
  pooledAsset,
  post,
  reservation,
  RESERVATION_ID,
  TODAY,
} from "@/test/fleet-harness";

/**
 * The guarantees PR #85 and PR #87 were argued on.
 *
 * Both shipped with the reasoning written down and no test behind it — these
 * are that test. See `route.test.ts` for the general route behaviour.
 */

const assets = (extra: Record<string, unknown> = {}) => [pooledAsset(extra)];

describe("the write hands back the refreshed board", () => {
  it("returns a board that already reflects the write", async () => {
    const res = await post(
      {
        viewer: MEMBER,
        tables: {
          fleet_assets: assets({ status: "out", current_holder_user_id: MEMBER.id }),
          fleet_reservations: [reservation({ status: "picked_up" })],
        },
      },
      { action: "check_in", reservation_id: RESERVATION_ID },
    );

    expect(res.status).toBe(200);
    const board = res.body.board as {
      assets: Array<{ status: string }>;
      reservations: Array<{ status: string }>;
    };
    expect(board).toBeDefined();
    // Not merely present — actually post-write. That is the whole point: the
    // client renders this instead of fetching again.
    expect(board.assets[0].status).toBe("available");
    expect(board.reservations[0].status).toBe("returned");
  });

  it("carries the window the caller asked for", async () => {
    const res = await post(
      { viewer: MEMBER, tables: { fleet_assets: assets() } },
      { action: "confirm_location", asset_id: ASSET_ID },
      "?start=2026-10-01&days=14",
    );
    const board = res.body.board as { window_start: string; window_days: number };
    expect(board.window_start).toBe("2026-10-01");
    expect(board.window_days).toBe(14);
  });

  it("does not fail the write when the board cannot be rebuilt", async () => {
    // The write touches assets and events; the board additionally reads
    // reservations, so failing that table fails only the refresh.
    const res = await post(
      {
        viewer: MEMBER,
        tables: { fleet_assets: assets() },
        failTables: ["fleet_reservations"],
      },
      { action: "confirm_location", asset_id: ASSET_ID },
    );

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // No board, so the client falls back to fetching one itself.
    expect(res.body.board).toBeUndefined();
    // And the write really did land.
    expect(res.tables.fleet_assets[0].location_confirmed_at).not.toBeNull();
  });

  it("does not fail the write when the window is malformed", async () => {
    const res = await post(
      { viewer: MEMBER, tables: { fleet_assets: assets() } },
      { action: "confirm_location", asset_id: ASSET_ID },
      "?start=garbage",
    );
    // A bad query string fails a read, but must never cost somebody a booking.
    expect(res.status).toBe(200);
    expect(res.body.board).toBeDefined();
  });

  it("skips the identity-matching step on a write but runs it on a read", async () => {
    // autoLinkHolder reads fleet_holder_aliases twice; the board reads it once.
    // The alias-read count therefore says whether onboarding ran.
    const tables = { fleet_assets: assets(), fleet_reservations: [reservation()] };
    const aliasReads = (queries: string[]) =>
      queries.filter((q) => q === "fleet_holder_aliases:select").length;

    const read = await get({ viewer: MEMBER, tables });
    const write = await post(
      { viewer: MEMBER, tables },
      { action: "confirm_location", asset_id: ASSET_ID },
    );

    expect(aliasReads(write.queries)).toBe(1);
    expect(aliasReads(read.queries)).toBeGreaterThan(aliasReads(write.queries));
  });
});

describe("closing a booking when material leaves the pool", () => {
  // PR #85: a booking nobody ever collected must not be filed away as a return,
  // because an overdue one would then be scored as a late return against a
  // person who did nothing wrong.

  it("cancels a booking that was never collected", async () => {
    const res = await post(
      {
        viewer: ADMIN,
        adminEmails: [ADMIN.email!],
        tables: {
          fleet_assets: assets(),
          fleet_reservations: [reservation({ status: "reserved" })],
        },
      },
      { action: "assign", asset_id: ASSET_ID, holder_label: "Charles" },
    );

    expect(res.status).toBe(200);
    const original = res.tables.fleet_reservations.find((r) => r.id === RESERVATION_ID);
    expect(original?.status).toBe("cancelled");
    expect(original?.returned_on ?? null).toBeNull();
  });

  it("records a booking that was physically out as returned", async () => {
    const res = await post(
      {
        viewer: ADMIN,
        adminEmails: [ADMIN.email!],
        tables: {
          fleet_assets: assets({ status: "out" }),
          fleet_reservations: [reservation({ status: "picked_up" })],
        },
      },
      { action: "assign", asset_id: ASSET_ID, holder_label: "Charles" },
    );

    expect(res.status).toBe(200);
    const original = res.tables.fleet_reservations.find((r) => r.id === RESERVATION_ID);
    expect(original?.status).toBe("returned");
    expect(original?.returned_on).toBe(TODAY);
  });
});
