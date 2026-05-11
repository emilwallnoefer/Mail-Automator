"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { InfoTooltip } from "@/components/info-tooltip";
import { WeekStepper } from "@/components/week-stepper";

type Recipient = {
  key: string;
  recipient_name: string;
  company_name: string | null;
  sends_count: number;
  unique_senders: number;
  real_clicks: number;
  bot_clicks: number;
  last_click_at: string | null;
  last_send_at: string;
  send_ids: string[];
};

type OverviewResponse = {
  scope: "week" | "all";
  query: string;
  week_start: string | null;
  recipients: Recipient[];
  totals: {
    mails_sent: number;
    recipients: number;
    real_clicks: number;
    bot_clicks: number;
    truncated?: boolean;
  };
};

type ClickDetail = {
  clicked_at: string;
  is_likely_bot: boolean;
  user_agent: string | null;
};

type SendDetailLink = {
  id: string;
  original_url: string;
  link_label: string | null;
  link_key: string | null;
  real_clicks: number;
  bot_clicks: number;
  last_click_at: string | null;
  clicks: ClickDetail[];
};

type SendDetailResponse = {
  send: {
    id: string;
    recipient_name: string;
    recipient_email: string | null;
    company_name: string | null;
    subject: string;
    mail_type: string;
    language: string | null;
    template_variant: string | null;
    training_type: string | null;
    created_at: string;
  };
  links: SendDetailLink[];
};

type LinkLeaderboardRow = {
  key: string;
  original_url: string;
  label: string | null;
  link_key: string | null;
  sends_count: number;
  real_clicks: number;
  bot_clicks: number;
  last_click_at: string | null;
  first_sent_at: string;
};

type LinkLeaderboardResponse = {
  links: LinkLeaderboardRow[];
  totals: {
    unique_links: number;
    total_link_rows: number;
    real_clicks: number;
    bot_clicks: number;
  };
};

type ViewMode = "by_recipient" | "by_link";

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromDateKey(value: string) {
  const [y, m, d] = value.split("-").map((item) => Number.parseInt(item, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

function getMonday(value?: string) {
  const base = value ? fromDateKey(value) : new Date();
  const day = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - day);
  base.setHours(0, 0, 0, 0);
  return base;
}

function addDays(value: Date, delta: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + delta);
  return next;
}

function fmtAbsolute(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return new Date(iso).toLocaleDateString();
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diffMs < min) return "just now";
  if (diffMs < hour) return `${Math.floor(diffMs / min)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < 30 * day) return `${Math.floor(diffMs / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function pickTrustedHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function StatTile({
  label,
  value,
  hint,
  info,
}: {
  label: string;
  value: string | number;
  hint?: string;
  info?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-300/70">{label}</p>
        {info ? <InfoTooltip label={`About ${label}`}>{info}</InfoTooltip> : null}
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-100">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function MailTrackingPanel() {
  const [view, setView] = useState<ViewMode>("by_recipient");
  const [weekStart, setWeekStart] = useState<string>(toDateKey(getMonday()));
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [linkData, setLinkData] = useState<LinkLeaderboardResponse | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [showBots, setShowBots] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailBySend, setDetailBySend] = useState<Record<string, SendDetailResponse | "loading" | { error: string }>>(
    {},
  );

  const loadOverview = useCallback(
    async (args: { week?: string; query?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (args.query && args.query.trim().length > 0) {
          params.set("q", args.query.trim());
        } else if (args.week) {
          params.set("week", args.week);
        }
        const response = await fetch(`/api/admin/mail-tracking?${params.toString()}`);
        const payload = (await response.json()) as OverviewResponse | { error: string };
        if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load tracking.");
        setData(payload as OverviewResponse);
      } catch (err) {
        setError((err as Error).message || "Failed to load tracking.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadLinks = useCallback(async () => {
    setLinkLoading(true);
    setLinkError(null);
    try {
      const response = await fetch("/api/admin/mail-tracking/links");
      const payload = (await response.json()) as LinkLeaderboardResponse | { error: string };
      if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load links.");
      setLinkData(payload as LinkLeaderboardResponse);
    } catch (err) {
      setLinkError((err as Error).message || "Failed to load links.");
    } finally {
      setLinkLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view !== "by_recipient") return;
    const trimmed = search.trim();
    const handle = setTimeout(() => {
      if (trimmed.length > 0) {
        void loadOverview({ query: trimmed });
      } else {
        void loadOverview({ week: weekStart });
      }
    }, trimmed.length > 0 ? 300 : 0);
    return () => clearTimeout(handle);
  }, [loadOverview, view, weekStart, search]);

  useEffect(() => {
    if (view !== "by_link") return;
    if (linkData || linkLoading) return;
    void loadLinks();
  }, [linkData, linkLoading, loadLinks, view]);

  const weekRangeLabel = useMemo(() => {
    const start = fromDateKey(weekStart);
    const end = addDays(start, 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `${fmt(start)} \u2013 ${fmt(end)}`;
  }, [weekStart]);

  const isSearchMode = search.trim().length > 0;
  const filteredRecipients = data?.recipients ?? [];

  const loadSendDetail = useCallback(async (sendId: string) => {
    setDetailBySend((prev) => ({ ...prev, [sendId]: "loading" }));
    try {
      const response = await fetch(`/api/admin/mail-tracking/${encodeURIComponent(sendId)}`);
      const payload = (await response.json()) as SendDetailResponse | { error: string };
      if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load detail.");
      setDetailBySend((prev) => ({ ...prev, [sendId]: payload as SendDetailResponse }));
    } catch (err) {
      setDetailBySend((prev) => ({ ...prev, [sendId]: { error: (err as Error).message || "Failed to load." } }));
    }
  }, []);

  const toggleRecipient = useCallback(
    (key: string, sendIds: string[]) => {
      setExpanded((prev) => (prev === key ? null : key));
      sendIds.forEach((id) => {
        setDetailBySend((prev) => {
          if (prev[id]) return prev;
          return prev;
        });
        if (!detailBySend[id]) void loadSendDetail(id);
      });
    },
    [detailBySend, loadSendDetail],
  );

  const linkSearch = search.trim().toLowerCase();
  const filteredLinks = useMemo(() => {
    if (!linkData) return [];
    if (!linkSearch) return linkData.links;
    return linkData.links.filter((link) => {
      return (
        (link.label ?? "").toLowerCase().includes(linkSearch) ||
        (link.link_key ?? "").toLowerCase().includes(linkSearch) ||
        link.original_url.toLowerCase().includes(linkSearch)
      );
    });
  }, [linkData, linkSearch]);

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setView("by_recipient")}
            className={`whitespace-nowrap rounded-md px-3 py-1 transition ${
              view === "by_recipient"
                ? "bg-amber-400/15 text-amber-100"
                : "text-slate-300 hover:text-slate-100"
            }`}
            aria-pressed={view === "by_recipient"}
          >
            By recipient
          </button>
          <button
            type="button"
            onClick={() => setView("by_link")}
            className={`whitespace-nowrap rounded-md px-3 py-1 transition ${
              view === "by_link"
                ? "bg-amber-400/15 text-amber-100"
                : "text-slate-300 hover:text-slate-100"
            }`}
            aria-pressed={view === "by_link"}
          >
            By link
          </button>
        </div>

        {view === "by_recipient" && !isSearchMode ? (
          <WeekStepper
            onPrev={() =>
              setWeekStart(toDateKey(addDays(fromDateKey(weekStart), -7)))
            }
            onToday={() => setWeekStart(toDateKey(getMonday()))}
            onNext={() =>
              setWeekStart(toDateKey(addDays(fromDateKey(weekStart), 7)))
            }
          />
        ) : null}

        <div className="relative min-w-[180px] flex-1">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              view === "by_recipient"
                ? "Search recipient, company or email (all time)"
                : "Search link, label or URL"
            }
            className="w-full rounded-lg border border-white/15 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-300/40 focus:outline-none"
          />
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
          <input
            type="checkbox"
            checked={showBots}
            onChange={(event) => setShowBots(event.target.checked)}
            className="accent-amber-300"
          />
          Scanners
          <InfoTooltip label="About scanner clicks" align="end">
            Tracking links rewrite outbound HTML at Gmail draft creation time. Corporate scanners
            (Outlook ATP, Mimecast, Proofpoint, etc.) hit redirect URLs to inspect them — flagged
            as scanner clicks and hidden by default.
          </InfoTooltip>
        </label>
      </div>

      <p className="text-[11px] text-slate-400">
        {view === "by_recipient"
          ? isSearchMode
            ? `All-time search · ${data?.totals.recipients ?? 0} recipient${data?.totals.recipients === 1 ? "" : "s"} matching "${search.trim()}"`
            : weekRangeLabel
          : "All time across every tracked send"}
      </p>

      {(view === "by_recipient" ? error : linkError) ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {view === "by_recipient" ? error : linkError}
        </p>
      ) : null}

      {view === "by_recipient" && isSearchMode && data?.totals.truncated ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Showing the most recent matches. Refine the search to narrow further.
        </p>
      ) : null}

      {view === "by_recipient" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Mails sent"
            value={data?.totals.mails_sent ?? 0}
            hint={isSearchMode ? "Matching search" : "This week"}
            info="Number of Gmail drafts tracked in the current scope."
          />
          <StatTile
            label="Recipients"
            value={data?.totals.recipients ?? 0}
            hint="Distinct"
            info="Distinct recipients — counted by lowercased name + company so capitalisation doesn't split entries."
          />
          <StatTile
            label="Real clicks"
            value={data?.totals.real_clicks ?? 0}
            hint="Humans"
            info="Clicks that did not match the scanner heuristic (corporate ATP, Mimecast, etc.). These are most likely real recipients opening the link."
          />
          <StatTile
            label="Scanner clicks"
            value={data?.totals.bot_clicks ?? 0}
            hint="Bots"
            info="Likely corporate link scanners — Outlook ATP, Mimecast, Proofpoint, etc. Hidden by default, toggle the Scanners checkbox to include."
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Unique links"
            value={linkData?.totals.unique_links ?? 0}
            hint="All time"
            info="Distinct destinations across every tracked send, grouped by link_key when present, otherwise by original URL."
          />
          <StatTile
            label="Total link sends"
            value={linkData?.totals.total_link_rows ?? 0}
            hint="Per email"
            info="Total rows in mail_send_links — each link counted once per email it was inserted into."
          />
          <StatTile
            label="Real clicks"
            value={linkData?.totals.real_clicks ?? 0}
            hint="Humans"
            info="Clicks that did not match the scanner heuristic."
          />
          <StatTile
            label="Scanner clicks"
            value={linkData?.totals.bot_clicks ?? 0}
            hint="Bots"
            info="Likely corporate link scanners — Outlook ATP, Mimecast, Proofpoint, etc."
          />
        </div>
      )}

      {view === "by_recipient" ? (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-300/80">
              <tr>
                <th className="px-3 py-2">Recipient</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2 text-right">Mails</th>
                <th className="px-3 py-2 text-right">Clicks</th>
                <th className="px-3 py-2 text-right">Last click</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-300/80">
                    Loading tracking…
                  </td>
                </tr>
              ) : filteredRecipients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-300/80">
                    {isSearchMode
                      ? "No tracked emails match this search across the full history."
                      : "No tracked emails this week. Tracking activates when a Gmail draft is created from the generator."}
                  </td>
                </tr>
              ) : (
                filteredRecipients.map((recipient) => {
                  const isOpen = expanded === recipient.key;
                  return (
                    <RecipientRow
                      key={recipient.key}
                      recipient={recipient}
                      isOpen={isOpen}
                      onToggle={() => toggleRecipient(recipient.key, recipient.send_ids)}
                      showBots={showBots}
                      detailBySend={detailBySend}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <LinkLeaderboardTable
          rows={filteredLinks}
          loading={linkLoading}
          hasData={Boolean(linkData)}
          showBots={showBots}
        />
      )}

    </div>
  );
}

function RecipientRow({
  recipient,
  isOpen,
  onToggle,
  showBots,
  detailBySend,
}: {
  recipient: Recipient;
  isOpen: boolean;
  onToggle: () => void;
  showBots: boolean;
  detailBySend: Record<string, SendDetailResponse | "loading" | { error: string }>;
}) {
  const visibleClicks = showBots
    ? recipient.real_clicks + recipient.bot_clicks
    : recipient.real_clicks;
  const botSuffix = showBots ? "" : recipient.bot_clicks > 0 ? ` +${recipient.bot_clicks} scanner` : "";

  return (
    <>
      <tr className="border-t border-white/5 align-middle">
        <td className="px-3 py-2">
          <div className="flex flex-col">
            <span className="text-sm text-slate-100">{recipient.recipient_name}</span>
            <span className="text-[10px] text-slate-400">
              {recipient.unique_senders > 1 ? `${recipient.unique_senders} senders` : "1 sender"}
            </span>
          </div>
        </td>
        <td className="px-3 py-2 text-xs text-slate-300">{recipient.company_name ?? "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums">{recipient.sends_count}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          <span className={visibleClicks > 0 ? "text-amber-200" : "text-slate-400"}>
            {visibleClicks}
          </span>
          {botSuffix ? <span className="text-[10px] text-slate-500">{botSuffix}</span> : null}
        </td>
        <td className="px-3 py-2 text-right text-xs text-slate-300" title={fmtAbsolute(recipient.last_click_at)}>
          {fmtRelative(recipient.last_click_at)}
        </td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
            aria-expanded={isOpen}
          >
            {isOpen ? "Hide" : "View sends"}
          </button>
        </td>
      </tr>
      {isOpen ? (
        <tr className="border-t border-white/5 bg-slate-950/40">
          <td colSpan={6} className="px-3 py-3">
            <div className="space-y-3">
              {recipient.send_ids.map((sendId) => {
                const detail = detailBySend[sendId];
                if (!detail) return null;
                if (detail === "loading") {
                  return (
                    <div key={sendId} className="text-xs text-slate-400">
                      Loading send…
                    </div>
                  );
                }
                if ("error" in detail) {
                  return (
                    <div
                      key={sendId}
                      className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
                    >
                      {detail.error}
                    </div>
                  );
                }
                return <SendDetailBlock key={sendId} detail={detail} showBots={showBots} />;
              })}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function SendDetailBlock({ detail, showBots }: { detail: SendDetailResponse; showBots: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-100">{detail.send.subject}</p>
          <p className="text-[11px] text-slate-400">
            {detail.send.mail_type}
            {detail.send.language ? ` · ${detail.send.language}` : ""}
            {detail.send.template_variant ? ` · ${detail.send.template_variant}` : ""}
            {detail.send.training_type ? ` · ${detail.send.training_type}` : ""}
            {detail.send.recipient_email ? ` · ${detail.send.recipient_email}` : ""}
          </p>
        </div>
        <span className="text-[11px] text-slate-300/80" title={fmtAbsolute(detail.send.created_at)}>
          {fmtRelative(detail.send.created_at)}
        </span>
      </div>
      <ClickedLinksList links={detail.links} showBots={showBots} />
    </div>
  );
}

function ClickedLinksList({ links, showBots }: { links: SendDetailLink[]; showBots: boolean }) {
  const [expandedLinkIds, setExpandedLinkIds] = useState<Set<string>>(new Set());
  const clicked = links.filter((link) =>
    showBots ? link.real_clicks + link.bot_clicks > 0 : link.real_clicks > 0,
  );

  if (links.length === 0) {
    return <p className="mt-2 text-xs text-slate-400">No tracked links in this email.</p>;
  }
  if (clicked.length === 0) {
    return (
      <p className="mt-2 text-xs text-slate-400">
        No clicks yet on the {links.length} tracked link{links.length === 1 ? "" : "s"} in this email.
      </p>
    );
  }

  const toggle = (id: string) => {
    setExpandedLinkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ul className="mt-2 space-y-1">
      {clicked.map((link) => {
        const total = showBots ? link.real_clicks + link.bot_clicks : link.real_clicks;
        const botSuffix = showBots || link.bot_clicks === 0 ? "" : ` +${link.bot_clicks} scanner`;
        const visibleClicks = (link.clicks ?? []).filter((click) => showBots || !click.is_likely_bot);
        const isExpanded = expandedLinkIds.has(link.id);
        return (
          <li
            key={link.id}
            className="rounded-lg border border-white/5 bg-slate-950/40"
          >
            <div className="flex items-center justify-between gap-3 px-3 py-1.5">
              <a
                href={link.original_url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-xs text-slate-200 hover:text-amber-200"
                title={link.original_url}
              >
                <span className="font-medium">
                  {link.link_label || link.link_key || pickTrustedHost(link.original_url)}
                </span>
                <span className="ml-2 text-[10px] text-slate-500">{pickTrustedHost(link.original_url)}</span>
              </a>
              <span className="shrink-0 text-right text-xs tabular-nums">
                <span className="text-amber-200">{total}</span>
                {botSuffix ? <span className="text-[10px] text-slate-500">{botSuffix}</span> : null}
              </span>
              <span
                className="shrink-0 text-[11px] text-slate-400"
                title={fmtAbsolute(link.last_click_at)}
              >
                {fmtRelative(link.last_click_at)}
              </span>
              {visibleClicks.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggle(link.id)}
                  className="shrink-0 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-white/10"
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? "Hide timeline" : `Show ${visibleClicks.length} click${visibleClicks.length === 1 ? "" : "s"}`}
                </button>
              ) : null}
            </div>
            {isExpanded && visibleClicks.length > 0 ? (
              <ClickTimeline clicks={visibleClicks} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ClickTimeline({ clicks }: { clicks: ClickDetail[] }) {
  return (
    <ol className="border-t border-white/5 px-3 py-2 text-[11px] text-slate-300">
      {clicks.map((click, idx) => (
        <li
          key={`${click.clicked_at}-${idx}`}
          className="flex items-start gap-2 py-0.5"
        >
          <span className="mt-0.5 inline-flex w-12 shrink-0 justify-end text-slate-500 tabular-nums">
            #{idx + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-slate-100 tabular-nums" title={fmtAbsolute(click.clicked_at)}>
                {fmtAbsolute(click.clicked_at)}
              </span>
              <span className="text-[10px] text-slate-500">
                ({fmtRelative(click.clicked_at)})
              </span>
              {click.is_likely_bot ? (
                <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-300">
                  scanner
                </span>
              ) : (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-200">
                  real click
                </span>
              )}
            </div>
            {click.user_agent ? (
              <p className="mt-0.5 truncate text-[10px] text-slate-500" title={click.user_agent}>
                {click.user_agent}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function LinkLeaderboardTable({
  rows,
  loading,
  hasData,
  showBots,
}: {
  rows: LinkLeaderboardRow[];
  loading: boolean;
  hasData: boolean;
  showBots: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-300/80">
          <tr>
            <th className="px-3 py-2">Link</th>
            <th className="px-3 py-2 text-right">Sent in</th>
            <th className="px-3 py-2 text-right">Clicks</th>
            <th className="px-3 py-2 text-right">CTR</th>
            <th className="px-3 py-2 text-right">Last click</th>
          </tr>
        </thead>
        <tbody>
          {loading && !hasData ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-300/80">
                Loading link leaderboard…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-300/80">
                No tracked links yet. Send a Gmail draft from the generator to start collecting clicks.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const total = showBots ? row.real_clicks + row.bot_clicks : row.real_clicks;
              const botSuffix = showBots || row.bot_clicks === 0 ? "" : ` +${row.bot_clicks} scanner`;
              const ctr = row.sends_count > 0 ? total / row.sends_count : 0;
              const ctrLabel = row.sends_count > 0 ? `${(ctr * 100).toFixed(ctr >= 0.1 ? 0 : 1)}%` : "—";
              const displayLabel = row.label || row.link_key || pickTrustedHost(row.original_url);
              return (
                <tr key={row.key} className="border-t border-white/5 align-middle">
                  <td className="px-3 py-2">
                    <a
                      href={row.original_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block min-w-0"
                      title={row.original_url}
                    >
                      <div className="truncate text-sm text-slate-100 hover:text-amber-200">
                        {displayLabel}
                      </div>
                      <div className="truncate text-[10px] text-slate-500">
                        {row.link_key ? (
                          <span className="mr-2 rounded bg-white/5 px-1 py-0.5 text-[9px] uppercase tracking-wider text-slate-400">
                            {row.link_key}
                          </span>
                        ) : null}
                        {pickTrustedHost(row.original_url)}
                      </div>
                    </a>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                    {row.sends_count}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={total > 0 ? "text-amber-200" : "text-slate-400"}>{total}</span>
                    {botSuffix ? (
                      <span className="ml-1 text-[10px] text-slate-500">{botSuffix}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">{ctrLabel}</td>
                  <td
                    className="px-3 py-2 text-right text-xs text-slate-300"
                    title={fmtAbsolute(row.last_click_at)}
                  >
                    {fmtRelative(row.last_click_at)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
