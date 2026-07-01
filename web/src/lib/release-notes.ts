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
    version: "2026-07-01",
    date: "Jul 1, 2026",
    title: "New: AI brief mode for emails",
    highlights: [
      "Settings → Mail generation: switch the composer to AI brief mode.",
      "Write a short brief; Claude drafts the email in your voice.",
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
