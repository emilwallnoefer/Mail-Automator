"use client";

import { useMemo } from "react";
import {
  dayRange,
  daysBetween,
  formatDay,
  formatWeekday,
  isWeekend,
  isoWeekNumber,
  isBlocking,
  parseDateKey,
  weekdayIndex,
} from "@/lib/fleet-rules";
import type { FleetAsset, FleetReservation } from "./types";

/**
 * The booking calendar: one row per asset, one cell per DAY.
 *
 * Clicking a free cell starts a selection; clicking a second cell in the same
 * row extends it — that is the whole booking gesture. Occupied cells show who
 * has the material, so "where is it on the 14th" is answerable at a glance,
 * which the merged-cell spreadsheet grid never managed.
 *
 * Days rather than weeks because most missions are two or three days long.
 * Booking by the week meant a Tuesday–Wednesday job blocked the unit from
 * Monday to Sunday, so the board looked full while the shelf was not.
 */

export type DaySelection = { assetId: string; startDate: string; endDate: string } | null;

type DayGridProps = {
  assets: FleetAsset[];
  reservations: FleetReservation[];
  windowStart: string;
  windowDays: number;
  today: string;
  /** Days ahead the viewer is allowed to book, from their reliability score. */
  horizonDays: number;
  selection: DaySelection;
  onSelect: (selection: DaySelection) => void;
  onOpenReservation: (reservation: FleetReservation) => void;
};

type CellState = {
  reservation: FleetReservation | null;
  /** First cell of a visible run, so one label is drawn per booking. */
  isRunStart: boolean;
  bookable: boolean;
  beyondHorizon: boolean;
  inPast: boolean;
};

export function DayGrid({
  assets,
  reservations,
  windowStart,
  windowDays,
  today,
  horizonDays,
  selection,
  onSelect,
  onOpenReservation,
}: DayGridProps) {
  const days = useMemo(() => dayRange(windowStart, windowDays), [windowStart, windowDays]);

  // Index blocking reservations by asset+day once, rather than scanning the
  // list for every one of the (assets × days) cells.
  const byAssetDay = useMemo(() => {
    const map = new Map<string, FleetReservation>();
    for (const reservation of reservations) {
      if (!isBlocking(reservation.status)) continue;
      const length = daysBetween(reservation.start_date, reservation.end_date);
      for (let i = 0; i <= length; i += 1) {
        const d = new Date(parseDateKey(reservation.start_date).getTime() + i * 86_400_000);
        map.set(`${reservation.asset_id}|${d.toISOString().slice(0, 10)}`, reservation);
      }
    }
    return map;
  }, [reservations]);

  // Week rules: where a Monday falls inside the window, so the eye can group
  // days without a separate header row per week.
  const weekBoundaries = useMemo(() => new Set(days.filter((d, i) => i > 0 && weekdayIndex(d) === 0)), [days]);

  // Month spans for the top header row.
  const monthGroups = useMemo(() => {
    const groups: Array<{ label: string; span: number }> = [];
    for (const day of days) {
      const d = parseDateKey(day);
      const label = `${d.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.span += 1;
      else groups.push({ label, span: 1 });
    }
    return groups;
  }, [days]);

  function stateFor(asset: FleetAsset, day: string, index: number): CellState {
    const reservation = byAssetDay.get(`${asset.id}|${day}`) ?? null;
    const inPast = day < today;
    const beyondHorizon = daysBetween(today, day) > horizonDays;
    const assetBookable = asset.status !== "retired" && asset.status !== "in_repair";
    return {
      reservation,
      // Label the booking's own first day, or the window's left edge when the
      // booking started before the visible range.
      isRunStart: reservation ? reservation.start_date === day || index === 0 : false,
      bookable: !reservation && !inPast && !beyondHorizon && assetBookable,
      beyondHorizon,
      inPast,
    };
  }

  function handleCellClick(asset: FleetAsset, day: string, state: CellState) {
    if (state.reservation) {
      onOpenReservation(state.reservation);
      return;
    }
    if (!state.bookable) return;

    // Second click in the same row extends the run; anything else starts fresh.
    if (selection && selection.assetId === asset.id) {
      if (day === selection.startDate && day === selection.endDate) {
        onSelect(null); // click the single selected cell again to clear
        return;
      }
      const startDate = day < selection.startDate ? day : selection.startDate;
      const endDate = day > selection.startDate ? day : selection.startDate;
      onSelect({ assetId: asset.id, startDate, endDate });
      return;
    }
    onSelect({ assetId: asset.id, startDate: day, endDate: day });
  }

  function isSelected(assetId: string, day: string): boolean {
    if (!selection || selection.assetId !== assetId) return false;
    return day >= selection.startDate && day <= selection.endDate;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-glass/10 bg-glass/[0.03]">
      <table className="w-full border-separate border-spacing-0 text-left" style={{ minWidth: `${14 + days.length * 2.1}rem` }}>
        <thead>
          <tr>
            <th
              scope="col"
              rowSpan={2}
              className="sticky left-0 z-[2] w-52 bg-surface/95 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3/75 backdrop-blur"
            >
              Material
            </th>
            {monthGroups.map((group, i) => (
              <th
                key={`${group.label}-${i}`}
                scope="col"
                colSpan={group.span}
                className="border-b border-glass/[0.07] px-2 py-1.5 text-left text-[11px] font-medium text-ink-3/75"
              >
                {group.label}
              </th>
            ))}
          </tr>
          <tr>
            {days.map((day) => {
              const isToday = day === today;
              const weekend = isWeekend(day);
              const { week } = isoWeekNumber(day);
              return (
                <th
                  key={day}
                  scope="col"
                  title={`KW ${week}`}
                  className={`px-0.5 py-1.5 text-center text-[10px] font-medium ${
                    weekBoundaries.has(day) ? "border-l border-glass/20" : ""
                  } ${isToday ? "text-accent-soft" : weekend ? "text-ink-5/70" : "text-ink-3/75"}`}
                >
                  <span className="block">{formatWeekday(day)}</span>
                  <span className="block text-[11px] font-normal tabular-nums">{parseDateKey(day).getUTCDate()}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr key={asset.id}>
              <th
                scope="row"
                className="sticky left-0 z-[1] border-t border-glass/[0.07] bg-surface/95 px-3 py-2 backdrop-blur"
              >
                <span className="block truncate text-xs font-medium text-ink">{asset.name}</span>
                <span className="block truncate text-[11px] font-normal text-ink-5">
                  {asset.current_location ?? "Location unknown"}
                </span>
              </th>
              {days.map((day, index) => {
                const state = stateFor(asset, day, index);
                const selected = isSelected(asset.id, day);
                const reservation = state.reservation;
                const overdue = reservation != null && reservation.days_overdue > 0;

                return (
                  <td
                    key={day}
                    className={`border-t border-glass/[0.07] p-px ${
                      weekBoundaries.has(day) ? "border-l border-l-glass/20" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleCellClick(asset, day, state)}
                      disabled={!state.bookable && !reservation}
                      title={
                        reservation
                          ? `${asset.name} · ${formatDay(day)} · ${reservation.holder_name}${
                              reservation.destination ? ` · ${reservation.destination}` : ""
                            }`
                          : `${asset.name} · ${formatDay(day)}`
                      }
                      aria-label={
                        reservation
                          ? `${asset.name}, ${formatDay(day)}: booked by ${reservation.holder_name}`
                          : `${asset.name}, ${formatDay(day)}: ${
                              state.bookable ? "free, click to book" : "not bookable"
                            }`
                      }
                      aria-pressed={selected}
                      className={cellClass({
                        state,
                        selected,
                        overdue,
                        mine: reservation?.is_mine ?? false,
                        weekend: isWeekend(day),
                        isToday: day === today,
                      })}
                    >
                      {reservation && state.isRunStart ? (
                        <span className="pointer-events-none absolute left-0.5 z-[1] whitespace-nowrap text-[10px] font-medium">
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
  weekend: boolean;
  isToday: boolean;
}): string {
  const { state, selected, overdue, mine, weekend, isToday } = args;
  // `relative` so a run's name label can overflow its own day cell.
  const base =
    "relative flex h-8 w-full items-center justify-center overflow-visible rounded-[3px] text-ink transition ease-fluid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/80";
  const todayRing = isToday ? " ring-1 ring-inset ring-accent/50" : "";

  if (selected) return `${base}${todayRing} bg-accent/85 text-slate-900`;
  if (overdue) return `${base}${todayRing} bg-rose-500/35 text-danger hover:bg-rose-500/45`;
  if (state.reservation) {
    return mine
      ? `${base}${todayRing} bg-accent-deep/50 text-accent-soft hover:bg-accent-deep/65`
      : `${base}${todayRing} bg-glass/20 text-ink-3 hover:bg-glass/28`;
  }
  if (state.inPast) return `${base}${todayRing} cursor-default bg-transparent opacity-25`;
  if (state.beyondHorizon) {
    return `${base}${todayRing} cursor-not-allowed bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.05)_3px,rgba(255,255,255,0.05)_6px)]`;
  }
  if (!state.bookable) return `${base}${todayRing} cursor-not-allowed bg-transparent opacity-20`;
  return `${base}${todayRing} ${weekend ? "bg-glass/[0.03]" : "bg-glass/[0.07]"} hover:bg-accent/30`;
}

function firstNameOf(name: string): string {
  return name.split(" ")[0] ?? name;
}
