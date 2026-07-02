import type { TimelinePeriod } from "./types";

export function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromDateKey(value: string) {
  const [y, m, d] = value.split("-").map((item) => Number.parseInt(item, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

export function getMonday(value?: string) {
  const base = value ? fromDateKey(value) : new Date();
  const day = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - day);
  base.setHours(0, 0, 0, 0);
  return base;
}

export function addDays(value: Date, delta: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + delta);
  return next;
}

export function addMonths(value: Date, delta: number) {
  const next = new Date(value);
  next.setMonth(next.getMonth() + delta);
  return next;
}

export function addYears(value: Date, delta: number) {
  const next = new Date(value);
  next.setFullYear(next.getFullYear() + delta);
  return next;
}

export function startOfPeriod(value: Date, period: TimelinePeriod) {
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

export function shiftPeriod(value: string, period: TimelinePeriod, delta: number) {
  const base = fromDateKey(value);
  if (period === "day") return toDateKey(addDays(base, delta));
  if (period === "week") return toDateKey(addDays(base, delta * 7));
  if (period === "month") return toDateKey(addMonths(base, delta));
  return toDateKey(addYears(base, delta));
}

export function periodResetLabel(period: TimelinePeriod) {
  if (period === "day") return "Today";
  if (period === "week") return "This week";
  if (period === "month") return "This month";
  return "This year";
}

export function formatTimelineRangeLabel(anchor: string, period: TimelinePeriod) {
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

export function formatBucketTick(iso: string, period: TimelinePeriod) {
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

export function formatBucketFullLabel(iso: string, period: TimelinePeriod) {
  const date = new Date(iso);
  if (period === "day") {
    return date.toLocaleString(undefined, { weekday: "short", hour: "numeric" });
  }
  if (period === "year") {
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function shouldShowBucketTick(index: number, total: number, period: TimelinePeriod) {
  if (period === "week" || period === "year") return true;
  if (period === "day") return index % 3 === 0 || index === total - 1;
  return index === 0 || index === total - 1 || index % 5 === 0;
}

export function fmtAbsolute(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function fmtRelative(iso: string | null): string {
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

export function pickTrustedHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function parseUserAgent(ua: string | null): { label: string; kind: "scanner" | "browser" | "unknown" } {
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
