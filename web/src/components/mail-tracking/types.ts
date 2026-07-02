export type Recipient = {
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

export type OverviewResponse = {
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

export type ClickDetail = {
  clicked_at: string;
  is_likely_bot: boolean;
  user_agent: string | null;
};

export type SendDetailLink = {
  id: string;
  original_url: string;
  link_label: string | null;
  link_key: string | null;
  real_clicks: number;
  bot_clicks: number;
  last_click_at: string | null;
  clicks: ClickDetail[];
};

export type SendDetailResponse = {
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

export type LinkLeaderboardRow = {
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

export type LinkLeaderboardResponse = {
  links: LinkLeaderboardRow[];
  totals: {
    unique_links: number;
    total_link_rows: number;
    real_clicks: number;
    bot_clicks: number;
  };
};

export type TimelinePeriod = "day" | "week" | "month" | "year";
export type BucketMail = {
  send_id: string;
  recipient_name: string;
  company_name: string | null;
  subject: string;
  real_clicks: number;
  bot_clicks: number;
};
export type TimelineBucket = {
  bucket_start: string;
  mails_sent: number;
  real_clicks: number;
  bot_clicks: number;
  mails?: BucketMail[];
};
export type TimelineResponse = {
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

export type LatestClick = {
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

export type LatestClicksResponse = {
  clicks: LatestClick[];
  total: number;
  offset: number;
  limit: number;
  days: number;
  range_start: string;
};

export type TopRecipientRow = {
  key: string;
  name: string;
  company: string | null;
  real_clicks: number;
  bot_clicks: number;
  sends_count: number;
};

export type TopLinkRow = {
  key: string;
  label: string;
  link_key: string | null;
  original_url: string;
  real_clicks: number;
  bot_clicks: number;
  sends_count: number;
};

export type MailTypeRow = {
  mail_type: string;
  sends_count: number;
  real_clicks: number;
  bot_clicks: number;
};

export type OverviewStatsResponse = {
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

export type SubTab = "overview" | "recipients" | "links" | "latest_clicks";

export const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const STATS_RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
];
export const DONUT_COLORS = [
  "#fbbf24",
  "#34d399",
  "#60a5fa",
  "#f472b6",
  "#a78bfa",
  "#fb7185",
  "#22d3ee",
  "#facc15",
];
