/**
 * Curated, human-readable release notes shown in the dashboard "What's new"
 * popup. Returning users see the latest entry once per version; the popup is
 * keyed by `version` in localStorage, so bumping `version` is what re-triggers
 * it. Brand-new users never see it (the first-launch prompt covers them).
 *
 * Newest first — the first entry is treated as the current release. Keep
 * `highlights` short (a few words each); this is a glance, not a changelog.
 */
export type ReleaseNote = {
  /** Stable id for this release; bump it to re-show the popup. */
  version: string;
  /** Human date for the header. */
  date: string;
  /** One short headline. */
  title: string;
  /** A few words per change. */
  highlights: string[];
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "2026-07-17-ui-polish",
    date: "Jul 17, 2026",
    title: "Snappier, cleaner interface",
    highlights: [
      "Modules open noticeably faster, with a crisper shared motion curve across buttons and cards.",
      "The navigation menu now pops in smoothly, with a sharper menu icon.",
      "Smooth scrolling, a proper “page not found” screen, and a keyboard skip-to-content link.",
      "Small copy and icon cleanups throughout the dashboard.",
    ],
  },
  {
    version: "2026-07-16-travel-personal-columns",
    date: "Jul 16, 2026",
    title: "Travel info: set your own columns",
    highlights: [
      "The travel sheet has one column group per person, so travel info now needs your personal columns.",
      "Settings → Travel mapping: enter your name's column and the two right of it, save — it applies immediately.",
      "Until then, the day editor shows exactly what's missing.",
    ],
  },
  {
    version: "2026-07-16-travel-mapping-reset",
    date: "Jul 16, 2026",
    title: "Travel mapping: reset & clearer diagnostics",
    highlights: [
      "Settings → Travel mapping has a “Reset to defaults” button — clears your personal mapping (never touches the Google Sheet).",
      "The travel debug box now shows exactly which columns, range, and tab your account reads.",
    ],
  },
  {
    version: "2026-07-16-day-card-fade-in",
    date: "Jul 16, 2026",
    title: "Smoother week open",
    highlights: [
      "Day cards now fade in and drop into place when the Time Tracker opens.",
    ],
  },
  {
    version: "2026-07-16-travel-info-diagnostics",
    date: "Jul 16, 2026",
    title: "Travel info now explains itself",
    highlights: [
      "If travel data can't be loaded, the day editor now says why.",
      "Shows the connected Google account and a concrete fix (reconnect, share the sheet, …).",
    ],
  },
  {
    version: "2026-07-16-public-holiday-day-type",
    date: "Jul 16, 2026",
    title: "New day type: Public Holiday",
    highlights: [
      "The Day Logger now has four day types: Normal, Vacation, Public Holiday, and Sick leave.",
      "“Holiday” is now called Vacation — existing entries keep working as before.",
      "Both Vacation and Public Holiday are excused from your target; hours logged count as overtime.",
    ],
  },
  {
    version: "2026-07-16-composer-mode-switch",
    date: "Jul 16, 2026",
    title: "Mail mode switch, right in the composer",
    highlights: [
      "Switch between Guided and AI brief at the top of the Mail Composer.",
      "The old Settings → Mail generation page is gone — one less detour.",
      "Your choice still saves to your account, like before.",
    ],
  },
  {
    version: "2026-07-02-security-events",
    date: "Jul 2, 2026",
    title: "Security event log & breach alerts",
    highlights: [
      "New Admin → Security tab logs blocked admin-access attempts and other security events.",
      "Admins get an email when someone repeatedly probes admin-only areas.",
      "Toggle the alerts and tune the threshold right from the Security tab.",
    ],
  },
  {
    version: "2026-07-02-chat-unread",
    date: "Jul 2, 2026",
    title: "Team chat: unread badge + popup fix",
    highlights: [
      "A red badge on the chat button now also counts messages received while you were away.",
      "The chat button no longer covers this popup — it moves out of the way.",
    ],
  },
  {
    version: "2026-07-02-ui-polish",
    date: "Jul 2, 2026",
    title: "A faster, more consistent interface",
    highlights: [
      "Keyboard focus is now clearly visible on every button and field.",
      "Ambient underwater motion pauses if your system prefers reduced motion.",
      "Settings and Admin load on demand — the dashboard starts lighter.",
      "Small labels are slightly larger and spacing is more uniform throughout.",
    ],
  },
  {
    version: "2026-07-01-admin",
    date: "Jul 1, 2026",
    title: "Admin panel, reorganised",
    highlights: [
      "New left-nav layout matching Settings — one section per job.",
      "Overview adds a mail click-through stat; Users & roles gains search.",
      "Reminder controls and the Mail brief model moved to clearer homes.",
      "New Audit log: who changed roles, paused reminders, or switched the model.",
    ],
  },
  {
    version: "2026-07-01",
    date: "Jul 1, 2026",
    title: "New: AI brief mode for emails",
    highlights: [
      "Settings → Mail generation: switch the composer to AI brief mode.",
      "Write a short brief; Claude drafts the email in your voice.",
      "After generating, “Edit assets” to add/remove links without re-running the AI.",
      "Asset links stay exact and click-tracked. Guided mode unchanged.",
    ],
  },
  {
    version: "2026-06-30",
    date: "Jun 30, 2026",
    title: "Post-training Add-ons + refreshed resources",
    highlights: [
      "New “Add on’s” section: paste a link to the collected flight data.",
      "Cleaner after-training asset titles and descriptions (EN/DE/FR).",
    ],
  },
  {
    version: "2026-06-25",
    date: "Jun 25, 2026",
    title: "Cleaner compensation copy",
    highlights: [
      "Time Tracker “Copy Text” now copies plain date / travel / hours lines.",
    ],
  },
];

/** The current release — what the "What's new" popup describes. */
export const LATEST_RELEASE: ReleaseNote = RELEASE_NOTES[0];
