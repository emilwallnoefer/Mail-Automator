"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Input } from "@/components/ui";
import { AssetIcon } from "./asset-icon";
import { EmptyState, Row, SectionHeading } from "./ui";
import {
  CATEGORY_LABEL,
  categoryRank,
  STATUS_LABEL,
  type FleetAsset,
  type FleetAssetCategory,
} from "./types";

/**
 * Where everything is — the register, not the calendar.
 *
 * This screen exists because the old sheet's locations went stale invisibly:
 * a cell said "EMEA" and nobody could tell whether that was checked yesterday
 * or eighteen months ago. So every unit here states its location AND how long
 * it has been since a person last confirmed it, and confirming is one click.
 */
export function MaterialList({
  assets,
  busy,
  onConfirm,
  onMove,
}: {
  assets: FleetAsset[];
  busy: boolean;
  onConfirm: (assetId: string) => void;
  onMove: (assetId: string, location: string) => void;
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

  if (assets.length === 0) {
    return (
      <EmptyState
        title="No material matches this filter"
        hint="Clear the search or pick a different type above to see the rest of the fleet."
      />
    );
  }

  return (
    <div className="space-y-5">
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
                        <Badge tone={statusTone(asset.status)}>{STATUS_LABEL[asset.status]}</Badge>
                        {!asset.pooled ? (
                          <Badge tone="neutral" title="Fixed assignment — not in the bookable pool">
                            Assigned
                          </Badge>
                        ) : null}
                      </div>

                      {/* Identity line: only the parts that exist, so a unit
                          with no serial does not print a lonely em dash. */}
                      <p className="mt-1 truncate text-[11px] text-ink-5">
                        {[asset.serial_number, asset.model, asset.owner_group]
                          .filter(Boolean)
                          .join(" · ") || "No serial or model recorded"}
                      </p>

                      {/* Location line. The freshness dot carries the answer to
                          "can I trust this?" before any of the words are read. */}
                      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-4">
                        <FreshnessDot stale={asset.location_stale} days={asset.location_age_days} />
                        <span className="text-ink-3">{asset.current_location ?? "Location unknown"}</span>
                        {asset.holder_name ? <span>· with {asset.holder_name}</span> : null}
                        <span className={asset.location_stale ? "text-warn" : undefined}>
                          ·{" "}
                          {asset.location_age_days == null
                            ? "never confirmed"
                            : asset.location_age_days === 0
                              ? "confirmed today"
                              : `confirmed ${asset.location_age_days}d ago`}
                        </span>
                      </p>

                      {asset.notes ? (
                        <p className="mt-1 text-[11px] text-ink-5">{asset.notes}</p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="xs"
                        variant={asset.location_stale ? "accent" : "glass-quiet"}
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
                        aria-expanded={movingId === asset.id}
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
                    <div className="mt-2 flex gap-1.5 border-t border-glass/10 pt-2">
                      <Input
                        value={moveTo}
                        autoFocus
                        onChange={(event) => setMoveTo(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setMovingId(null);
                          if (event.key === "Enter" && moveTo.trim()) {
                            onMove(asset.id, moveTo.trim());
                            setMovingId(null);
                          }
                        }}
                        placeholder="Where is it now?"
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
                      <Button size="xs" variant="ghost" onClick={() => setMovingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                </Row>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * How trustworthy this unit's recorded location is, as a single dot.
 *
 * Amber means the confirmation has aged past the point the server still treats
 * as trustworthy; the tooltip spells out the number behind it.
 */
function FreshnessDot({ stale, days }: { stale: boolean; days: number | null }) {
  return (
    <span
      aria-hidden
      title={
        days == null
          ? "Nobody has confirmed this location"
          : `Location confirmed ${days} day${days === 1 ? "" : "s"} ago`
      }
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
        stale || days == null ? "bg-amber-400" : "bg-emerald-400"
      }`}
    />
  );
}

export function statusTone(status: FleetAsset["status"]) {
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
