import type { ReliabilityScore, ReservationStatus } from "@/lib/fleet-rules";

/** Wire types for `/api/fleet`. Mirrors `src/lib/fleet-queries.ts`. */

export type FleetAssetCategory = "drone" | "range_extender" | "gcs" | "accessory" | "other";
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
  holder_name: string | null;
  location_age_days: number | null;
  location_stale: boolean;
};

export type FleetReservation = {
  id: string;
  asset_id: string;
  user_id: string;
  start_week: string;
  end_week: string;
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
};

export type FleetBoardResponse = {
  today: string;
  window_start: string;
  window_weeks: number;
  assets: FleetAsset[];
  reservations: FleetReservation[];
  me: ReliabilityScore & { user_id: string };
  standings: Array<{ user_id: string; name: string; score: ReliabilityScore }>;
  is_admin: boolean;
  /**
   * Set only when the fleet tables are missing and the app is not in production:
   * the board is sample data so the UI can be reviewed before the migration runs.
   */
  demo?: boolean;
};

export const CATEGORY_LABEL: Record<FleetAssetCategory, string> = {
  drone: "Drones",
  range_extender: "Range extenders",
  gcs: "Ground stations",
  accessory: "Accessories",
  other: "Other",
};

export const STATUS_LABEL: Record<FleetAssetStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  out: "Out",
  in_repair: "In repair",
  retired: "Retired",
};
