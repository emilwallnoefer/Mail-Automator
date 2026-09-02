import type { ReliabilityScore, ReservationSource, ReservationStatus } from "@/lib/fleet-rules";

/** Wire types for `/api/fleet`. Mirrors `src/lib/fleet-queries.ts`. */

export type FleetAssetCategory =
  | "drone"
  | "lidar"
  | "rad_payload"
  | "ut_payload"
  | "lel_payload"
  | "dummy_drone"
  | "tether"
  | "range_extender"
  | "gcs"
  | "accessory"
  | "other";
export type FleetAssetStatus = "available" | "reserved" | "out" | "in_repair" | "retired";

export type FleetAsset = {
  id: string;
  serial_number: string | null;
  name: string;
  category: FleetAssetCategory;
  model: string | null;
  owner_group: string | null;
  status: FleetAssetStatus;
  home_location: string | null;
  current_location: string | null;
  current_holder_user_id: string | null;
  current_holder_label: string | null;
  location_confirmed_at: string | null;
  notes: string | null;
  active: boolean;
  /** True when the unit is part of the shared bookable pool (and so, the calendar). */
  pooled: boolean;
  holder_name: string | null;
  location_age_days: number | null;
  location_stale: boolean;
};

export type FleetReservation = {
  id: string;
  asset_id: string;
  /** Null while the booking is filed under a name with no account behind it. */
  user_id: string | null;
  holder_label: string | null;
  source: ReservationSource;
  start_date: string;
  end_date: string;
  status: ReservationStatus;
  purpose: string | null;
  destination: string | null;
  picked_up_at: string | null;
  returned_at: string | null;
  returned_on: string | null;
  created_at: string;
  holder_name: string;
  is_mine: boolean;
  due_date: string;
  days_overdue: number;
  queue_position: number | null;
  /** No account behind this booking yet. */
  unclaimed: boolean;
  /** Carried over from the spreadsheet: provisional, and excluded from scoring. */
  imported: boolean;
};

export type FleetBoardResponse = {
  today: string;
  window_start: string;
  window_days: number;
  assets: FleetAsset[];
  reservations: FleetReservation[];
  me: ReliabilityScore & { user_id: string };
  standings: Array<{ user_id: string; name: string; score: ReliabilityScore }>;
  /** Holder names with live bookings and no account behind them. */
  unclaimed_holders: Array<{ label: string; count: number; mine: boolean }>;
  /** Whether return reminders are currently being sent at all. */
  reminders_enabled: boolean;
  /** Units removed from the fleet. Admin-only, so the Manage tab can restore one. */
  archived_assets: FleetAsset[];
  is_admin: boolean;
  /**
   * Set only when the fleet tables are missing and the app is not in production:
   * the board is sample data so the UI can be reviewed before the migration runs.
   */
  demo?: boolean;
};

export const CATEGORY_LABEL: Record<FleetAssetCategory, string> = {
  drone: "Drone fleet",
  lidar: "LiDAR Rev 7",
  rad_payload: "RAD payloads",
  ut_payload: "UT payloads",
  lel_payload: "LEL payloads",
  dummy_drone: "Dummy drones",
  tether: "Tethers",
  range_extender: "Range extenders",
  gcs: "Ground stations",
  accessory: "Accessories",
  other: "Other",
};

/**
 * Display order for category groups — the order the fleet sheet uses, which is
 * how people already think about the kit. Alphabetical would put "Dummy drones"
 * above the actual drone fleet.
 */
export const CATEGORY_ORDER: FleetAssetCategory[] = [
  "drone",
  "lidar",
  "rad_payload",
  "ut_payload",
  "lel_payload",
  "dummy_drone",
  "tether",
  "range_extender",
  "gcs",
  "accessory",
  "other",
];

/** Sort key for a category, for grouping lists and the calendar. */
export function categoryRank(category: FleetAssetCategory): number {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

export const STATUS_LABEL: Record<FleetAssetStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  out: "Out",
  in_repair: "In repair",
  retired: "Retired",
};
