"use client";

import { useState } from "react";
import { Badge, Button, Card, Notice } from "@/components/ui";
import { CalendarTab } from "./calendar-tab";
import { FleetToolbar } from "./fleet-toolbar";
import { IdentityPrompt } from "./identity-prompt";
import { ManageMaterial } from "./manage-material";
import { MaterialList } from "./material-list";
import { MyMaterial } from "./my-material";
import { ReliabilityBadge } from "./reliability-badge";
import { ReservationDetail } from "./reservation-detail";
import { Standings } from "./standings";
import { useFleet, type FleetTab } from "./use-fleet";
import type { FleetBoardResponse, FleetReservation } from "./types";

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
    today,
    assets,
    visibleAssets,
    bookableAssets,
    myReservations,
    unclaimedHolders,
    claimableByMe,
    myDisplayName,
  } = state;

  const [detail, setDetail] = useState<FleetReservation | null>(null);

  const tabs: Array<[FleetTab, string, number | null]> = [
    ["calendar", "Calendar", bookableAssets.length || null],
    ["mine", "My material", myReservations.length || null],
    ["material", "Material", assets.length || null],
    // Configuring the fleet is admin-only: this list is shared reference data,
    // and a stray entry lands in everyone's calendar.
    ...(board?.is_admin ? ([["manage", "Manage", null]] as Array<[FleetTab, string, number | null]>) : []),
  ];

  return (
    <Card padding="lg" className="space-y-3">
      {/* ----------------------------------------------------------- header */}
      {/* One line. The strapline that used to sit under the title explained the
          module to someone who had already opened it, and cost a whole band of
          height above the grid on every visit. */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">Fleet</h2>
          <Badge tone="warn">Beta</Badge>
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

      <FleetToolbar state={state} tabs={tabs} />

      {/* ------------------------------------------------------------ tabs */}
      {/* One panel, re-rendered per tab, rather than four mounted panels with
          three hidden: the calendar alone is ~400 cells, and keeping it mounted
          behind Manage would cost that on every board refresh. */}
      <div role="tabpanel" id="fleet-tabpanel" aria-labelledby={`fleet-tab-${tab}`}>
        {tab === "calendar" ? (
          <CalendarTab state={state} onOpenReservation={setDetail} onManage={() => setTab("manage")} />
        ) : null}

        {tab === "material" ? <MaterialList assets={visibleAssets} /> : null}

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
                current_location: draft.current_location || undefined,
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
