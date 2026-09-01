"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Input, Notice } from "@/components/ui";
import { addDays, formatDayLong, formatSpan, spanLength, toDateKey } from "@/lib/fleet-rules";
import { playUiSound } from "@/lib/ui-sounds";
import { ReliabilityBadge, ReliabilityCard } from "./reliability-badge";
import { DayGrid, type DaySelection } from "./day-grid";
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  type FleetAsset,
  type FleetAssetCategory,
  type FleetBoardResponse,
  type FleetReservation,
} from "./types";

/**
 * Fleet — material tracking and day-level booking.
 *
 * Built to replace the shared Google Sheet, whose three failures this panel
 * answers directly:
 *   - booking was a merged-cell mess     -> click days in a grid
 *   - locations went stale invisibly     -> every asset shows its location and
 *                                           how long since anyone confirmed it
 *   - nothing chased late returns        -> a daily reminder cron, plus a
 *                                           reliability score that ranks you in
 *                                           the queue for contested days
 */

/** Four weeks of day columns: a month of planning that still fits a laptop. */
const WINDOW_DAYS = 28;
/** How far the ← / → buttons jump. */
const WINDOW_STEP_DAYS = 14;

type Tab = "calendar" | "material" | "mine" | "standings";

export function FleetPanel({ initialBoard = null }: { initialBoard?: FleetBoardResponse | null }) {
  const [board, setBoard] = useState<FleetBoardResponse | null>(initialBoard);
  const [loading, setLoading] = useState(!initialBoard);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "neutral" | "warn" | "danger"; text: string } | null>(null);
  const [tab, setTab] = useState<Tab>("calendar");
  const [windowStart, setWindowStart] = useState<string>(
    () => initialBoard?.window_start ?? toDateKey(new Date()),
  );
  const [selection, setSelection] = useState<DaySelection>(null);
  const [categoryFilter, setCategoryFilter] = useState<FleetAssetCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<FleetReservation | null>(null);

  // Guards against a slow response for an earlier window overwriting a newer one
  // (the same staleness rule the Time Tracker follows for its week fetches).
  const requestSeq = useRef(0);

  const load = useCallback(
    async (start: string) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/fleet?start=${encodeURIComponent(start)}&days=${WINDOW_DAYS}`,
        );
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Request failed");
        const data = (await response.json()) as FleetBoardResponse;
        if (seq !== requestSeq.current) return;
        setBoard(data);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError((err as Error).message || "Could not load the fleet.");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (initialBoard && initialBoard.window_start === windowStart) return;
    void load(windowStart);
  }, [windowStart, load, initialBoard]);

  // Memoised so the `?? []` fallback does not hand every downstream useMemo a
  // fresh array identity on each render.
  const assets = useMemo(() => board?.assets ?? [], [board]);
  const reservations = useMemo(() => board?.reservations ?? [], [board]);

  const visibleAssets = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (categoryFilter !== "all" && asset.category !== categoryFilter) return false;
      if (!needle) return true;
      return [asset.name, asset.serial_number, asset.model, asset.current_location, asset.holder_name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [assets, categoryFilter, search]);

  const myReservations = useMemo(
    () =>
      reservations
        .filter((r) => r.is_mine && r.status !== "cancelled" && r.status !== "returned")
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [reservations],
  );

  const overdueCount = useMemo(
    () => reservations.filter((r) => r.days_overdue > 0).length,
    [reservations],
  );

  const staleCount = useMemo(() => assets.filter((a) => a.location_stale).length, [assets]);

  const selectedAsset = selection ? (assets.find((a) => a.id === selection.assetId) ?? null) : null;

  async function post(body: Record<string, unknown>): Promise<boolean> {
    if (board?.demo) {
      setNotice({
        tone: "warn",
        text: "This is sample data — apply the fleet migration to make bookings real.",
      });
      return false;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/fleet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string; message?: string; waitlisted?: boolean; promoted?: string | null }
        | null;
      if (!response.ok) {
        setNotice({ tone: "warn", text: data?.error ?? "That did not go through." });
        return false;
      }
      if (data?.message) setNotice({ tone: "neutral", text: data.message });
      await load(windowStart);
      return true;
    } catch (err) {
      setNotice({ tone: "danger", text: (err as Error).message || "Network error." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmBooking(waitlist: boolean) {
    if (!selection) return;
    const ok = await post({
      action: "reserve",
      asset_id: selection.assetId,
      start_date: selection.startDate,
      end_date: selection.endDate,
      destination: bookingDestination.trim() || undefined,
      purpose: bookingPurpose.trim() || undefined,
      waitlist,
    });
    if (ok) {
      playUiSound("switchWhoosh");
      setSelection(null);
      setBookingDestination("");
      setBookingPurpose("");
    }
  }

  const [bookingDestination, setBookingDestination] = useState("");
  const [bookingPurpose, setBookingPurpose] = useState("");

  const daysSelected = selection ? spanLength(selection.startDate, selection.endDate) : 0;

  return (
    <Card className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">Fleet</h2>
            <Badge tone="warn">Beta</Badge>
          </div>
          <p className="mt-1 text-xs text-ink-4">
            Book material by the day, and see exactly where every unit is right now.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {board ? <ReliabilityBadge score={board.me} /> : null}
          <Button size="xs" variant="glass-quiet" onClick={() => void load(windowStart)} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </header>

      {(overdueCount > 0 || staleCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {overdueCount > 0 ? (
            <span className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-danger">
              {overdueCount} item{overdueCount === 1 ? "" : "s"} overdue
            </span>
          ) : null}
          {staleCount > 0 ? (
            <span className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-warn">
              {staleCount} location{staleCount === 1 ? "" : "s"} unconfirmed
            </span>
          ) : null}
        </div>
      )}

      {board?.demo ? (
        <Notice tone="warn">
          <span className="font-medium">Sample data.</span> The fleet tables are not in the database yet — apply{" "}
          <code className="rounded bg-glass/15 px-1">supabase/2026-09-01-fleet-management.sql</code> in the Supabase
          SQL editor and reload. Booking and check-in are disabled until then.
        </Notice>
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <nav className="flex flex-wrap gap-1.5" role="tablist" aria-label="Fleet sections">
        {(
          [
            ["calendar", "Calendar"],
            ["material", "Material"],
            ["mine", `My material${myReservations.length ? ` (${myReservations.length})` : ""}`],
            ["standings", "Standings"],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ease-fluid ${
              tab === key
                ? "border-accent/50 bg-accent-deep/20 text-accent-soft"
                : "border-glass/10 bg-glass/5 text-ink-3 hover:bg-glass/10"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "calendar" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Button
                size="xs"
                variant="glass-quiet"
                onClick={() => setWindowStart(addDays(windowStart, -WINDOW_STEP_DAYS))}
              >
                ← Earlier
              </Button>
              <Button size="xs" variant="glass-quiet" onClick={() => setWindowStart(toDateKey(new Date()))}>
                Today
              </Button>
              <Button
                size="xs"
                variant="glass-quiet"
                onClick={() => setWindowStart(addDays(windowStart, WINDOW_STEP_DAYS))}
              >
                Later →
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as FleetAssetCategory | "all")}
                className="rounded-lg border border-glass/15 bg-glass/8 px-2 py-1.5 text-xs text-ink"
                aria-label="Filter by category"
              >
                <option value="all">All material</option>
                {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, serial, location…"
                className="w-52 text-xs"
                aria-label="Search material"
              />
            </div>
          </div>

          <DayGrid
            assets={visibleAssets}
            reservations={reservations}
            windowStart={windowStart}
            windowDays={WINDOW_DAYS}
            today={board?.today ?? new Date().toISOString().slice(0, 10)}
            horizonDays={board?.is_admin ? 365 : (board?.me.horizonDays ?? 56)}
            selection={selection}
            onSelect={setSelection}
            onOpenReservation={setDetail}
          />

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-5">
            <LegendSwatch className="bg-glass/[0.07]" label="Free — click to book" />
            <LegendSwatch className="bg-accent-deep/45" label="Yours" />
            <LegendSwatch className="bg-glass/20" label="Someone else" />
            <LegendSwatch className="bg-rose-500/30" label="Overdue" />
            <LegendSwatch
              className="bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.08)_3px,rgba(255,255,255,0.08)_6px)]"
              label="Beyond your booking horizon"
            />
          </div>

          {selection && selectedAsset ? (
            <div className="rounded-xl border border-accent/30 bg-accent-deep/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{selectedAsset.name}</p>
                  <p className="mt-0.5 text-xs text-ink-4">
                    {daysSelected} day{daysSelected === 1 ? "" : "s"} ·{" "}
                    {formatSpan(selection.startDate, selection.endDate)} · back by{" "}
                    {formatDayLong(selection.endDate)}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-5">
                    Click another day in the same row to extend the booking.
                  </p>
                </div>
                <Button size="xs" variant="ghost" onClick={() => setSelection(null)}>
                  Clear
                </Button>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Input
                  value={bookingDestination}
                  onChange={(event) => setBookingDestination(event.target.value)}
                  placeholder="Where is it going? (site, city, customer)"
                  className="text-xs"
                  aria-label="Destination"
                />
                <Input
                  value={bookingPurpose}
                  onChange={(event) => setBookingPurpose(event.target.value)}
                  placeholder="What for? (optional)"
                  className="text-xs"
                  aria-label="Purpose"
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="accent" onClick={() => void confirmBooking(false)} disabled={busy}>
                  {busy ? "Booking…" : `Book ${daysSelected} day${daysSelected === 1 ? "" : "s"}`}
                </Button>
                <Button size="sm" variant="glass" onClick={() => void confirmBooking(true)} disabled={busy}>
                  Join waitlist instead
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "material" ? (
        <MaterialList
          assets={visibleAssets}
          isAdmin={board?.is_admin ?? false}
          busy={busy}
          onConfirm={(assetId) => void post({ action: "confirm_location", asset_id: assetId })}
          onMove={(assetId, location) => void post({ action: "move", asset_id: assetId, location })}
          search={search}
          onSearch={setSearch}
        />
      ) : null}

      {tab === "mine" ? (
        <MyMaterial
          reservations={myReservations}
          assets={assets}
          busy={busy}
          onCheckOut={(id) => void post({ action: "check_out", reservation_id: id })}
          onCheckIn={(id, location) =>
            void post({ action: "check_in", reservation_id: id, location: location || undefined })
          }
          onCancel={(id) => void post({ action: "cancel", reservation_id: id })}
          score={board?.me ?? null}
        />
      ) : null}

      {tab === "standings" ? <Standings board={board} /> : null}

      {detail ? (
        <ReservationDetail
          reservation={detail}
          asset={assets.find((a) => a.id === detail.asset_id) ?? null}
          onClose={() => setDetail(null)}
          busy={busy}
          onCheckIn={async (id) => {
            const ok = await post({ action: "check_in", reservation_id: id });
            if (ok) setDetail(null);
          }}
          onCancel={async (id) => {
            const ok = await post({ action: "cancel", reservation_id: id });
            if (ok) setDetail(null);
          }}
        />
      ) : null}
    </Card>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-5 rounded ${className}`} aria-hidden />
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

function MaterialList({
  assets,
  isAdmin,
  busy,
  onConfirm,
  onMove,
  search,
  onSearch,
}: {
  assets: FleetAsset[];
  isAdmin: boolean;
  busy: boolean;
  onConfirm: (assetId: string) => void;
  onMove: (assetId: string, location: string) => void;
  search: string;
  onSearch: (value: string) => void;
}) {
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");

  const grouped = useMemo(() => {
    const map = new Map<FleetAssetCategory, FleetAsset[]>();
    for (const asset of assets) {
      const list = map.get(asset.category) ?? [];
      list.push(asset);
      map.set(asset.category, list);
    }
    return [...map.entries()];
  }, [assets]);

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Search name, serial, location, holder…"
        className="text-xs"
        aria-label="Search material"
      />

      {grouped.map(([category, list]) => (
        <section key={category} className="space-y-1.5">
          <h3 className="text-[11px] uppercase tracking-[0.15em] text-ink-3/75">
            {CATEGORY_LABEL[category]} ({list.length})
          </h3>
          <ul className="space-y-1.5">
            {list.map((asset) => (
              <li
                key={asset.id}
                className="rounded-lg border border-glass/10 bg-glass/[0.04] px-3 py-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-ink">{asset.name}</span>
                      <Badge tone={statusTone(asset.status)}>{STATUS_LABEL[asset.status]}</Badge>
                      {asset.location_stale ? <Badge tone="warn">Unconfirmed</Badge> : null}
                    </div>
                    <p className="mt-1 truncate text-[11px] text-ink-5">
                      {asset.serial_number ? `${asset.serial_number} · ` : ""}
                      {asset.model ?? "—"}
                      {asset.owner_group ? ` · ${asset.owner_group}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-4">
                      <span className="text-ink-3">{asset.current_location ?? "Location unknown"}</span>
                      {asset.holder_name ? ` · with ${asset.holder_name}` : ""}
                      {asset.location_age_days != null
                        ? ` · confirmed ${asset.location_age_days}d ago`
                        : " · never confirmed"}
                    </p>
                    {asset.notes ? <p className="mt-1 text-[11px] text-ink-5">{asset.notes}</p> : null}
                  </div>

                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      size="xs"
                      variant="glass-quiet"
                      disabled={busy}
                      onClick={() => onConfirm(asset.id)}
                      title="Confirm this is where it actually is"
                    >
                      It&apos;s here
                    </Button>
                    <Button
                      size="xs"
                      variant="glass-quiet"
                      disabled={busy}
                      onClick={() => {
                        setMovingId(movingId === asset.id ? null : asset.id);
                        setMoveTo(asset.current_location ?? "");
                      }}
                    >
                      Move
                    </Button>
                  </div>
                </div>

                {movingId === asset.id ? (
                  <div className="mt-2 flex gap-1.5">
                    <Input
                      value={moveTo}
                      onChange={(event) => setMoveTo(event.target.value)}
                      placeholder="New location"
                      className="text-xs"
                      aria-label={`New location for ${asset.name}`}
                    />
                    <Button
                      size="xs"
                      variant="accent"
                      disabled={busy || !moveTo.trim()}
                      onClick={() => {
                        onMove(asset.id, moveTo.trim());
                        setMovingId(null);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {assets.length === 0 ? <p className="text-xs text-ink-4">Nothing matches that search.</p> : null}
      {!isAdmin ? null : (
        <p className="text-[11px] text-ink-5">
          Admin: retiring a unit or marking it in-repair is done via the API&apos;s <code>set_status</code> action.
        </p>
      )}
    </div>
  );
}

function statusTone(status: FleetAsset["status"]) {
  switch (status) {
    case "available":
      return "positive" as const;
    case "out":
      return "accent" as const;
    case "in_repair":
      return "warn" as const;
    case "retired":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

/* -------------------------------------------------------------------------- */

function MyMaterial({
  reservations,
  assets,
  busy,
  onCheckOut,
  onCheckIn,
  onCancel,
  score,
}: {
  reservations: FleetReservation[];
  assets: FleetAsset[];
  busy: boolean;
  onCheckOut: (id: string) => void;
  onCheckIn: (id: string, location: string) => void;
  onCancel: (id: string) => void;
  score: FleetBoardResponse["me"] | null;
}) {
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState("");

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
      <div className="space-y-1.5">
        {reservations.length === 0 ? (
          <p className="text-xs text-ink-4">
            Nothing booked. Pick days in the calendar to reserve material.
          </p>
        ) : null}

        {reservations.map((reservation) => {
          const asset = assets.find((a) => a.id === reservation.asset_id);
          const overdue = reservation.days_overdue > 0;
          return (
            <div
              key={reservation.id}
              className={`rounded-lg border px-3 py-2.5 ${
                overdue ? "border-rose-400/35 bg-rose-500/10" : "border-glass/10 bg-glass/[0.04]"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-ink">{asset?.name ?? "Material"}</span>
                    <Badge tone={overdue ? "danger" : reservation.status === "picked_up" ? "accent" : "neutral"}>
                      {overdue
                        ? `${reservation.days_overdue}d overdue`
                        : reservation.status === "picked_up"
                          ? "Out"
                          : reservation.status === "waitlisted"
                            ? `Waitlist #${reservation.queue_position ?? "?"}`
                            : "Booked"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-4">
                    {formatSpan(reservation.start_date, reservation.end_date)} · due back{" "}
                    {formatDayLong(reservation.due_date)}
                  </p>
                  {reservation.destination ? (
                    <p className="mt-0.5 text-[11px] text-ink-5">Going to {reservation.destination}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 gap-1.5">
                  {reservation.status === "reserved" ? (
                    <>
                      <Button size="xs" variant="accent" disabled={busy} onClick={() => onCheckOut(reservation.id)}>
                        Pick up
                      </Button>
                      <Button size="xs" variant="ghost" disabled={busy} onClick={() => onCancel(reservation.id)}>
                        Cancel
                      </Button>
                    </>
                  ) : null}
                  {reservation.status === "waitlisted" ? (
                    <Button size="xs" variant="ghost" disabled={busy} onClick={() => onCancel(reservation.id)}>
                      Leave waitlist
                    </Button>
                  ) : null}
                  {reservation.status === "picked_up" ? (
                    <Button
                      size="xs"
                      variant={overdue ? "accent" : "glass"}
                      disabled={busy}
                      onClick={() => {
                        setReturningId(returningId === reservation.id ? null : reservation.id);
                        setReturnTo(asset?.home_location ?? "");
                      }}
                    >
                      Bring back
                    </Button>
                  ) : null}
                </div>
              </div>

              {returningId === reservation.id ? (
                <div className="mt-2 flex gap-1.5">
                  <Input
                    value={returnTo}
                    onChange={(event) => setReturnTo(event.target.value)}
                    placeholder="Where are you leaving it?"
                    className="text-xs"
                    aria-label="Return location"
                  />
                  <Button
                    size="xs"
                    variant="accent"
                    disabled={busy}
                    onClick={() => {
                      onCheckIn(reservation.id, returnTo.trim());
                      setReturningId(null);
                    }}
                  >
                    Check in
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {score ? <ReliabilityCard score={score} /> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Standings({ board }: { board: FleetBoardResponse | null }) {
  if (!board) return <p className="text-xs text-ink-4">Loading…</p>;
  if (board.standings.length === 0) {
    return <p className="text-xs text-ink-4">No booking history yet.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-ink-4">
        Reliability is earned by bringing material back on time. It decides how far ahead you can book, and who wins
        a day two people want — the lower your score, the further down the queue you sit.
      </p>
      <ol className="space-y-1.5">
        {board.standings.map((entry, index) => (
          <li
            key={entry.user_id}
            className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
              entry.user_id === board.me.user_id
                ? "border-accent/40 bg-accent-deep/15"
                : "border-glass/10 bg-glass/[0.04]"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-ink-5">{index + 1}</span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-ink">
                  {entry.name}
                  {entry.user_id === board.me.user_id ? " (you)" : ""}
                </p>
                <p className="truncate text-[11px] text-ink-5">{entry.score.summary}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs font-semibold tabular-nums text-ink-2">{entry.score.score}</span>
              <ReliabilityBadge score={entry.score} showScore={false} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ReservationDetail({
  reservation,
  asset,
  onClose,
  busy,
  onCheckIn,
  onCancel,
}: {
  reservation: FleetReservation;
  asset: FleetAsset | null;
  onClose: () => void;
  busy: boolean;
  onCheckIn: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-glass/15 bg-surface/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{asset?.name ?? "Material"}</p>
          <p className="mt-0.5 text-xs text-ink-4">
            {reservation.is_mine ? "Booked by you" : `Booked by ${reservation.holder_name}`} ·{" "}
            {formatSpan(reservation.start_date, reservation.end_date)}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-5">
            Due back {formatDayLong(reservation.due_date)}
            {reservation.days_overdue > 0 ? ` · ${reservation.days_overdue} days overdue` : ""}
            {reservation.destination ? ` · ${reservation.destination}` : ""}
          </p>
          {reservation.purpose ? (
            <p className="mt-1 text-[11px] text-ink-5">{reservation.purpose}</p>
          ) : null}
        </div>
        <div className="flex gap-1.5">
          {reservation.is_mine && reservation.status === "picked_up" ? (
            <Button size="xs" variant="accent" disabled={busy} onClick={() => onCheckIn(reservation.id)}>
              Check in
            </Button>
          ) : null}
          {reservation.is_mine && reservation.status === "reserved" ? (
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => onCancel(reservation.id)}>
              Cancel
            </Button>
          ) : null}
          <Button size="xs" variant="glass-quiet" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
