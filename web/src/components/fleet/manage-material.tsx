"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Input, Notice, Select } from "@/components/ui";
import { AssetIcon } from "./asset-icon";
import { EmptyState, Row, SectionHeading } from "./ui";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  categoryRank,
  STATUS_LABEL,
  type FleetArchivedAsset,
  type FleetAsset,
  type FleetAssetCategory,
  type FleetAssetStatus,
} from "./types";

/**
 * Admin-only fleet configuration: add material, edit it, remove it.
 *
 * Removal is soft — the unit leaves the calendar and every list, but its rows,
 * its movement history and its bookings survive, and it can be restored from
 * the same screen. A hard delete would cascade the history away, and "this left
 * the fleet" is not "this never existed".
 */

type Draft = {
  name: string;
  serial_number: string;
  category: FleetAssetCategory;
  model: string;
  owner_group: string;
  pooled: boolean;
  current_holder_label: string;
  home_location: string;
  notes: string;
};

const EMPTY: Draft = {
  name: "",
  serial_number: "",
  category: "drone",
  model: "",
  owner_group: "EMEA",
  pooled: true,
  current_holder_label: "",
  home_location: "EMEA",
  notes: "",
};

export function ManageMaterial({
  assets,
  archived,
  unclaimed,
  busy,
  onCreate,
  onUpdate,
  onArchive,
  remindersEnabled,
  onSetReminders,
  standings,
}: {
  assets: FleetAsset[];
  archived: FleetArchivedAsset[];
  /** Holder names from the old sheet that nobody has claimed yet. */
  unclaimed: Array<{ label: string; count: number; live: number }>;
  busy: boolean;
  onCreate: (draft: Draft) => Promise<boolean>;
  onUpdate: (assetId: string, patch: Partial<Draft> & { status?: FleetAssetStatus }) => void;
  onArchive: (assetId: string, archivedFlag: boolean) => void;
  /** Whether return reminders are being sent at all. */
  remindersEnabled: boolean;
  onSetReminders: (enabled: boolean) => void;
  /** The reliability leaderboard, rendered here so it stays an admin view. */
  standings: React.ReactNode;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Draft> & { status?: FleetAssetStatus }>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const map = new Map<FleetAssetCategory, FleetAsset[]>();
    for (const a of assets) {
      if (
        needle &&
        ![a.name, a.serial_number, a.model, a.current_holder_label]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(needle))
      ) {
        continue;
      }
      const list = map.get(a.category) ?? [];
      list.push(a);
      map.set(a.category, list);
    }
    return [...map.entries()].sort((a, b) => categoryRank(a[0]) - categoryRank(b[0]));
  }, [assets, search]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-ink-4">
        The fleet list is shared reference data — anything here shows up in everyone&apos;s calendar. Removing a unit
        keeps its history and can be undone below.
      </p>

      {/* ------------------------------------------------------- reminders */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-glass/10 bg-glass/[0.04] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink">
            Return reminders {remindersEnabled ? "are on" : "are paused"}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-5">
            {remindersEnabled
              ? "Holders are emailed the day before material is due, on the day, and while it is overdue."
              : "Nothing is emailed. Turn this on once the fleet and its bookings are trusted."}
          </p>
        </div>
        <Button
          size="xs"
          variant={remindersEnabled ? "glass-quiet" : "accent"}
          disabled={busy}
          onClick={() => onSetReminders(!remindersEnabled)}
        >
          {remindersEnabled ? "Pause reminders" : "Turn reminders on"}
        </Button>
      </div>

      {/* ------------------------------------------------------------- add */}
      {adding ? (
        <div className="rounded-xl border border-accent/30 bg-accent-deep/10 p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-[11px] text-ink-4">
              Name / unit id
              <Input
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="SVA-412"
                className="text-xs"
              />
            </label>
            <label className="grid gap-1 text-[11px] text-ink-4">
              Type
              <Select
                value={draft.category}
                onChange={(e) => set("category", e.target.value as FleetAssetCategory)}
                className="px-2 py-2 text-xs text-ink"
              >
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-[11px] text-ink-4">
              Serial (optional)
              <Input
                value={draft.serial_number}
                onChange={(e) => set("serial_number", e.target.value)}
                placeholder="E300SA23200412"
                className="text-xs"
              />
            </label>
            <label className="grid gap-1 text-[11px] text-ink-4">
              Model (optional)
              <Input
                value={draft.model}
                onChange={(e) => set("model", e.target.value)}
                placeholder="Elios 3"
                className="text-xs"
              />
            </label>
            <label className="grid gap-1 text-[11px] text-ink-4">
              Home location
              <Input
                value={draft.home_location}
                onChange={(e) => set("home_location", e.target.value)}
                className="text-xs"
              />
            </label>
            <label className="grid gap-1 text-[11px] text-ink-4">
              Owner group
              <Input
                value={draft.owner_group}
                onChange={(e) => set("owner_group", e.target.value)}
                className="text-xs"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-ink-3">
              <input
                type="checkbox"
                checked={draft.pooled}
                onChange={(e) => set("pooled", e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-accent"
              />
              Bookable by everyone (shows in the calendar)
            </label>
            {/* Sized by the wrapper: `Input`'s base carries `w-full`, and
                `cn()` has no tailwind-merge, so a `w-56` here would not
                replace it — both would apply and `w-full` would win. */}
            {!draft.pooled ? (
              <div className="w-56">
                <Input
                  value={draft.current_holder_label}
                  onChange={(e) => set("current_holder_label", e.target.value)}
                  placeholder="Assigned to (name)"
                  className="text-xs"
                  aria-label="Assigned to"
                />
              </div>
            ) : null}
          </div>

          <Input
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Notes (optional)"
            className="mt-2 text-xs"
            aria-label="Notes"
          />

          {!draft.pooled && !draft.current_holder_label.trim() ? (
            <p className="mt-2 text-[11px] text-warn">
              An assigned unit needs a holder name, or nobody will know who has it.
            </p>
          ) : null}

          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="accent"
              disabled={busy || !draft.name.trim() || (!draft.pooled && !draft.current_holder_label.trim())}
              onClick={async () => {
                if (await onCreate(draft)) {
                  setDraft(EMPTY);
                  setAdding(false);
                }
              }}
            >
              {busy ? "Adding…" : "Add material"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDraft(EMPTY); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="accent" onClick={() => setAdding(true)}>
            + Add material
          </Button>
          <div className="w-64 min-w-0">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the fleet…"
              className="px-2 py-1.5 text-xs"
              aria-label="Search material"
            />
          </div>
          <span className="text-[11px] text-ink-5">{assets.length} active</span>
        </div>
      )}

      {/* ------------------------------------------------------------ list */}
      {grouped.map(([category, list]) => (
        <section key={category} className="space-y-1.5">
          <SectionHeading
            icon={<AssetIcon category={category} className="h-3.5 w-3.5 shrink-0" />}
            count={list.length}
          >
            {CATEGORY_LABEL[category]}
          </SectionHeading>
          <ul className="space-y-1.5">
            {list.map((asset) => (
              <li key={asset.id}>
                <Row>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <AssetIcon category={asset.category} className="h-4 w-4 shrink-0 text-ink-4" />
                      <span className="text-xs font-medium text-ink">{asset.name}</span>
                      <Badge tone={asset.pooled ? "positive" : "neutral"}>
                        {asset.pooled ? "Bookable" : "Assigned"}
                      </Badge>
                      <Badge tone="neutral">{STATUS_LABEL[asset.status]}</Badge>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-ink-5">
                      {asset.serial_number ? `${asset.serial_number} · ` : ""}
                      {asset.model ?? "—"}
                      {asset.current_holder_label ? ` · with ${asset.current_holder_label}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      size="xs"
                      variant="glass-quiet"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(editingId === asset.id ? null : asset.id);
                        setEdit({
                          name: asset.name,
                          serial_number: asset.serial_number ?? "",
                          model: asset.model ?? "",
                          category: asset.category,
                          pooled: asset.pooled,
                          current_holder_label: asset.current_holder_label ?? "",
                          home_location: asset.home_location ?? "",
                          status: asset.status,
                        });
                      }}
                    >
                      Edit
                    </Button>
                    {confirmId === asset.id ? (
                      <>
                        <Button
                          size="xs"
                          variant="danger"
                          disabled={busy}
                          onClick={() => {
                            onArchive(asset.id, true);
                            setConfirmId(null);
                          }}
                        >
                          Remove
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setConfirmId(null)}>
                          Keep
                        </Button>
                      </>
                    ) : (
                      <Button size="xs" variant="ghost" disabled={busy} onClick={() => setConfirmId(asset.id)}>
                        Remove
                      </Button>
                    )}
                  </div>
                </div>

                {editingId === asset.id ? (
                  <div className="mt-2 space-y-2 border-t border-glass/10 pt-2">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Input
                        value={edit.name ?? ""}
                        onChange={(e) => setEdit((v) => ({ ...v, name: e.target.value }))}
                        className="text-xs"
                        aria-label="Name"
                        placeholder="Name"
                      />
                      <Input
                        value={edit.serial_number ?? ""}
                        onChange={(e) => setEdit((v) => ({ ...v, serial_number: e.target.value }))}
                        className="text-xs"
                        aria-label="Serial"
                        placeholder="Serial"
                      />
                      <Input
                        value={edit.model ?? ""}
                        onChange={(e) => setEdit((v) => ({ ...v, model: e.target.value }))}
                        className="text-xs"
                        aria-label="Model"
                        placeholder="Model"
                      />
                      <Select
                        value={edit.category ?? asset.category}
                        onChange={(e) => setEdit((v) => ({ ...v, category: e.target.value as FleetAssetCategory }))}
                        className="px-2 py-2 text-xs text-ink"
                        aria-label="Type"
                      >
                        {CATEGORY_ORDER.map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABEL[c]}
                          </option>
                        ))}
                      </Select>
                      {/* Status lives here, and only here: retiring a unit or
                          marking it in repair is an edit like any other. The
                          screen used to tell admins to call the API by hand. */}
                      <Select
                        value={edit.status ?? asset.status}
                        onChange={(e) => setEdit((v) => ({ ...v, status: e.target.value as FleetAssetStatus }))}
                        className="px-2 py-2 text-xs text-ink"
                        aria-label="Status"
                      >
                        {(Object.keys(STATUS_LABEL) as FleetAssetStatus[]).map((st) => (
                          <option key={st} value={st}>
                            {STATUS_LABEL[st]}
                          </option>
                        ))}
                      </Select>
                      <Input
                        value={edit.home_location ?? ""}
                        onChange={(e) => setEdit((v) => ({ ...v, home_location: e.target.value }))}
                        className="text-xs"
                        aria-label="Home location"
                        placeholder="Home location"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 text-xs text-ink-3">
                        <input
                          type="checkbox"
                          checked={edit.pooled ?? asset.pooled}
                          onChange={(e) => setEdit((v) => ({ ...v, pooled: e.target.checked }))}
                          className="h-3.5 w-3.5 cursor-pointer accent-accent"
                        />
                        Bookable by everyone
                      </label>
                      {!(edit.pooled ?? asset.pooled) ? (
                        <div className="w-56">
                          <Input
                            value={edit.current_holder_label ?? ""}
                            onChange={(e) => setEdit((v) => ({ ...v, current_holder_label: e.target.value }))}
                            placeholder="Assigned to (name)"
                            className="text-xs"
                            aria-label="Assigned to"
                          />
                        </div>
                      ) : null}
                      <Button
                        size="xs"
                        variant="accent"
                        disabled={busy}
                        onClick={() => {
                          onUpdate(asset.id, edit);
                          setEditingId(null);
                        }}
                      >
                        Save
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
                </Row>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {grouped.length === 0 ? (
        <EmptyState
          title={assets.length === 0 ? "No material yet" : "Nothing matches that search"}
          hint={
            assets.length === 0
              ? "Add the fleet here — everything you add becomes bookable in the calendar for everyone."
              : "Try a different name, serial or model."
          }
          action={
            assets.length === 0 && !adding ? (
              <Button size="xs" variant="accent" onClick={() => setAdding(true)}>
                Add the first unit
              </Button>
            ) : null
          }
        />
      ) : null}

      {/* ------------------------------------------------------- unclaimed */}
      {unclaimed.length > 0 ? (
        <section className="space-y-1.5 border-t border-glass/10 pt-4">
          <SectionHeading count={unclaimed.length}>Unclaimed names</SectionHeading>
          <p className="text-[11px] leading-relaxed text-ink-5">
            Material from the old sheet is filed under these names, and nobody has taken them yet. Until someone
            does, that material has no owner to remind and no score to move. Each person is offered their name once,
            when they first open Fleet.
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {unclaimed.map((h) => (
              <li
                key={h.label}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-warn"
              >
                <span className="font-medium">{h.label}</span>
                <span className="opacity-75">
                  {h.live > 0 ? `${h.live} out now · ` : ""}
                  {h.count} total
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ------------------------------------------------------- standings */}
      <section className="space-y-1.5 border-t border-glass/10 pt-4">
        <SectionHeading>Reliability standings</SectionHeading>
        {standings}
      </section>

      {/* -------------------------------------------------------- archived */}
      {archived.length > 0 ? (
        <section className="space-y-1.5 border-t border-glass/10 pt-4">
          <SectionHeading count={archived.length}>Removed from the fleet</SectionHeading>
          <Notice tone="neutral">
            Removed units keep their bookings and movement history. Restoring one puts it straight back in the
            calendar.
          </Notice>
          <ul className="space-y-1.5">
            {archived.map((asset) => (
              <li
                key={asset.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-glass/10 bg-glass/[0.02] px-3 py-2 opacity-70"
              >
                <span className="flex items-center gap-1.5">
                  <AssetIcon category={asset.category} className="h-4 w-4 shrink-0 text-ink-5" />
                  <span className="text-xs text-ink-3">{asset.name}</span>
                  <span className="text-[11px] text-ink-5">
                    {asset.serial_number ?? asset.model ?? CATEGORY_LABEL[asset.category]}
                  </span>
                </span>
                <Button size="xs" variant="glass-quiet" disabled={busy} onClick={() => onArchive(asset.id, false)}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
