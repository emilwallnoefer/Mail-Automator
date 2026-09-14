"use client";

import { useMemo } from "react";
import { holderRgb } from "@/lib/fleet-rules";
import { AssetIcon } from "./asset-icon";
import { EmptyState, SectionHeading } from "./ui";
import {
  CATEGORY_LABEL,
  categoryRank,
  STATUS_LABEL,
  type FleetAsset,
  type FleetAssetCategory,
} from "./types";

/**
 * Every unit in the fleet, and who has it.
 *
 * A register you read, not a screen you operate: one tile per unit, grouped by
 * kind, each carrying the colour of the person holding it — the same colour
 * that person has in the calendar, so "where is everything" and "who has what"
 * are answered by the same glance in both places.
 *
 * Deliberately says nothing about how recently a location was confirmed. That
 * used to be a dot, an age in days and an "It's here" button on every row, on
 * the theory that locations rot in the open. In practice an admin sets a
 * location once in Manage and it stays true, so all that machinery was three
 * pieces of chrome per unit reporting on a problem nobody had.
 */
export function MaterialList({ assets }: { assets: FleetAsset[] }) {
  const grouped = useMemo(() => {
    const map = new Map<FleetAssetCategory, FleetAsset[]>();
    for (const asset of assets) {
      const list = map.get(asset.category) ?? [];
      list.push(asset);
      map.set(asset.category, list);
    }
    // Held units first inside a group: the ones that are out are the ones you
    // are looking for. Then by name, so the order is stable between renders.
    for (const list of map.values()) {
      list.sort((a, b) => {
        const held = Number(Boolean(b.holder_name)) - Number(Boolean(a.holder_name));
        return held !== 0 ? held : a.name.localeCompare(b.name);
      });
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
        <section key={category} className="space-y-2">
          <SectionHeading
            icon={<AssetIcon category={category} className="h-3.5 w-3.5 shrink-0" />}
            count={list.length}
          >
            {CATEGORY_LABEL[category]}
          </SectionHeading>

          <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((asset) => (
              <li key={asset.id}>
                <AssetTile asset={asset} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * One unit.
 *
 * The holder's colour is the tile's left edge rather than a background wash:
 * at three columns a dozen tinted panels turn into a quilt, and the edge still
 * lets you pick out one person's kit by running your eye down the column.
 */
function AssetTile({ asset }: { asset: FleetAsset }) {
  const holder = asset.holder_name;
  const rgb = holder ? holderRgb(holder) : null;

  return (
    <div className="flex h-full overflow-hidden rounded-lg border border-glass/10 bg-glass/[0.04] transition ease-fluid hover:border-glass/20 hover:bg-glass/[0.06]">
      <span
        aria-hidden
        className="w-1 shrink-0"
        style={{ backgroundColor: rgb ? `rgb(${rgb} / 0.85)` : "rgb(148 163 184 / 0.25)" }}
      />

      <div className="min-w-0 flex-1 px-2.5 py-2">
        <div className="flex items-start gap-1.5">
          <AssetIcon category={asset.category} className="mt-px h-4 w-4 shrink-0 text-ink-4" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{asset.name}</span>
          <StatusMark asset={asset} />
        </div>

        {/* Identity, only the parts that exist — a unit with no serial should
            not print a lonely em dash where its number would be. */}
        <p className="mt-1 truncate pl-[1.375rem] text-[11px] text-ink-5">
          {[asset.model, asset.serial_number].filter(Boolean).join(" · ") || "No model or serial recorded"}
        </p>

        <p className="mt-1 flex items-center gap-1.5 truncate pl-[1.375rem] text-[11px]">
          <span className="truncate text-ink-3">{asset.current_location ?? "Location unknown"}</span>
          {holder ? (
            <>
              <span className="text-ink-5">·</span>
              <span className="inline-flex min-w-0 items-center gap-1">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: `rgb(${rgb} / 0.9)` }}
                />
                <span className="truncate text-ink-3">{holder}</span>
              </span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

/**
 * The state of a unit, when it has one worth saying.
 *
 * "Available" is the default for most of the fleet, and a badge on every second
 * tile saying so is noise — the absence of a mark carries it. Only the states
 * that change what you can do with the unit get drawn.
 */
function StatusMark({ asset }: { asset: FleetAsset }) {
  const marks: Array<{ label: string; className: string; title?: string }> = [];

  if (asset.status === "out") {
    marks.push({ label: "Out", className: "bg-accent-deep/25 text-accent-soft" });
  } else if (asset.status === "in_repair") {
    marks.push({ label: "Repair", className: "bg-amber-500/15 text-warn" });
  } else if (asset.status === "retired") {
    marks.push({ label: "Retired", className: "bg-rose-500/15 text-danger" });
  } else if (asset.status === "reserved") {
    marks.push({ label: "Booked", className: "bg-glass/15 text-ink-4" });
  }

  if (!asset.pooled) {
    marks.push({
      label: "Assigned",
      className: "bg-glass/15 text-ink-4",
      title: "Fixed assignment — not in the bookable pool",
    });
  }

  if (marks.length === 0) return null;

  return (
    <span className="flex shrink-0 gap-1">
      {marks.map((mark) => (
        <span
          key={mark.label}
          title={mark.title ?? STATUS_LABEL[asset.status]}
          className={`rounded px-1.5 py-px text-[11px] leading-[1.4] ${mark.className}`}
        >
          {mark.label}
        </span>
      ))}
    </span>
  );
}
