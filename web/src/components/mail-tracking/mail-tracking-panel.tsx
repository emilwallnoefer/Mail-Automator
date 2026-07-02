"use client";

import { useState } from "react";
import { InfoTooltip } from "@/components/info-tooltip";
import { OverviewTab } from "./tabs/overview-tab";
import { RecipientsTab } from "./tabs/recipients-tab";
import { LinksTab } from "./tabs/links-tab";
import { LatestClicksTab } from "./tabs/latest-clicks-tab";
import type { SubTab } from "./types";

const SUB_TABS: Array<{ id: SubTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "recipients", label: "Recipients" },
  { id: "links", label: "Links" },
  { id: "latest_clicks", label: "Latest clicks" },
];

export function MailTrackingPanel() {
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [showBots, setShowBots] = useState(false);

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="inline-flex flex-wrap rounded-lg border border-glass/10 bg-glass/5 p-0.5 text-sm"
          role="tablist"
          aria-label="Mail tracking views"
        >
          {SUB_TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={subTab === entry.id}
              onClick={() => setSubTab(entry.id)}
              className={`inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-md px-4 py-2 transition ${
                subTab === entry.id
                  ? "bg-amber-400/15 text-warn"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-glass/10 bg-glass/5 px-3 py-1.5 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={showBots}
            onChange={(event) => setShowBots(event.target.checked)}
            className="accent-amber-300"
          />
          Scanners
          <InfoTooltip label="About scanner clicks" align="end">
            Corporate scanners (Outlook ATP, Mimecast, Proofpoint, etc.) hit redirect URLs to inspect
            them — flagged as scanner clicks and hidden by default across every view here.
          </InfoTooltip>
        </label>
      </div>

      {subTab === "overview" ? <OverviewTab showBots={showBots} /> : null}
      {subTab === "recipients" ? <RecipientsTab showBots={showBots} /> : null}
      {subTab === "links" ? <LinksTab showBots={showBots} /> : null}
      {subTab === "latest_clicks" ? <LatestClicksTab showBots={showBots} /> : null}
    </div>
  );
}
