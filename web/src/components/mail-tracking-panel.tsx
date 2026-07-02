"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { InfoTooltip } from "@/components/info-tooltip";
import { FreshnessPill } from "@/components/freshness-pill";

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
  scope: "week" | "all" | "recent";
  query: string;
  week_start: string | null;
  recipients: Recipient[];
  total?: number;
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

type TimelinePeriod = "day" | "week" | "month" | "year";
type BucketMail = {
  send_id: string;
  recipient_name: string;
  company_name: string | null;
  subject: string;
  real_clicks: number;
  bot_clicks: number;
};
type TimelineBucket = {
  bucket_start: string;
  mails_sent: number;
  real_clicks: number;
  bot_clicks: number;
  mails?: BucketMail[];
};
type TimelineResponse = {
  period: TimelinePeriod;
  anchor: string;
  range_start: string;
  range_end: string;
  buckets: TimelineBucket[];
  totals: {
    mails_sent: number;
    real_clicks: number;
    bot_clicks: number;
  };
};

type LatestClick = {
  id: string;
  clicked_at: string;
  is_likely_bot: boolean;
  user_agent: string | null;
  referer: string | null;
  link: {
    id: string;
    original_url: string;
    link_label: string | null;
    link_key: string | null;
  } | null;
  send: {
    id: string;
    recipient_name: string;
    recipient_email: string | null;
    company_name: string | null;
    subject: string;
    mail_type: string;
  } | null;
};

type LatestClicksResponse = {
  clicks: LatestClick[];
  total: number;
  offset: number;
  limit: number;
  days: number;
  range_start: string;
};

type TopRecipientRow = {
  key: string;
  name: string;
  company: string | null;
  real_clicks: number;
  bot_clicks: number;
  sends_count: number;
};

type TopLinkRow = {
  key: string;
  label: string;
  link_key: string | null;
  original_url: string;
  real_clicks: number;
  bot_clicks: number;
  sends_count: number;
};

type MailTypeRow = {
  mail_type: string;
  sends_count: number;
  real_clicks: number;
  bot_clicks: number;
};

type OverviewStatsResponse = {
  range_start: string;
  range_end: string;
  days: number;
  top_recipients: TopRecipientRow[];
  top_links: TopLinkRow[];
  mail_type_breakdown: MailTypeRow[];
  heatmap: number[][];
  heatmap_bots: number[][];
  totals: {
    sends_count: number;
    real_clicks: number;
    bot_clicks: number;
    sends_truncated: boolean;
  };
};

type SubTab = "overview" | "recipients" | "links" | "latest_clicks";

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATS_RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
];
const DONUT_COLORS = [
  "#fbbf24",
  "#34d399",
  "#60a5fa",
  "#f472b6",
  "#a78bfa",
  "#fb7185",
  "#22d3ee",
  "#facc15",
];

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

function addMonths(value: Date, delta: number) {
  const next = new Date(value);
  next.setMonth(next.getMonth() + delta);
  return next;
}

function addYears(value: Date, delta: number) {
  const next = new Date(value);
  next.setFullYear(next.getFullYear() + delta);
  return next;
}

function startOfPeriod(value: Date, period: TimelinePeriod) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  if (period === "day") return next;
  if (period === "week") return getMonday(toDateKey(next));
  if (period === "month") {
    next.setDate(1);
    return next;
  }
  next.setMonth(0, 1);
  return next;
}

function shiftPeriod(value: string, period: TimelinePeriod, delta: number) {
  const base = fromDateKey(value);
  if (period === "day") return toDateKey(addDays(base, delta));
  if (period === "week") return toDateKey(addDays(base, delta * 7));
  if (period === "month") return toDateKey(addMonths(base, delta));
  return toDateKey(addYears(base, delta));
}

function periodResetLabel(period: TimelinePeriod) {
  if (period === "day") return "Today";
  if (period === "week") return "This week";
  if (period === "month") return "This month";
  return "This year";
}

function formatTimelineRangeLabel(anchor: string, period: TimelinePeriod) {
  const base = fromDateKey(anchor);
  if (period === "day") {
    return base.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  if (period === "week") {
    const start = getMonday(anchor);
    const end = addDays(start, 6);
    const fmt = (value: Date) => value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${fmt(start)} - ${fmt(end)}, ${end.getFullYear()}`;
  }
  if (period === "month") {
    return base.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  return String(base.getFullYear());
}

function formatBucketTick(iso: string, period: TimelinePeriod) {
  const date = new Date(iso);
  if (period === "day") {
    return date.toLocaleTimeString(undefined, { hour: "numeric" });
  }
  if (period === "week") {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }
  if (period === "month") {
    return date.toLocaleDateString(undefined, { day: "numeric" });
  }
  return date.toLocaleDateString(undefined, { month: "short" });
}

function formatBucketFullLabel(iso: string, period: TimelinePeriod) {
  const date = new Date(iso);
  if (period === "day") {
    return date.toLocaleString(undefined, { weekday: "short", hour: "numeric" });
  }
  if (period === "year") {
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function shouldShowBucketTick(index: number, total: number, period: TimelinePeriod) {
  if (period === "week" || period === "year") return true;
  if (period === "day") return index % 3 === 0 || index === total - 1;
  return index === 0 || index === total - 1 || index % 5 === 0;
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

function parseUserAgent(ua: string | null): { label: string; kind: "scanner" | "browser" | "unknown" } {
  if (!ua) return { label: "Unknown client", kind: "unknown" };
  const scanners: Array<[RegExp, string]> = [
    [/mimecast/i, "Mimecast scanner"],
    [/proofpoint|urlisolation/i, "Proofpoint scanner"],
    [/barracuda/i, "Barracuda scanner"],
    [/forcepoint|websense/i, "Forcepoint scanner"],
    [/ironport/i, "Cisco IronPort scanner"],
    [/symantec/i, "Symantec scanner"],
    [/trendmicro/i, "Trend Micro scanner"],
    [/safelinks|atpscan|office365/i, "Microsoft ATP scanner"],
    [/googleimageproxy|ggpht/i, "Gmail image proxy"],
    [/bitdefender/i, "Bitdefender scanner"],
    [/sophos/i, "Sophos scanner"],
    [/(curl|wget|python-requests|httpclient|libwww|go-http|java\/|node-fetch|headlesschrome|phantomjs)/i, "Bot / script"],
  ];
  for (const [regex, label] of scanners) {
    if (regex.test(ua)) return { label, kind: "scanner" };
  }

  let browser = "Browser";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\/|opera/i.test(ua)) browser = "Opera";
  else if (/chrome\//i.test(ua)) browser = "Chrome";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua)) browser = "Safari";

  let os = "";
  if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/windows/i.test(ua)) os = "Windows";
  else if (/linux/i.test(ua)) os = "Linux";

  return { label: os ? `${browser} on ${os}` : browser, kind: "browser" };
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
    <div className="rounded-xl border border-glass/10 bg-glass/5 px-4 py-3">
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-ink-3/70">{label}</p>
        {info ? <InfoTooltip label={`About ${label}`}>{info}</InfoTooltip> : null}
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-ink-4">{hint}</p> : null}
    </div>
  );
}

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

function OverviewTab({ showBots }: { showBots: boolean }) {
  const [timelinePeriod, setTimelinePeriod] = useState<TimelinePeriod>("week");
  const [timelineAnchor, setTimelineAnchor] = useState<string>(toDateKey(startOfPeriod(new Date(), "week")));
  const [timelineData, setTimelineData] = useState<TimelineResponse | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineUpdatedAt, setTimelineUpdatedAt] = useState<number | null>(null);

  const [statsDays, setStatsDays] = useState(90);
  const [stats, setStats] = useState<OverviewStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsUpdatedAt, setStatsUpdatedAt] = useState<number | null>(null);

  const loadTimeline = useCallback(async (period: TimelinePeriod, anchor: string) => {
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const params = new URLSearchParams({ period, anchor });
      const response = await fetch(`/api/admin/mail-tracking/timeline?${params.toString()}`);
      const payload = (await response.json()) as TimelineResponse | { error: string };
      if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load timeline.");
      setTimelineData(payload as TimelineResponse);
      setTimelineUpdatedAt(Date.now());
    } catch (err) {
      setTimelineError((err as Error).message || "Failed to load timeline.");
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  const loadStats = useCallback(async (days: number) => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const params = new URLSearchParams({ days: String(days) });
      const response = await fetch(`/api/admin/mail-tracking/overview-stats?${params.toString()}`);
      const payload = (await response.json()) as OverviewStatsResponse | { error: string };
      if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load stats.");
      setStats(payload as OverviewStatsResponse);
      setStatsUpdatedAt(Date.now());
    } catch (err) {
      setStatsError((err as Error).message || "Failed to load stats.");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTimeline(timelinePeriod, timelineAnchor);
  }, [loadTimeline, timelinePeriod, timelineAnchor]);

  useEffect(() => {
    void loadStats(statsDays);
  }, [loadStats, statsDays]);

  const timelineRangeLabel = useMemo(
    () => formatTimelineRangeLabel(timelineAnchor, timelinePeriod),
    [timelineAnchor, timelinePeriod],
  );

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-xl border border-glass/10 bg-glass/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-ink">Click timeline</h3>
              <InfoTooltip label="About click timeline">
                Aggregated click activity across all tracked emails and links. X is time, Y is clicks.
              </InfoTooltip>
            </div>
            <p className="mt-1 text-xs text-ink-4">{timelineRangeLabel}</p>
            <div className="mt-2">
              <FreshnessPill updatedAt={timelineUpdatedAt} loading={timelineLoading} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex rounded-lg border border-glass/10 bg-overlay/50 p-0.5 text-sm">
              {(["day", "week", "month", "year"] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => {
                    setTimelineAnchor((prev) => toDateKey(startOfPeriod(fromDateKey(prev), period)));
                    setTimelinePeriod(period);
                  }}
                  className={`inline-flex min-h-10 min-w-12 items-center justify-center rounded-md px-4 py-2 transition ${
                    timelinePeriod === period
                      ? "bg-amber-400/15 text-warn"
                      : "text-ink-3 hover:text-ink"
                  }`}
                  aria-pressed={timelinePeriod === period}
                >
                  {period[0].toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>
            <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-glass/15 bg-overlay/50 text-sm">
              <button
                type="button"
                onClick={() => setTimelineAnchor((prev) => shiftPeriod(prev, timelinePeriod, -1))}
                className="inline-flex min-h-10 min-w-10 items-center justify-center px-3 py-2 text-ink-2 transition hover:bg-glass/10"
                aria-label={`Previous ${timelinePeriod}`}
              >
                <span aria-hidden>&larr;</span>
              </button>
              <button
                type="button"
                onClick={() => setTimelineAnchor(toDateKey(startOfPeriod(new Date(), timelinePeriod)))}
                className="inline-flex min-h-10 items-center justify-center border-x border-glass/10 px-4 py-2 text-ink-2 transition hover:bg-glass/10"
              >
                {periodResetLabel(timelinePeriod)}
              </button>
              <button
                type="button"
                onClick={() => setTimelineAnchor((prev) => shiftPeriod(prev, timelinePeriod, 1))}
                className="inline-flex min-h-10 min-w-10 items-center justify-center px-3 py-2 text-ink-2 transition hover:bg-glass/10"
                aria-label={`Next ${timelinePeriod}`}
              >
                <span aria-hidden>&rarr;</span>
              </button>
            </div>
          </div>
        </div>

        {timelineError ? (
          <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-danger">
            {timelineError}
          </p>
        ) : null}

        <MailClickTimelineChart
          data={timelineData}
          loading={timelineLoading}
          period={timelinePeriod}
          showBots={showBots}
        />
      </section>

      <section className="space-y-4 rounded-xl border border-glass/10 bg-glass/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Engagement breakdown</h3>
            <p className="mt-1 text-xs text-ink-4">
              {stats
                ? `Last ${statsDays === 365 ? "year" : `${statsDays} days`} · ${stats.totals.sends_count} sends · ${stats.totals.real_clicks} real, ${stats.totals.bot_clicks} scanner clicks`
                : `Last ${statsDays === 365 ? "year" : `${statsDays} days`}`}
            </p>
            <div className="mt-2">
              <FreshnessPill updatedAt={statsUpdatedAt} loading={statsLoading} />
            </div>
          </div>
          <div className="inline-flex rounded-lg border border-glass/10 bg-overlay/50 p-0.5 text-sm">
            {STATS_RANGE_OPTIONS.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => setStatsDays(option.days)}
                className={`inline-flex min-h-10 min-w-12 items-center justify-center rounded-md px-4 py-2 transition ${
                  statsDays === option.days
                    ? "bg-amber-400/15 text-warn"
                    : "text-ink-3 hover:text-ink"
                }`}
                aria-pressed={statsDays === option.days}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {statsError ? (
          <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-danger">
            {statsError}
          </p>
        ) : null}

        {stats?.totals.sends_truncated ? (
          <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-warn">
            Sends fetch was capped — the breakdowns reflect the most recent slice of this window.
          </p>
        ) : null}

        <HeatmapCard stats={stats} loading={statsLoading} showBots={showBots} />

        <div className="grid gap-4 lg:grid-cols-3">
          <TopRecipientsCard stats={stats} loading={statsLoading} showBots={showBots} />
          <TopLinksCard stats={stats} loading={statsLoading} showBots={showBots} />
          <MailTypeDonutCard stats={stats} loading={statsLoading} showBots={showBots} />
        </div>
      </section>
    </div>
  );
}

const RECIPIENTS_PAGE_SIZE = 10;

function RecipientsTab({ showBots }: { showBots: boolean }) {
  const [search, setSearch] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState<OverviewResponse["totals"] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailBySend, setDetailBySend] = useState<Record<string, SendDetailResponse | "loading" | { error: string }>>(
    {},
  );
  const requestIdRef = useRef(0);
  const loadedCountRef = useRef(0);

  useEffect(() => {
    loadedCountRef.current = recipients.length;
  }, [recipients]);

  // Latest recipients ordered by recency, paged with offset/limit.
  const fetchRecent = useCallback(
    async (opts: { offset: number; limit: number; append: boolean }) => {
      const requestId = ++requestIdRef.current;
      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          mode: "recent",
          offset: String(opts.offset),
          limit: String(opts.limit),
        });
        const response = await fetch(`/api/admin/mail-tracking?${params.toString()}`);
        const payload = (await response.json()) as OverviewResponse | { error: string };
        if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load tracking.");
        if (requestId !== requestIdRef.current) return;
        const data = payload as OverviewResponse;
        setRecipients((prev) => (opts.append ? [...prev, ...data.recipients] : data.recipients));
        setTotal(data.total ?? data.totals.recipients);
        setTotals(data.totals);
        setTruncated(Boolean(data.totals.truncated));
        setUpdatedAt(Date.now());
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError((err as Error).message || "Failed to load tracking.");
      } finally {
        if (requestId !== requestIdRef.current) return;
        if (opts.append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [],
  );

  const fetchSearch = useCallback(async (query: string) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`/api/admin/mail-tracking?${params.toString()}`);
      const payload = (await response.json()) as OverviewResponse | { error: string };
      if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load tracking.");
      if (requestId !== requestIdRef.current) return;
      const data = payload as OverviewResponse;
      setRecipients(data.recipients);
      setTotal(data.totals.recipients);
      setTotals(data.totals);
      setTruncated(Boolean(data.totals.truncated));
      setUpdatedAt(Date.now());
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError((err as Error).message || "Failed to load tracking.");
    } finally {
      if (requestId !== requestIdRef.current) return;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = search.trim();
    const handle = setTimeout(() => {
      if (trimmed.length > 0) void fetchSearch(trimmed);
      else void fetchRecent({ offset: 0, limit: RECIPIENTS_PAGE_SIZE, append: false });
    }, trimmed.length > 0 ? 300 : 0);
    return () => clearTimeout(handle);
  }, [fetchRecent, fetchSearch, search]);

  const isSearchMode = search.trim().length > 0;
  const hasMore = !isSearchMode && recipients.length < total;

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
        if (!detailBySend[id]) void loadSendDetail(id);
      });
    },
    [detailBySend, loadSendDetail],
  );

  const deleteSend = useCallback(
    async (sendId: string) => {
      const response = await fetch(`/api/admin/mail-tracking/${encodeURIComponent(sendId)}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to delete mail generation.");
      // Drop the cached detail and refresh, keeping the same number of rows loaded.
      setDetailBySend((prev) => {
        const next = { ...prev };
        delete next[sendId];
        return next;
      });
      const trimmed = search.trim();
      if (trimmed.length > 0) await fetchSearch(trimmed);
      else
        await fetchRecent({
          offset: 0,
          limit: Math.max(RECIPIENTS_PAGE_SIZE, loadedCountRef.current),
          append: false,
        });
    },
    [fetchRecent, fetchSearch, search],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search recipient, company or email (all time)"
            className="w-full rounded-lg border border-glass/15 bg-panel/60 px-3 py-1.5 text-xs text-ink placeholder:text-ink-5 focus:border-amber-300/40 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ink-4">
          {isSearchMode
            ? `All-time search · ${total} recipient${total === 1 ? "" : "s"} matching "${search.trim()}"`
            : `Latest recipients · showing ${recipients.length} of ${total}`}
        </p>
        <FreshnessPill updatedAt={updatedAt} loading={loading} />
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {truncated ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-warn">
          {isSearchMode
            ? "Showing the most recent matches. Refine the search to narrow further."
            : "Older sends beyond the scan limit aren't paginated. Use search to find a specific recipient."}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="Mails sent"
          value={totals?.mails_sent ?? 0}
          hint={isSearchMode ? "Matching search" : "All time"}
          info="Number of Gmail drafts tracked in the current scope."
        />
        <StatTile
          label="Recipients"
          value={totals?.recipients ?? 0}
          hint="Distinct"
          info="Distinct recipients — counted by lowercased name + company so capitalisation doesn't split entries."
        />
        <StatTile
          label="Real clicks"
          value={totals?.real_clicks ?? 0}
          hint="Humans"
          info="Clicks that did not match the scanner heuristic. These are most likely real recipients opening the link."
        />
        <StatTile
          label="Scanner clicks"
          value={totals?.bot_clicks ?? 0}
          hint="Bots"
          info="Likely corporate link scanners — Outlook ATP, Mimecast, Proofpoint, etc. Hidden unless Scanners is on."
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-glass/10 bg-glass/5">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-glass/5 text-xs uppercase tracking-wider text-ink-3/80">
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
            {loading && recipients.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-ink-3/80">
                  Loading tracking…
                </td>
              </tr>
            ) : recipients.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-ink-3/80">
                  {isSearchMode
                    ? "No tracked emails match this search across the full history."
                    : "No tracked emails yet. Tracking activates when a Gmail draft is created from the generator."}
                </td>
              </tr>
            ) : (
              recipients.map((recipient) => (
                <RecipientRow
                  key={recipient.key}
                  recipient={recipient}
                  isOpen={expanded === recipient.key}
                  onToggle={() => toggleRecipient(recipient.key, recipient.send_ids)}
                  showBots={showBots}
                  detailBySend={detailBySend}
                  onDeleteSend={deleteSend}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() =>
              void fetchRecent({ offset: recipients.length, limit: RECIPIENTS_PAGE_SIZE, append: true })
            }
            disabled={loadingMore}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-glass/15 bg-glass/5 px-4 py-2 text-xs text-ink-2 transition hover:bg-glass/10 disabled:opacity-60"
          >
            {loadingMore
              ? "Loading…"
              : `+${Math.min(RECIPIENTS_PAGE_SIZE, total - recipients.length)} older`}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function LinksTab({ showBots }: { showBots: boolean }) {
  const [search, setSearch] = useState("");
  const [linkData, setLinkData] = useState<LinkLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/mail-tracking/links");
      const payload = (await response.json()) as LinkLeaderboardResponse | { error: string };
      if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load links.");
      setLinkData(payload as LinkLeaderboardResponse);
      setUpdatedAt(Date.now());
    } catch (err) {
      setError((err as Error).message || "Failed to load links.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (linkData || loading) return;
    void load();
  }, [linkData, loading, load]);

  const linkSearch = search.trim().toLowerCase();
  const filteredLinks = useMemo(() => {
    if (!linkData) return [];
    if (!linkSearch) return linkData.links;
    return linkData.links.filter((link) =>
      (link.label ?? "").toLowerCase().includes(linkSearch) ||
      (link.link_key ?? "").toLowerCase().includes(linkSearch) ||
      link.original_url.toLowerCase().includes(linkSearch),
    );
  }, [linkData, linkSearch]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search link, label or URL"
            className="w-full rounded-lg border border-glass/15 bg-panel/60 px-3 py-1.5 text-xs text-ink placeholder:text-ink-5 focus:border-amber-300/40 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-ink-4">All time across every tracked send</p>
        <FreshnessPill updatedAt={updatedAt} loading={loading} />
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

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

      <LinkLeaderboardTable
        rows={filteredLinks}
        loading={loading}
        hasData={Boolean(linkData)}
        showBots={showBots}
      />
    </section>
  );
}

const LATEST_PAGE_SIZE = 10;
const LATEST_RANGE_OPTIONS = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function LatestClicksTab({ showBots }: { showBots: boolean }) {
  const [days, setDays] = useState(7);
  const [clicks, setClicks] = useState<LatestClick[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const requestIdRef = useRef(0);

  const fetchPage = useCallback(
    async (opts: { append: boolean; offset: number }) => {
      const requestId = ++requestIdRef.current;
      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          days: String(days),
          offset: String(opts.offset),
          limit: String(LATEST_PAGE_SIZE),
        });
        if (showBots) params.set("include_bots", "1");
        const response = await fetch(`/api/admin/mail-tracking/clicks?${params.toString()}`);
        const payload = (await response.json()) as LatestClicksResponse | { error: string };
        if (!response.ok) throw new Error((payload as { error: string }).error || "Failed to load clicks.");
        if (requestId !== requestIdRef.current) return;
        const data = payload as LatestClicksResponse;
        setClicks((prev) => (opts.append ? [...prev, ...data.clicks] : data.clicks));
        setTotal(data.total);
        setUpdatedAt(Date.now());
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError((err as Error).message || "Failed to load clicks.");
      } finally {
        if (requestId !== requestIdRef.current) return;
        if (opts.append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [days, showBots],
  );

  useEffect(() => {
    void fetchPage({ append: false, offset: 0 });
  }, [fetchPage]);

  const hasMore = clicks.length < total;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-glass/10 bg-overlay/50 p-0.5 text-sm">
          {LATEST_RANGE_OPTIONS.map((option) => (
            <button
              key={option.days}
              type="button"
              onClick={() => setDays(option.days)}
              className={`inline-flex min-h-10 min-w-12 items-center justify-center rounded-md px-4 py-2 transition ${
                days === option.days
                  ? "bg-amber-400/15 text-warn"
                  : "text-ink-3 hover:text-ink"
              }`}
              aria-pressed={days === option.days}
            >
              {option.label}
            </button>
          ))}
        </div>
        <FreshnessPill updatedAt={updatedAt} loading={loading} />
      </div>

      <p className="text-[11px] text-ink-4">
        Last {days === 1 ? "24 hours" : `${days} days`}
        {showBots ? " · scanners included" : " · scanners hidden"}
        {total > 0 ? ` · ${total} click${total === 1 ? "" : "s"} total` : ""}
      </p>

      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {loading && clicks.length === 0 ? (
        <div className="rounded-xl border border-glass/10 bg-glass/5 px-3 py-10 text-center text-sm text-ink-3/80">
          Loading clicks…
        </div>
      ) : clicks.length === 0 ? (
        <div className="rounded-xl border border-glass/10 bg-glass/5 px-3 py-10 text-center text-sm text-ink-3/80">
          No tracked clicks in the last {days === 1 ? "24 hours" : `${days} days`}.
          {!showBots ? " Toggle Scanners to include corporate link scanners." : ""}
        </div>
      ) : (
        <ul className="space-y-2">
          {clicks.map((click) => (
            <LatestClickCard key={click.id} click={click} />
          ))}
        </ul>
      )}

      {hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void fetchPage({ append: true, offset: clicks.length })}
            disabled={loadingMore}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-glass/15 bg-glass/5 px-4 py-2 text-xs text-ink-2 transition hover:bg-glass/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : `Load ${Math.min(LATEST_PAGE_SIZE, total - clicks.length)} more`}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function LatestClickCard({ click }: { click: LatestClick }) {
  const ua = parseUserAgent(click.user_agent);
  const linkLabel = click.link
    ? click.link.link_label || click.link.link_key || pickTrustedHost(click.link.original_url)
    : "Unknown link";
  const linkHost = click.link ? pickTrustedHost(click.link.original_url) : null;
  const recipient = click.send;

  return (
    <li className="rounded-xl border border-glass/10 bg-glass/5 px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold tabular-nums text-ink" title={fmtAbsolute(click.clicked_at)}>
            {fmtRelative(click.clicked_at)}
          </span>
          <span className="text-[11px] text-ink-5">{fmtAbsolute(click.clicked_at)}</span>
          {click.is_likely_bot ? (
            <span className="rounded bg-neutral/35 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-ink-3">
              scanner
            </span>
          ) : (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-warn">
              real click
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink-3/60">Recipient</p>
          {recipient ? (
            <>
              <p className="truncate text-sm text-ink">{recipient.recipient_name}</p>
              <p className="truncate text-[11px] text-ink-4">
                {recipient.company_name ?? "—"}
                {recipient.recipient_email ? ` · ${recipient.recipient_email}` : ""}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-ink-5" title={recipient.subject}>
                {recipient.mail_type} · {recipient.subject}
              </p>
            </>
          ) : (
            <p className="text-xs text-ink-5">Send no longer available</p>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink-3/60">Link</p>
          {click.link ? (
            <a
              href={click.link.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block min-w-0 text-sm text-ink hover:text-warn"
              title={click.link.original_url}
            >
              <span className="block truncate font-medium">{linkLabel}</span>
              <span className="block truncate text-[11px] text-ink-4">{linkHost}</span>
            </a>
          ) : (
            <p className="text-xs text-ink-5">Link no longer available</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] ${
                ua.kind === "scanner"
                  ? "bg-neutral/35 text-ink-2"
                  : ua.kind === "browser"
                    ? "bg-emerald-500/10 text-positive"
                    : "bg-neutral/25 text-ink-3"
              }`}
              title={click.user_agent ?? "No user agent recorded"}
            >
              {ua.label}
            </span>
            {click.user_agent ? (
              <span className="truncate text-[10px] text-ink-5" title={click.user_agent}>
                {click.user_agent}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

type HoverPos = { x: number; y: number; width: number; content: ReactNode } | null;
const HOUR_GRID_STYLE = { display: "grid", gridTemplateColumns: "repeat(24, minmax(0, 1fr))", gap: "2px" } as const;

function HoverTooltip({ hover }: { hover: HoverPos }) {
  if (!hover) return null;
  const left = Math.min(Math.max(hover.x, 80), Math.max(80, hover.width - 80));
  const top = Math.max(hover.y - 12, 8);
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-glass/15 bg-surface/95 px-3 py-2 text-[11px] leading-tight text-ink shadow-lg backdrop-blur"
      style={{ left, top }}
    >
      {hover.content}
    </div>
  );
}

function HeatmapCard({
  stats,
  loading,
  showBots,
}: {
  stats: OverviewStatsResponse | null;
  loading: boolean;
  showBots: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<HoverPos>(null);

  const grid = useMemo(() => {
    if (!stats) return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    return stats.heatmap.map((row, dow) =>
      row.map((value, hour) => (showBots ? value + (stats.heatmap_bots?.[dow]?.[hour] ?? 0) : value)),
    );
  }, [stats, showBots]);

  const max = useMemo(() => grid.reduce((acc, row) => row.reduce((acc2, v) => Math.max(acc2, v), acc), 0), [grid]);
  const totalClicks = useMemo(() => grid.reduce((acc, row) => acc + row.reduce((a, b) => a + b, 0), 0), [grid]);

  const peak = useMemo(() => {
    let best = { dow: 0, hour: 0, count: 0 };
    grid.forEach((row, dow) => {
      row.forEach((count, hour) => {
        if (count > best.count) best = { dow, hour, count };
      });
    });
    return best;
  }, [grid]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl border border-glass/10 bg-overlay/30 p-3"
      onMouseLeave={() => setHover(null)}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h4 className="text-xs font-semibold text-ink">When do clicks happen?</h4>
          <InfoTooltip label="About click heatmap" align="start">
            Every tracked click bucketed by weekday × local hour. Brighter cells mean more clicks. The fun
            one — tells you whether your recipients are reading during work hours, after dinner, or 2am.
          </InfoTooltip>
        </div>
        <p className="text-[10px] text-ink-4">
          {loading && !stats
            ? "Loading…"
            : totalClicks > 0
              ? `Peak: ${DOW_LABELS[peak.dow]} ${String(peak.hour).padStart(2, "0")}:00 (${peak.count} click${peak.count === 1 ? "" : "s"})`
              : "No clicks in this window yet"}
        </p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto">
        <div className="flex flex-col justify-around pr-1 pt-[18px]">
          {DOW_LABELS.map((label) => (
            <span key={label} className="text-[9px] uppercase tracking-wider text-ink-5">
              {label}
            </span>
          ))}
        </div>
        <div className="min-w-[640px] flex-1">
          <div className="mb-1 text-center" style={HOUR_GRID_STYLE}>
            {Array.from({ length: 24 }, (_, hour) => (
              <span
                key={hour}
                className={`text-[9px] text-ink-5 ${hour % 3 === 0 ? "" : "opacity-0"}`}
              >
                {String(hour).padStart(2, "0")}
              </span>
            ))}
          </div>
          <div className="space-y-[2px]">
            {grid.map((row, dow) => (
              <div key={dow} style={HOUR_GRID_STYLE}>
                {row.map((count, hour) => {
                  const intensity = max > 0 ? count / max : 0;
                  const alpha = count === 0 ? 0.04 : 0.18 + intensity * 0.82;
                  return (
                    <button
                      key={hour}
                      type="button"
                      tabIndex={-1}
                      className="aspect-square min-h-3 rounded-[2px] transition focus:outline-none"
                      style={{ backgroundColor: `rgba(251, 191, 36, ${alpha})` }}
                      onMouseEnter={(event) => {
                        const target = event.currentTarget;
                        const parent = containerRef.current;
                        if (!parent) return;
                        const rect = target.getBoundingClientRect();
                        const parentRect = parent.getBoundingClientRect();
                              const realCount = stats?.heatmap?.[dow]?.[hour] ?? 0;
                        const botCount = stats?.heatmap_bots?.[dow]?.[hour] ?? 0;
                        setHover({
                          x: rect.left - parentRect.left + rect.width / 2,
                          y: rect.top - parentRect.top,
                          width: parentRect.width,
                          content: (
                            <div>
                              <div className="font-semibold text-warn">
                                {DOW_LABELS[dow]} · {String(hour).padStart(2, "0")}:00–{String(hour + 1).padStart(2, "0")}:00
                              </div>
                              <div className="text-ink-2">{realCount} real click{realCount === 1 ? "" : "s"}</div>
                              <div className="text-ink-4">{botCount} scanner</div>
                              <div className="text-ink-5">{count} visible</div>
                            </div>
                          ),
                        });
                      }}
                    >
                      <span className="sr-only">
                        {DOW_LABELS[dow]} {hour}:00 — {count} clicks
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-ink-5">
        Times are the click viewer&apos;s local hour — yours, looking at this dashboard.
      </p>
      <HoverTooltip hover={hover} />
    </div>
  );
}

function TopRecipientsCard({
  stats,
  loading,
  showBots,
}: {
  stats: OverviewStatsResponse | null;
  loading: boolean;
  showBots: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<HoverPos>(null);

  const rows = useMemo(() => stats?.top_recipients ?? [], [stats]);
  const max = useMemo(
    () => rows.reduce((acc, row) => Math.max(acc, showBots ? row.real_clicks + row.bot_clicks : row.real_clicks), 0),
    [rows, showBots],
  );

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl border border-glass/10 bg-overlay/30 p-3"
      onMouseLeave={() => setHover(null)}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <h4 className="text-xs font-semibold text-ink">Top recipients by clicks</h4>
        <InfoTooltip label="About top recipients">
          Recipients ranked by real clicks in the selected window. Hover a bar to see send count and CTR.
        </InfoTooltip>
      </div>

      {loading && !stats ? (
        <p className="py-8 text-center text-xs text-ink-4">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-xs text-ink-4">No tracked recipients yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => {
            const visible = showBots ? row.real_clicks + row.bot_clicks : row.real_clicks;
            const widthPct = max > 0 ? Math.max(2, (visible / max) * 100) : 2;
            const ctr = row.sends_count > 0 ? (visible / row.sends_count) * 100 : 0;
            return (
              <li
                key={row.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                onMouseEnter={(event) => {
                  const parent = containerRef.current;
                  if (!parent) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const parentRect = parent.getBoundingClientRect();
                  setHover({
                    x: rect.left - parentRect.left + rect.width / 2,
                    y: rect.top - parentRect.top,
                    width: parentRect.width,
                    content: (
                      <div className="min-w-[160px]">
                        <div className="font-semibold text-warn">{row.name}</div>
                        {row.company ? <div className="text-ink-3">{row.company}</div> : null}
                        <div className="mt-1 text-ink-2">
                          {row.real_clicks} real · {row.bot_clicks} scanner
                        </div>
                        <div className="text-ink-4">
                          {row.sends_count} mail{row.sends_count === 1 ? "" : "s"} · CTR {ctr.toFixed(ctr >= 10 ? 0 : 1)}%
                        </div>
                      </div>
                    ),
                  });
                }}
              >
                <div className="min-w-0">
                  <div className="truncate text-xs text-ink">{row.name}</div>
                  <div className="relative mt-0.5 h-2 overflow-hidden rounded bg-glass/5">
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-amber-400/80"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-warn">{visible}</span>
              </li>
            );
          })}
        </ul>
      )}
      <HoverTooltip hover={hover} />
    </div>
  );
}

function TopLinksCard({
  stats,
  loading,
  showBots,
}: {
  stats: OverviewStatsResponse | null;
  loading: boolean;
  showBots: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<HoverPos>(null);

  const rows = useMemo(() => stats?.top_links ?? [], [stats]);
  const max = useMemo(
    () => rows.reduce((acc, row) => Math.max(acc, showBots ? row.real_clicks + row.bot_clicks : row.real_clicks), 0),
    [rows, showBots],
  );

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl border border-glass/10 bg-overlay/30 p-3"
      onMouseLeave={() => setHover(null)}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <h4 className="text-xs font-semibold text-ink">Top links by clicks</h4>
        <InfoTooltip label="About top links">
          Links ranked by real clicks. Hover a bar to see the destination, total sends, and click-through rate.
        </InfoTooltip>
      </div>

      {loading && !stats ? (
        <p className="py-8 text-center text-xs text-ink-4">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-xs text-ink-4">No tracked links yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => {
            const visible = showBots ? row.real_clicks + row.bot_clicks : row.real_clicks;
            const widthPct = max > 0 ? Math.max(2, (visible / max) * 100) : 2;
            const ctr = row.sends_count > 0 ? (visible / row.sends_count) * 100 : 0;
            const host = pickTrustedHost(row.original_url);
            return (
              <li
                key={row.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                onMouseEnter={(event) => {
                  const parent = containerRef.current;
                  if (!parent) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const parentRect = parent.getBoundingClientRect();
                  setHover({
                    x: rect.left - parentRect.left + rect.width / 2,
                    y: rect.top - parentRect.top,
                    width: parentRect.width,
                    content: (
                      <div className="min-w-[200px]">
                        <div className="font-semibold text-warn">{row.label}</div>
                        <div className="truncate text-ink-3">{host}</div>
                        <div className="mt-1 text-ink-2">
                          {row.real_clicks} real · {row.bot_clicks} scanner
                        </div>
                        <div className="text-ink-4">
                          {row.sends_count} send{row.sends_count === 1 ? "" : "s"} · CTR {ctr.toFixed(ctr >= 10 ? 0 : 1)}%
                        </div>
                      </div>
                    ),
                  });
                }}
              >
                <div className="min-w-0">
                  <div className="truncate text-xs text-ink">{row.label}</div>
                  <div className="truncate text-[10px] text-ink-5">{host}</div>
                  <div className="relative mt-0.5 h-2 overflow-hidden rounded bg-glass/5">
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-emerald-400/80"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-positive">{visible}</span>
              </li>
            );
          })}
        </ul>
      )}
      <HoverTooltip hover={hover} />
    </div>
  );
}

function MailTypeDonutCard({
  stats,
  loading,
  showBots,
}: {
  stats: OverviewStatsResponse | null;
  loading: boolean;
  showBots: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<HoverPos>(null);

  const rows = useMemo(() => stats?.mail_type_breakdown ?? [], [stats]);
  const total = useMemo(() => rows.reduce((acc, row) => acc + row.sends_count, 0), [rows]);

  const segments = useMemo(() => {
    if (total <= 0) return [] as Array<{ row: MailTypeRow; start: number; end: number; color: string }>;
    let cursor = 0;
    return rows.map((row, idx) => {
      const fraction = row.sends_count / total;
      const start = cursor;
      const end = cursor + fraction;
      cursor = end;
      return { row, start, end, color: DONUT_COLORS[idx % DONUT_COLORS.length] };
    });
  }, [rows, total]);

  const radius = 60;
  const inner = 36;
  const cx = 70;
  const cy = 70;

  function arcPath(start: number, end: number) {
    if (end - start >= 1) {
      return [
        `M ${cx - radius} ${cy}`,
        `A ${radius} ${radius} 0 1 1 ${cx + radius} ${cy}`,
        `A ${radius} ${radius} 0 1 1 ${cx - radius} ${cy}`,
        `M ${cx - inner} ${cy}`,
        `A ${inner} ${inner} 0 1 0 ${cx + inner} ${cy}`,
        `A ${inner} ${inner} 0 1 0 ${cx - inner} ${cy}`,
        "Z",
      ].join(" ");
    }
    const a0 = start * Math.PI * 2 - Math.PI / 2;
    const a1 = end * Math.PI * 2 - Math.PI / 2;
    const large = end - start > 0.5 ? 1 : 0;
    const x0 = cx + Math.cos(a0) * radius;
    const y0 = cy + Math.sin(a0) * radius;
    const x1 = cx + Math.cos(a1) * radius;
    const y1 = cy + Math.sin(a1) * radius;
    const xi0 = cx + Math.cos(a0) * inner;
    const yi0 = cy + Math.sin(a0) * inner;
    const xi1 = cx + Math.cos(a1) * inner;
    const yi1 = cy + Math.sin(a1) * inner;
    return [
      `M ${x0} ${y0}`,
      `A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`,
      `L ${xi1} ${yi1}`,
      `A ${inner} ${inner} 0 ${large} 0 ${xi0} ${yi0}`,
      "Z",
    ].join(" ");
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl border border-glass/10 bg-overlay/30 p-3"
      onMouseLeave={() => setHover(null)}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <h4 className="text-xs font-semibold text-ink">Mail type mix</h4>
        <InfoTooltip label="About mail type donut">
          Distribution of tracked sends by mail_type. Hover a segment for send count, real and scanner clicks.
        </InfoTooltip>
      </div>

      {loading && !stats ? (
        <p className="py-8 text-center text-xs text-ink-4">Loading…</p>
      ) : total === 0 ? (
        <p className="py-8 text-center text-xs text-ink-4">No sends in this window yet.</p>
      ) : (
        <div className="flex gap-3">
          <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0">
            {segments.map((segment, idx) => (
              <path
                key={`${segment.row.mail_type}-${idx}`}
                d={arcPath(segment.start, segment.end)}
                fill={segment.color}
                opacity={0.85}
                className="transition hover:opacity-100"
                onMouseEnter={(event) => {
                  const parent = containerRef.current;
                  if (!parent) return;
                  const rect = (event.currentTarget as SVGPathElement).getBoundingClientRect();
                  const parentRect = parent.getBoundingClientRect();
                  const visibleClicks = showBots
                    ? segment.row.real_clicks + segment.row.bot_clicks
                    : segment.row.real_clicks;
                  const ctr = segment.row.sends_count > 0 ? (visibleClicks / segment.row.sends_count) * 100 : 0;
                  setHover({
                    x: rect.left - parentRect.left + rect.width / 2,
                    y: rect.top - parentRect.top,
                    width: parentRect.width,
                    content: (
                      <div className="min-w-[180px]">
                        <div className="font-semibold" style={{ color: segment.color }}>
                          {segment.row.mail_type}
                        </div>
                        <div className="text-ink-2">
                          {segment.row.sends_count} send{segment.row.sends_count === 1 ? "" : "s"} ({((segment.end - segment.start) * 100).toFixed(1)}%)
                        </div>
                        <div className="text-ink-3">{segment.row.real_clicks} real clicks</div>
                        <div className="text-ink-4">{segment.row.bot_clicks} scanner</div>
                        <div className="text-ink-4">CTR {ctr.toFixed(ctr >= 10 ? 0 : 1)}%</div>
                      </div>
                    ),
                  });
                }}
              />
            ))}
            <text x={cx} y={cy - 4} textAnchor="middle" className="fill-slate-100 text-[14px] font-semibold">
              {total}
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" className="fill-slate-400 text-[8px] uppercase tracking-wider">
              sends
            </text>
          </svg>
          <ul className="min-w-0 flex-1 space-y-1 self-center">
            {segments.map((segment, idx) => (
              <li key={`${segment.row.mail_type}-legend-${idx}`} className="flex items-center gap-2 text-[11px]">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="min-w-0 flex-1 truncate text-ink-2">{segment.row.mail_type}</span>
                <span className="shrink-0 tabular-nums text-ink-4">{segment.row.sends_count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <HoverTooltip hover={hover} />
    </div>
  );
}

function MailClickTimelineChart({
  data,
  loading,
  period,
  showBots,
}: {
  data: TimelineResponse | null;
  loading: boolean;
  period: TimelinePeriod;
  showBots: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number; w: number; h: number } | null>(null);

  const handlePointer = useCallback((index: number, event: { clientX: number; clientY: number }) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({
      index,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      w: rect.width,
      h: rect.height,
    });
  }, []);

  if (loading && !data) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-glass/10 bg-overlay/40 text-sm text-ink-3/80">
        Loading click timeline...
      </div>
    );
  }

  const buckets = data?.buckets ?? [];
  if (buckets.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-glass/10 bg-overlay/40 px-6 text-center text-sm text-ink-3/80">
        No tracked click activity yet for this period.
      </div>
    );
  }

  const width = 920;
  const height = 288;
  const marginTop = 16;
  const marginRight = 18;
  const marginBottom = 42;
  const marginLeft = 42;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;
  const gap = Math.max(2, Math.floor(plotWidth / Math.max(1, buckets.length * 5)));
  const barWidth = Math.max(6, (plotWidth - gap * (buckets.length - 1)) / buckets.length);
  const maxVisible = Math.max(
    1,
    ...buckets.map((bucket) => (showBots ? bucket.real_clicks + bucket.bot_clicks : bucket.real_clicks)),
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile
          label="Visible clicks"
          value={showBots ? (data?.totals.real_clicks ?? 0) + (data?.totals.bot_clicks ?? 0) : data?.totals.real_clicks ?? 0}
          hint={showBots ? "Real + scanners" : "Real only"}
        />
        <StatTile label="Mails sent" value={data?.totals.mails_sent ?? 0} hint="Same period" />
        <StatTile label="Scanner clicks" value={data?.totals.bot_clicks ?? 0} hint="Hidden unless enabled" />
      </div>

      <div ref={containerRef} className="relative">
      <div
        className="overflow-x-auto rounded-xl border border-glass/10 bg-overlay/40 p-3"
        onMouseLeave={() => setHover(null)}
      >
        <div className="min-w-[720px]">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Mail click timeline chart">
            {Array.from({ length: 4 }, (_, index) => {
              const value = Math.round((maxVisible * (4 - index)) / 4);
              const y = marginTop + (plotHeight * index) / 4;
              return (
                <g key={`gridline-${index}-${value}`}>
                  <line
                    x1={marginLeft}
                    x2={width - marginRight}
                    y1={y}
                    y2={y}
                    className="stroke-glass/10"
                    strokeWidth="1"
                  />
                  <text x={marginLeft - 8} y={y + 4} textAnchor="end" className="fill-ink-5 text-[10px]">
                    {value}
                  </text>
                </g>
              );
            })}

            {buckets.map((bucket, index) => {
              const x = marginLeft + index * (barWidth + gap);
              const realHeight = (plotHeight * bucket.real_clicks) / maxVisible;
              const botHeight = showBots ? (plotHeight * bucket.bot_clicks) / maxVisible : 0;
              const totalHeight = realHeight + botHeight;
              const y = marginTop + plotHeight - totalHeight;
              const realY = marginTop + plotHeight - realHeight;
              const label = formatBucketTick(bucket.bucket_start, period);
              const isHovered = hover?.index === index;
              // Full-height transparent hit area so the whole column is hoverable,
              // not just the (often short) bar itself.
              const hitX = marginLeft + index * (barWidth + gap) - gap / 2;
              const hitWidth = barWidth + gap;
              return (
                <g key={bucket.bucket_start}>
                  {isHovered ? (
                    <rect
                      x={hitX}
                      y={marginTop}
                      width={hitWidth}
                      height={plotHeight}
                      className="fill-white/5"
                    />
                  ) : null}
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(totalHeight, 2)}
                    rx="4"
                    className="fill-amber-500/25"
                  />
                  <rect
                    x={x}
                    y={realY}
                    width={barWidth}
                    height={Math.max(realHeight, 2)}
                    rx="4"
                    className="fill-amber-300"
                  />
                  {showBots && bucket.bot_clicks > 0 ? (
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={Math.max(botHeight, 2)}
                      rx="4"
                      className="fill-ink-5/80"
                    />
                  ) : null}
                  {shouldShowBucketTick(index, buckets.length, period) ? (
                    <text
                      x={x + barWidth / 2}
                      y={height - 14}
                      textAnchor="middle"
                      className="fill-ink-5 text-[10px]"
                    >
                      {label}
                    </text>
                  ) : null}
                  <rect
                    x={hitX}
                    y={marginTop}
                    width={hitWidth}
                    height={plotHeight}
                    className="cursor-pointer fill-transparent"
                    onMouseEnter={(event) => handlePointer(index, event)}
                    onMouseMove={(event) => handlePointer(index, event)}
                  />
                </g>
              );
            })}

            <line
              x1={marginLeft}
              x2={width - marginRight}
              y1={marginTop + plotHeight}
              y2={marginTop + plotHeight}
              className="stroke-glass/15"
              strokeWidth="1"
            />
          </svg>
        </div>
      </div>
        {hover && buckets[hover.index] ? (
          <TimelineTooltip
            bucket={buckets[hover.index]}
            period={period}
            showBots={showBots}
            x={hover.x}
            y={hover.y}
            containerWidth={hover.w}
            containerHeight={hover.h}
          />
        ) : null}
      </div>

      <p className="text-[11px] text-ink-4">
        X-axis: time. Y-axis: clicks from all tracked emails and links. Amber shows real clicks; gray adds scanner clicks when enabled. Hover a column to see which mails the clicks came from.
      </p>
    </div>
  );
}

function TimelineTooltip({
  bucket,
  period,
  showBots,
  x,
  y,
  containerWidth,
  containerHeight,
}: {
  bucket: TimelineBucket;
  period: TimelinePeriod;
  showBots: boolean;
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
}) {
  const visibleClicks = showBots ? bucket.real_clicks + bucket.bot_clicks : bucket.real_clicks;
  const mails = (bucket.mails ?? []).filter((mail) =>
    showBots ? mail.real_clicks + mail.bot_clicks > 0 : mail.real_clicks > 0,
  );

  // Flip horizontally past the midpoint, and place above the pointer when it is
  // in the lower half — keeps the card inside the chart area.
  const alignRight = x > containerWidth / 2;
  const placeAbove = y > containerHeight / 2;
  const style: CSSProperties = {
    left: alignRight ? undefined : x + 12,
    right: alignRight ? containerWidth - x + 12 : undefined,
    top: placeAbove ? undefined : y + 12,
    bottom: placeAbove ? containerHeight - y + 12 : undefined,
  };

  return (
    <div
      className="pointer-events-none absolute z-20 w-64 rounded-lg border border-glass/15 bg-surface/95 p-3 text-xs shadow-xl shadow-shade/40"
      style={style}
    >
      <p className="font-semibold text-ink">{formatBucketFullLabel(bucket.bucket_start, period)}</p>
      <p className="mt-0.5 text-[11px] text-ink-4">
        <span className="text-warn">{visibleClicks}</span> {showBots ? "click" : "real click"}
        {visibleClicks === 1 ? "" : "s"}
        {!showBots && bucket.bot_clicks > 0 ? (
          <span className="text-ink-5"> · +{bucket.bot_clicks} scanner</span>
        ) : null}
        <span className="text-ink-5"> · {bucket.mails_sent} sent</span>
      </p>
      {mails.length > 0 ? (
        <ul className="mt-2 space-y-1.5 border-t border-glass/10 pt-2">
          {mails.map((mail) => {
            const mailClicks = showBots ? mail.real_clicks + mail.bot_clicks : mail.real_clicks;
            return (
              <li key={mail.send_id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-ink">{mail.recipient_name}</p>
                  <p className="truncate text-[10px] text-ink-5">
                    {mail.company_name ? `${mail.company_name} · ` : ""}
                    {mail.subject}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums text-warn">{mailClicks}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 border-t border-glass/10 pt-2 text-[11px] text-ink-5">
          {visibleClicks > 0
            ? "Click sources unavailable for this bucket."
            : "No clicks in this period."}
        </p>
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
  onDeleteSend,
}: {
  recipient: Recipient;
  isOpen: boolean;
  onToggle: () => void;
  showBots: boolean;
  detailBySend: Record<string, SendDetailResponse | "loading" | { error: string }>;
  onDeleteSend: (sendId: string) => Promise<void>;
}) {
  const visibleClicks = showBots
    ? recipient.real_clicks + recipient.bot_clicks
    : recipient.real_clicks;
  const botSuffix = showBots ? "" : recipient.bot_clicks > 0 ? ` +${recipient.bot_clicks} scanner` : "";

  return (
    <>
      <tr className="border-t border-glass/5 align-middle">
        <td className="px-3 py-2">
          <div className="flex flex-col">
            <span className="text-sm text-ink">{recipient.recipient_name}</span>
            <span className="text-[10px] text-ink-4">
              {recipient.unique_senders > 1 ? `${recipient.unique_senders} senders` : "1 sender"}
            </span>
          </div>
        </td>
        <td className="px-3 py-2 text-xs text-ink-3">{recipient.company_name ?? "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums">{recipient.sends_count}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          <span className={visibleClicks > 0 ? "text-warn" : "text-ink-4"}>
            {visibleClicks}
          </span>
          {botSuffix ? <span className="text-[10px] text-ink-5">{botSuffix}</span> : null}
        </td>
        <td className="px-3 py-2 text-right text-xs text-ink-3" title={fmtAbsolute(recipient.last_click_at)}>
          {fmtRelative(recipient.last_click_at)}
        </td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg border border-glass/20 bg-glass/10 px-2 py-1 text-xs hover:bg-glass/15"
            aria-expanded={isOpen}
          >
            {isOpen ? "Hide" : "View sends"}
          </button>
        </td>
      </tr>
      {isOpen ? (
        <tr className="border-t border-glass/5 bg-overlay/40">
          <td colSpan={6} className="px-3 py-3">
            <div className="space-y-3">
              {recipient.send_ids.map((sendId) => {
                const detail = detailBySend[sendId];
                if (!detail) return null;
                if (detail === "loading") {
                  return (
                    <div key={sendId} className="text-xs text-ink-4">
                      Loading send…
                    </div>
                  );
                }
                if ("error" in detail) {
                  return (
                    <div
                      key={sendId}
                      className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-danger"
                    >
                      {detail.error}
                    </div>
                  );
                }
                return (
                  <SendDetailBlock
                    key={sendId}
                    detail={detail}
                    showBots={showBots}
                    onDeleteSend={onDeleteSend}
                  />
                );
              })}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function SendDetailBlock({
  detail,
  showBots,
  onDeleteSend,
}: {
  detail: SendDetailResponse;
  showBots: boolean;
  onDeleteSend: (sendId: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteSend(detail.send.id);
      // On success this block unmounts as the list refreshes; no further state.
    } catch (err) {
      setDeleteError((err as Error).message || "Failed to delete.");
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="rounded-xl border border-glass/10 bg-glass/5 px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{detail.send.subject}</p>
          <p className="text-[11px] text-ink-4">
            {detail.send.mail_type}
            {detail.send.language ? ` · ${detail.send.language}` : ""}
            {detail.send.template_variant ? ` · ${detail.send.template_variant}` : ""}
            {detail.send.training_type ? ` · ${detail.send.training_type}` : ""}
            {detail.send.recipient_email ? ` · ${detail.send.recipient_email}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-ink-3/80" title={fmtAbsolute(detail.send.created_at)}>
            {fmtRelative(detail.send.created_at)}
          </span>
          {confirming ? (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded border border-rose-400/40 bg-rose-500/20 px-2 py-1 text-[11px] font-medium text-danger hover:bg-rose-500/30 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Confirm delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="rounded border border-glass/15 bg-glass/5 px-2 py-1 text-[11px] text-ink-3 hover:bg-glass/10 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded border border-glass/15 bg-glass/5 px-2 py-1 text-[11px] text-ink-4 hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-danger"
              title="Delete this mail generation and its tracking data"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {confirming && !deleting ? (
        <p className="mt-2 text-[11px] text-danger/80">
          This permanently removes this mail generation and all of its click tracking. This cannot be undone.
        </p>
      ) : null}
      {deleteError ? (
        <p className="mt-2 rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[11px] text-danger">
          {deleteError}
        </p>
      ) : null}
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
    return <p className="mt-2 text-xs text-ink-4">No tracked links in this email.</p>;
  }
  if (clicked.length === 0) {
    return (
      <p className="mt-2 text-xs text-ink-4">
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
            className="rounded-lg border border-glass/5 bg-overlay/40"
          >
            <div className="flex items-center justify-between gap-3 px-3 py-1.5">
              <a
                href={link.original_url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-xs text-ink-2 hover:text-warn"
                title={link.original_url}
              >
                <span className="font-medium">
                  {link.link_label || link.link_key || pickTrustedHost(link.original_url)}
                </span>
                <span className="ml-2 text-[10px] text-ink-5">{pickTrustedHost(link.original_url)}</span>
              </a>
              <span className="shrink-0 text-right text-xs tabular-nums">
                <span className="text-warn">{total}</span>
                {botSuffix ? <span className="text-[10px] text-ink-5">{botSuffix}</span> : null}
              </span>
              <span
                className="shrink-0 text-[11px] text-ink-4"
                title={fmtAbsolute(link.last_click_at)}
              >
                {fmtRelative(link.last_click_at)}
              </span>
              {visibleClicks.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggle(link.id)}
                  className="shrink-0 rounded border border-glass/15 bg-glass/5 px-1.5 py-0.5 text-[10px] text-ink-3 hover:bg-glass/10"
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
    <ol className="border-t border-glass/5 px-3 py-2 text-[11px] text-ink-3">
      {clicks.map((click, idx) => (
        <li
          key={`${click.clicked_at}-${idx}`}
          className="flex items-start gap-2 py-0.5"
        >
          <span className="mt-0.5 inline-flex w-12 shrink-0 justify-end text-ink-5 tabular-nums">
            #{idx + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-ink tabular-nums" title={fmtAbsolute(click.clicked_at)}>
                {fmtAbsolute(click.clicked_at)}
              </span>
              <span className="text-[10px] text-ink-5">
                ({fmtRelative(click.clicked_at)})
              </span>
              {click.is_likely_bot ? (
                <span className="rounded bg-neutral/35 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-ink-3">
                  scanner
                </span>
              ) : (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-warn">
                  real click
                </span>
              )}
            </div>
            {click.user_agent ? (
              <p className="mt-0.5 truncate text-[10px] text-ink-5" title={click.user_agent}>
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
    <div className="overflow-x-auto rounded-xl border border-glass/10 bg-glass/5">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-glass/5 text-xs uppercase tracking-wider text-ink-3/80">
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
              <td colSpan={5} className="px-3 py-6 text-center text-sm text-ink-3/80">
                Loading link leaderboard…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-sm text-ink-3/80">
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
                <tr key={row.key} className="border-t border-glass/5 align-middle">
                  <td className="px-3 py-2">
                    <a
                      href={row.original_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block min-w-0"
                      title={row.original_url}
                    >
                      <div className="truncate text-sm text-ink hover:text-warn">
                        {displayLabel}
                      </div>
                      <div className="truncate text-[10px] text-ink-5">
                        {row.link_key ? (
                          <span className="mr-2 rounded bg-glass/5 px-1 py-0.5 text-[9px] uppercase tracking-wider text-ink-4">
                            {row.link_key}
                          </span>
                        ) : null}
                        {pickTrustedHost(row.original_url)}
                      </div>
                    </a>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-3">
                    {row.sends_count}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={total > 0 ? "text-warn" : "text-ink-4"}>{total}</span>
                    {botSuffix ? (
                      <span className="ml-1 text-[10px] text-ink-5">{botSuffix}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-3">{ctrLabel}</td>
                  <td
                    className="px-3 py-2 text-right text-xs text-ink-3"
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
