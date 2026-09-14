"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Input, Notice } from "@/components/ui";
import {
  addDays,
  formatDayLong,
  formatSpan,
  holderRgb,
  isBookable,
  spanLength,
  toDateKey,
} from "@/lib/fleet-rules";
import { playUiSound } from "@/lib/ui-sounds";
import { AssetIcon } from "./asset-icon";
import { IdentityPrompt } from "./identity-prompt";
import { ManageMaterial } from "./manage-material";
import { ReliabilityBadge, ReliabilityCard } from "./reliability-badge";
import { DayGrid, type DaySelection } from "./day-grid";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  categoryRank,
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

/** Where the "show finished bookings" preference is remembered, per browser. */
const SHOW_PAST_KEY = "fleet:show-past";

type Tab = "calendar" | "mine" | "material" | "manage";

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
  // Finished bookings are shown by default — the calendar answering "who had
  // this in March" is deliberate. The preference is remembered per browser
  // because re-hiding them on every visit is the kind of small friction that
  // makes people stop using a filter.
  const [showPast, setShowPast] = useState(true);
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
    // Read after mount rather than in the initial state: this panel can be
    // server-rendered, where localStorage does not exist, and seeding state
    // from it directly would mismatch the first client render.
    try {
      if (window.localStorage.getItem(SHOW_PAST_KEY) === "0") setShowPast(false);
    } catch {
      // Private window, or storage blocked. The default stands.
    }
  }, []);

  const toggleShowPast = useCallback((next: boolean) => {
    setShowPast(next);
    try {
      window.localStorage.setItem(SHOW_PAST_KEY, next ? "1" : "0");
    } catch {
      // Not being able to remember it is not a reason to refuse the toggle.
    }
  }, []);

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

  // The calendar is for material you can actually take: the shared pool, minus
  // anything retired or in repair. Units assigned to a person, region or
  // customer are fixed — a row of unbookable cells for each of them buried the
  // handful that are genuinely free, which is the question this screen answers.
  const bookableAssets = useMemo(() => visibleAssets.filter(isBookable), [visibleAssets]);
  const assignedAssets = useMemo(() => assets.filter((asset) => !asset.pooled), [assets]);

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

  const unclaimedHolders = useMemo(() => board?.unclaimed_holders ?? [], [board]);
  /** The viewer's own name, for the "add me as ..." option in the setup prompt. */
  const myDisplayName = useMemo(
    () => board?.standings.find((s) => s.user_id === board?.me.user_id)?.name ?? "me",
    [board],
  );
  /** Names the viewer is allowed to claim for themselves, without an admin. */
  const claimableByMe = useMemo(() => unclaimedHolders.filter((h) => h.mine), [unclaimedHolders]);

  const selectedAsset = selection ? (assets.find((a) => a.id === selection.assetId) ?? null) : null;

  // Legend entries: only the people with something in the rendered window, so a
  // 178-booking year does not print every name under every screen.
  const visibleHolders = useMemo(() => {
    const windowEnd = addDays(windowStart, WINDOW_DAYS - 1);
    const bookable = new Set(assets.filter(isBookable).map((a) => a.id));
    const names = new Set<string>();
    for (const r of reservations) {
      if (!bookable.has(r.asset_id)) continue;
      if (r.status === "cancelled" || r.status === "waitlisted") continue;
      if (r.end_date < windowStart || r.start_date > windowEnd) continue;
      names.add(r.holder_name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [reservations, assets, windowStart]);

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
      // The window travels with the write so the server can hand back the board
      // for the days actually on screen.
      const response = await fetch(
        `/api/fleet?start=${encodeURIComponent(windowStart)}&days=${WINDOW_DAYS}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await response.json().catch(() => null)) as
        | {
            error?: string;
            message?: string;
            waitlisted?: boolean;
            promoted?: string | null;
            board?: FleetBoardResponse;
          }
        | null;
      if (!response.ok) {
        setNotice({ tone: "warn", text: data?.error ?? "That did not go through." });
        return false;
      }
      if (data?.message) setNotice({ tone: "neutral", text: data.message });

      if (data?.board) {
        // The write already came back with the refreshed board, so there is no
        // second request to make. Bumping the sequence first retires any load
        // still in flight: its response predates this write, and applying it
        // afterwards would put the pre-write board back on screen.
        requestSeq.current += 1;
        setBoard(data.board);
        setLoading(false);
      } else {
        // Older response, or the board refresh failed server-side. Fall back to
        // fetching it ourselves so the screen still catches up.
        await load(windowStart);
      }
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

      {overdueCount > 0 ? (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-danger">
            {overdueCount} item{overdueCount === 1 ? "" : "s"} overdue
          </span>
        </div>
      ) : null}

      {/* Matched automatically on sign-in. Announced rather than silent: this
          moved bookings onto their account, and they should know it happened. */}
      {board?.auto_linked ? (
        <Notice tone="positive">
          Welcome back — <span className="font-medium">{board.auto_linked.label}</span> in the old fleet sheet is
          you.{" "}
          {board.auto_linked.bookings > 0
            ? `${board.auto_linked.bookings} booking${board.auto_linked.bookings === 1 ? "" : "s"}`
            : "No bookings"}
          {board.auto_linked.assets > 0
            ? ` and ${board.auto_linked.assets} assigned unit${board.auto_linked.assets === 1 ? "" : "s"}`
            : ""}{" "}
          now sit under your account. Tell an admin if that is wrong.
        </Notice>
      ) : null}

      {/* Asked once per person, server-tracked — see IdentityPrompt. */}
      {board && !board.identity_confirmed ? (
        <IdentityPrompt
          displayName={board.me.user_id ? myDisplayName : "me"}
          suggestions={claimableByMe}
          allUnclaimed={unclaimedHolders}
          busy={busy}
          onClaim={(label) => void post({ action: "claim_holder", label })}
          onRegister={() => void post({ action: "register_member" })}
        />
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      {board && assets.length === 0 ? (
        <Notice tone="neutral">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              No material yet.{" "}
              {board.is_admin
                ? "Add the fleet in Manage — everything you add becomes bookable here."
                : "An admin needs to add the fleet before anything can be booked."}
            </span>
            {board.is_admin ? (
              <Button size="xs" variant="accent" onClick={() => setTab("manage")}>
                Go to Manage
              </Button>
            ) : null}
          </div>
        </Notice>
      ) : null}

      <nav className="flex flex-wrap gap-1.5" role="tablist" aria-label="Fleet sections">
        {(
          [
            ["calendar", `Calendar${bookableAssets.length ? ` (${bookableAssets.length})` : ""}`],
            ["mine", `My material${myReservations.length ? ` (${myReservations.length})` : ""}`],
            ["material", "Material"],
            // Configuring the fleet is admin-only: this list is shared reference
            // data, and a stray entry lands in everyone's calendar.
            ...(board?.is_admin ? ([["manage", "Manage"]] as Array<[Tab, string]>) : []),
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
              {/* Stepping 14 days at a time makes older history unreachable in
                  practice — a year back is 26 clicks. Jump straight there. */}
              <input
                type="date"
                value={windowStart}
                onChange={(event) => {
                  if (event.target.value) setWindowStart(event.target.value);
                }}
                aria-label="Jump to date"
                className="rounded-lg border border-glass/15 bg-glass/8 px-2 py-1.5 text-xs text-ink [color-scheme:dark]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as FleetAssetCategory | "all")}
                className="rounded-lg border border-glass/15 bg-glass/8 px-2 py-1.5 text-xs text-ink"
                aria-label="Filter by category"
              >
                <option value="all">All material</option>
                {CATEGORY_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABEL[value]}
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
              <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-lg border border-glass/15 bg-glass/8 px-2 py-1.5 text-xs text-ink-3 transition hover:text-ink">
                <input
                  type="checkbox"
                  checked={showPast}
                  onChange={(event) => toggleShowPast(event.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer accent-accent"
                />
                Past bookings
              </label>
            </div>
          </div>

          <DayGrid
            assets={bookableAssets}
            reservations={reservations}
            windowStart={windowStart}
            windowDays={WINDOW_DAYS}
            today={board?.today ?? new Date().toISOString().slice(0, 10)}
            horizonDays={board?.is_admin ? 365 : (board?.me.horizonDays ?? 56)}
            selection={selection}
            showPast={showPast}
            onSelect={setSelection}
            onOpenReservation={setDetail}
          />

          {assignedAssets.length > 0 ? (
            <p className="text-[11px] text-ink-5">
              Showing the {bookableAssets.length} unit{bookableAssets.length === 1 ? "" : "s"} in the shared pool.{" "}
              {assignedAssets.length} assigned unit{assignedAssets.length === 1 ? " is" : "s are"} not bookable; find
              them under Material.
            </p>
          ) : null}

          {/* Who is who. Colour identifies the PERSON; every state cue below is an
              outline or a texture instead of a hue, so the two never compete. */}
          {visibleHolders.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-glass/10 bg-glass/[0.03] px-3 py-2 text-[11px] text-ink-3">
              {visibleHolders.map((h) => (
                <span key={h} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-[3px]"
                    style={{ backgroundColor: `rgb(${holderRgb(h)} / 0.6)` }}
                    aria-hidden
                  />
                  {h}
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-5">
            <LegendSwatch className="bg-glass/[0.07]" label="Free — click to book" />
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-5 rounded bg-glass/25 outline outline-1 -outline-offset-1 outline-glass/60"
                aria-hidden
              />
              Yours
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-5 rounded bg-glass/25 outline outline-2 -outline-offset-2 outline-rose-400/90"
                aria-hidden
              />
              Overdue
            </span>
            <LegendSwatch
              className="bg-glass/20 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.22)_3px,rgba(255,255,255,0.22)_5px)]"
              label="Unclaimed"
            />
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded bg-glass/[0.09]" aria-hidden />
              Past (same colour, faded)
            </span>
            <LegendSwatch
              className="bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.08)_3px,rgba(255,255,255,0.08)_6px)]"
              label="Beyond your horizon"
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

      {tab === "manage" && board?.is_admin ? (
        <ManageMaterial
          assets={assets}
          archived={board.archived_assets ?? []}
          unclaimed={unclaimedHolders}
          busy={busy}
          onCreate={(draft) =>
            post({
              action: "create_asset",
              name: draft.name,
              category: draft.category,
              serial_number: draft.serial_number || undefined,
              model: draft.model || undefined,
              owner_group: draft.owner_group || undefined,
              pooled: draft.pooled,
              home_location: draft.home_location || undefined,
              current_holder_label: draft.pooled ? undefined : draft.current_holder_label,
              notes: draft.notes || undefined,
            })
          }
          onUpdate={(assetId, patch) => void post({ action: "update_asset", asset_id: assetId, ...patch })}
          onArchive={(assetId, archivedFlag) =>
            void post({ action: "archive_asset", asset_id: assetId, archived: archivedFlag })
          }
          remindersEnabled={board.reminders_enabled}
          onSetReminders={(enabled) => void post({ action: "set_reminders", enabled })}
          standings={<Standings board={board} />}
        />
      ) : null}

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
    return [...map.entries()].sort((a, b) => categoryRank(a[0]) - categoryRank(b[0]));
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
          <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-ink-3/75">
            <AssetIcon category={category} className="h-3.5 w-3.5 shrink-0" />
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
                      <AssetIcon category={asset.category} className="h-4 w-4 shrink-0 text-ink-4" />
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
                    {asset ? (
                      <AssetIcon category={asset.category} className="h-4 w-4 shrink-0 text-ink-4" />
                    ) : null}
                    <span className="text-xs font-medium text-ink">{asset?.name ?? "Material"}</span>
                    {reservation.imported ? (
                      <Badge tone="neutral" title="Carried over from the fleet sheet — does not affect your score">
                        From sheet
                      </Badge>
                    ) : null}
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


