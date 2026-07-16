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
    version: "2026-07-16-travel-info-diagnostics",
    date: "Jul 16, 2026",
    title: "Travel info now explains itself",
    highlights: [
      "If travel data can't be loaded, the day editor now says why.",
      "Shows the connected Google account and a concrete fix (reconnect, share the sheet, …).",
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
