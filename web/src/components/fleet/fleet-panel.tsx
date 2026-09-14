"use client";

import { useState } from "react";
import { Badge, Button, Card, Input, Notice, Select } from "@/components/ui";
import { CalendarTab } from "./calendar-tab";
import { IdentityPrompt } from "./identity-prompt";
import { ManageMaterial } from "./manage-material";
import { MaterialList } from "./material-list";
import { MyMaterial } from "./my-material";
import { ReliabilityBadge } from "./reliability-badge";
import { ReservationDetail } from "./reservation-detail";
import { Standings } from "./standings";
import { Stat } from "./ui";
import { useFleet, type FleetTab } from "./use-fleet";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
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
 *
 * This file is the orchestrator only: the state lives in `use-fleet.ts` and
 * each tab is its own component, the same split the Time Tracker and Mail
 * Tracking modules use.
 */
export function FleetPanel({ initialBoard = null }: { initialBoard?: FleetBoardResponse | null }) {
  const state = useFleet(initialBoard);
  const {
    board,
    loading,
    error,
    notice,
    busy,
    load,
    post,
    tab,
    setTab,
    windowStart,
    categoryFilter,
    setCategoryFilter,
    search,
    setSearch,
    today,
    assets,
    visibleAssets,
    bookableAssets,
    myReservations,
    summary,
    unclaimedHolders,
    claimableByMe,
    myDisplayName,
  } = state;

  const [detail, setDetail] = useState<FleetReservation | null>(null);

  // The category filter and the search box drive BOTH the calendar rows and the
  // Material register, so they belong to the panel rather than to either tab.
  // They used to live inside the calendar toolbar, which meant a filter set
  // there silently trimmed the Material list with no visible control there to
  // explain why.
  const filtersApply = tab === "calendar" || tab === "material";
  const filtered = categoryFilter !== "all" || search.trim() !== "";

  const tabs: Array<[FleetTab, string, number | null]> = [
    ["calendar", "Calendar", bookableAssets.length || null],
    ["mine", "My material", myReservations.length || null],
    ["material", "Material", assets.length || null],
    // Configuring the fleet is admin-only: this list is shared reference data,
    // and a stray entry lands in everyone's calendar.
    ...(board?.is_admin ? ([["manage", "Manage", null]] as Array<[FleetTab, string, number | null]>) : []),
  ];

  return (
    <Card padding="lg" className="space-y-4">
      {/* ----------------------------------------------------------- header */}
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
          <Button
            size="xs"
            variant="glass-quiet"
            onClick={() => void load(windowStart)}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </header>

      {/* ---------------------------------------------------- summary strip */}
      {board && assets.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Stat label="in the pool" value={summary.pool} title="Units anyone can book" />
          <Stat
            label="out now"
            value={summary.out}
            tone={summary.out > 0 ? "accent" : "neutral"}
            title="Units someone is physically holding"
          />
          <Stat
            label="overdue"
            value={summary.overdue}
            tone={summary.overdue > 0 ? "danger" : "neutral"}
            title="Bookings past their return date"
            onClick={summary.overdue > 0 ? () => setTab("mine") : undefined}
          />
          <Stat
            label="back this week"
            value={summary.dueSoon}
            title="Live bookings due back within seven days"
          />
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

      {/* A write's result is announced, not just drawn: the toast-shaped
          feedback here ("waitlisted", "promoted") is the only confirmation a
          booking gives, and a screen reader would otherwise miss it. */}
      <div aria-live="polite" className="empty:hidden">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      </div>

      {/* ------------------------------------------------- tabs and filters */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav
          className="flex flex-wrap items-center gap-0.5 rounded-lg border border-glass/12 bg-glass/[0.05] p-0.5"
          role="tablist"
          aria-label="Fleet sections"
        >
          {tabs.map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`fleet-tab-${key}`}
              aria-selected={tab === key}
              aria-controls="fleet-tabpanel"
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition ease-fluid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/80 ${
                tab === key
                  ? "bg-accent-deep/30 text-accent-soft ring-1 ring-inset ring-accent/40"
                  : "text-ink-4 hover:bg-glass/10 hover:text-ink-2"
              }`}
            >
              {label}
              {count != null ? (
                <span className="text-[11px] tabular-nums opacity-60">{count}</span>
              ) : null}
            </button>
          ))}
        </nav>

        {filtersApply ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as FleetAssetCategory | "all")}
              className="w-auto px-2 py-1.5 text-xs text-ink"
              aria-label="Filter by type"
            >
              <option value="all">All types</option>
              {CATEGORY_ORDER.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABEL[value]}
                </option>
              ))}
            </Select>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearch("");
              }}
              placeholder="Search name, serial, location…"
              className="w-52 px-2 py-1.5 text-xs"
              aria-label="Search material"
            />
            {filtered ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setCategoryFilter("all");
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ tabs */}
      {/* One panel, re-rendered per tab, rather than four mounted panels with
          three hidden: the calendar alone is ~400 cells, and keeping it mounted
          behind Manage would cost that on every board refresh. */}
      <div role="tabpanel" id="fleet-tabpanel" aria-labelledby={`fleet-tab-${tab}`}>
        {tab === "calendar" ? (
          <CalendarTab state={state} onOpenReservation={setDetail} onManage={() => setTab("manage")} />
        ) : null}

        {tab === "material" ? (
          <MaterialList
            assets={visibleAssets}
            busy={busy}
            onConfirm={(assetId) => void post({ action: "confirm_location", asset_id: assetId })}
            onMove={(assetId, location) => void post({ action: "move", asset_id: assetId, location })}
          />
        ) : null}

        {tab === "mine" ? (
          <MyMaterial
            reservations={myReservations}
            assets={assets}
            today={today}
            busy={busy}
            score={board?.me ?? null}
            onCheckOut={(id) => void post({ action: "check_out", reservation_id: id })}
            onCheckIn={(id, location) =>
              void post({ action: "check_in", reservation_id: id, location: location || undefined })
            }
            onCancel={(id) => void post({ action: "cancel", reservation_id: id })}
            onBrowse={() => setTab("calendar")}
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
      </div>

      {detail ? (
        <ReservationDetail
          reservation={detail}
          asset={assets.find((a) => a.id === detail.asset_id) ?? null}
          today={today}
          busy={busy}
          onClose={() => setDetail(null)}
          onCheckIn={async (id) => {
            if (await post({ action: "check_in", reservation_id: id })) setDetail(null);
          }}
          onCancel={async (id) => {
            if (await post({ action: "cancel", reservation_id: id })) setDetail(null);
          }}
        />
      ) : null}
    </Card>
  );
}
