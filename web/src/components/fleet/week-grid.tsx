"use client";

import { useMemo } from "react";
import {
  formatWeekLabel,
  isoWeekNumber,
  isBlocking,
  weekRange,
  weeksBetween,
} from "@/lib/fleet-rules";
import type { FleetAsset, FleetReservation } from "./types";

/**
 * The booking calendar: one row per asset, one cell per ISO week.
 *
 * Clicking a free cell starts a selection; clicking a second cell in the same
 * row extends it — that is the whole booking gesture. Occupied cells show who
 * has the material, so "where is it in week 40" is answerable at a glance,
 * which the merged-cell spreadsheet grid never managed.
 */

export type WeekSelection = { assetId: string; startWeek: string; endWeek: string } | null;

type WeekGridProps = {
  assets: FleetAsset[];
  reservations: FleetReservation[];
  windowStart: string;
  windowWeeks: number;
  today: string;
  /** Weeks ahead the viewer is allowed to book, from their reliability score. */
  horizonWeeks: number;
  selection: WeekSelection;
  onSelect: (selection: WeekSelection) => void;
  onOpenReservation: (reservation: FleetReservation) => void;
};

type CellState = {
  reservation: FleetReservation | null;
  /** First cell of a run, so only one label is drawn across a multi-week booking. */
  isRunStart: boolean;
  bookable: boolean;
  beyondHorizon: boolean;
  inPast: boolean;
};

export function WeekGrid({
  assets,
  reservations,
  windowStart,
  windowWeeks,
  today,
  horizonWeeks,
  selection,
  onSelect,
  onOpenReservation,
}: WeekGridProps) {
  const weeks = useMemo(() => weekRange(windowStart, windowWeeks), [windowStart, windowWeeks]);
  const currentWeek = useMemo(() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }, [today]);

  // Index blocking reservations by asset+week once, rather than scanning the
  // list for every one of the (assets × weeks) cells.
  const byAssetWeek = useMemo(() => {
    const map = new Map<string, FleetReservation>();
    for (const reservation of reservations) {
      if (!isBlocking(reservation.status)) continue;
      const span = weeksBetween(reservation.start_week, reservation.end_week);
      for (let i = 0; i <= span; i += 1) {
        const d = new Date(`${reservation.start_week}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + i * 7);
        map.set(`${reservation.asset_id}|${d.toISOString().slice(0, 10)}`, reservation);
      }
    }
    return map;
  }, [reservations]);

  function stateFor(asset: FleetAsset, week: string): CellState {
    const reservation = byAssetWeek.get(`${asset.id}|${week}`) ?? null;
    const inPast = week < currentWeek;
    const beyondHorizon = weeksBetween(currentWeek, week) > horizonWeeks;
    const assetBookable = asset.status !== "retired" && asset.status !== "in_repair";
    return {
      reservation,
      isRunStart: reservation ? reservation.start_week === week || week === weeks[0] : false,
      bookable: !reservation && !inPast && !beyondHorizon && assetBookable,
      beyondHorizon,
      inPast,
    };
  }

  function handleCellClick(asset: FleetAsset, week: string, state: CellState) {
    if (state.reservation) {
      onOpenReservation(state.reservation);
      return;
    }
    if (!state.bookable) return;

    // Second click in the same row extends the run; anything else starts fresh.
    if (selection && selection.assetId === asset.id) {
      if (week === selection.startWeek && week === selection.endWeek) {
        onSelect(null); // click the single selected cell again to clear
        return;
      }
      const startWeek = week < selection.startWeek ? week : selection.startWeek;
      const endWeek = week > selection.startWeek ? week : selection.startWeek;
      onSelect({ assetId: asset.id, startWeek, endWeek });
      return;
    }
    onSelect({ assetId: asset.id, startWeek: week, endWeek: week });
  }

  function isSelected(assetId: string, week: string): boolean {
    if (!selection || selection.assetId !== assetId) return false;
    return week >= selection.startWeek && week <= selection.endWeek;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-glass/10 bg-glass/[0.03]">
      <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-[2] w-52 bg-surface/95 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3/75 backdrop-blur"
            >
              Material
            </th>
            {weeks.map((week) => {
              const { week: kw } = isoWeekNumber(week);
              const isCurrent = week === currentWeek;
              return (
                <th
                  key={week}
                  scope="col"
                  className={`px-1.5 py-2 text-center text-[11px] font-medium ${
                    isCurrent ? "text-accent-soft" : "text-ink-3/75"
                  }`}
                >
                  <span className="block tabular-nums">KW {kw}</span>
                  <span className="block text-[10px] font-normal text-ink-5">{formatWeekLabel(week)}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr key={asset.id} className="group/row">
              <th
                scope="row"
                className="sticky left-0 z-[1] border-t border-glass/[0.07] bg-surface/95 px-3 py-2 backdrop-blur"
              >
                <span className="block truncate text-xs font-medium text-ink">{asset.name}</span>
                <span className="block truncate text-[11px] font-normal text-ink-5">
                  {asset.current_location ?? "Location unknown"}
                </span>
              </th>
              {weeks.map((week) => {
                const state = stateFor(asset, week);
                const selected = isSelected(asset.id, week);
                const reservation = state.reservation;
                const overdue = reservation != null && reservation.days_overdue > 0;

                return (
                  <td key={week} className="border-t border-glass/[0.07] p-0.5">
                    <button
                      type="button"
                      onClick={() => handleCellClick(asset, week, state)}
                      disabled={!state.bookable && !reservation}
                      aria-label={
                        reservation
                          ? `${asset.name}, week of ${formatWeekLabel(week)}: ${reservation.holder_name}`
                          : `${asset.name}, week of ${formatWeekLabel(week)}: ${
                              state.bookable ? "free, click to book" : "not bookable"
                            }`
                      }
                      aria-pressed={selected}
                      className={cellClass({ state, selected, overdue, mine: reservation?.is_mine ?? false })}
                    >
                      {reservation && state.isRunStart ? (
                        <span className="truncate px-1 text-[10px] font-medium">
                          {reservation.is_mine ? "You" : firstNameOf(reservation.holder_name)}
                        </span>
                      ) : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {assets.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-ink-4">No material matches this filter.</p>
      ) : null}
    </div>
  );
}

function cellClass(args: {
  state: CellState;
  selected: boolean;
  overdue: boolean;
  mine: boolean;
}): string {
  const { state, selected, overdue, mine } = args;
  const base =
    "flex h-9 w-full items-center justify-center overflow-hidden rounded-md text-ink transition ease-fluid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/80";

  if (selected) return `${base} bg-accent/85 text-slate-900 ring-1 ring-accent`;
  if (overdue) return `${base} bg-rose-500/30 text-danger ring-1 ring-rose-400/40 hover:bg-rose-500/40`;
  if (state.reservation) {
    return mine
      ? `${base} bg-accent-deep/45 text-accent-soft ring-1 ring-accent/30 hover:bg-accent-deep/60`
      : `${base} bg-glass/20 text-ink-3 hover:bg-glass/28`;
  }
  if (state.inPast) return `${base} cursor-default bg-transparent opacity-30`;
  if (state.beyondHorizon) {
    return `${base} cursor-not-allowed bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.05)_4px,rgba(255,255,255,0.05)_8px)]`;
  }
  if (!state.bookable) return `${base} cursor-not-allowed bg-transparent opacity-25`;
  return `${base} bg-glass/[0.06] hover:bg-accent/30`;
}

function firstNameOf(name: string): string {
  return name.split(" ")[0] ?? name;
}
