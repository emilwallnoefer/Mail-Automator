// Thin re-export shim: the Time Tracker panel now lives in ./time-tracker/*.
// Kept here so existing importers (dashboard-shell, admin-panel, dashboard page)
// don't need to change their import paths.
export { TimeTrackerPanel } from "./time-tracker/time-tracker-panel";
export type { WeekResponse } from "./time-tracker/types";
