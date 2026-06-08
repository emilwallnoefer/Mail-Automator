import type { MailLanguage } from "@/lib/change-options";

/**
 * Shared, client-safe definitions for the pre-training composer:
 * per-day disciplines, Lausanne flight sites, agenda + facility-prep builders,
 * and the discipline → pre-reading resource defaults.
 *
 * Kept free of any Node-only imports (no fs/path) so the React composer and the
 * server-side mail engine can both depend on a single source of truth.
 */

export type TrainingDiscipline =
  | "intro"
  | "aiim"
  | "ut"
  | "tether"
  | "surveying"
  | "rad_sensor"
  | "gas_sensor";
export type LausanneSite = "tridel" | "tank_bern" | "aigle_bridge" | "montetan";

type Localized = { en: string; de: string; fr: string };
type LocalizedList = { en: string[]; de: string[]; fr: string[] };

export type PreAgendaInput = {
  language: MailLanguage;
  template_variant?: "lausanne" | "abroad";
  day_count?: 1 | 2 | 3;
  day1_disciplines?: TrainingDiscipline[];
  day2_disciplines?: TrainingDiscipline[];
  day3_disciplines?: TrainingDiscipline[];
  /** Pre-mail Lausanne: the flight site (asset) used on each day. */
  day1_site?: LausanneSite;
  day2_site?: LausanneSite;
  day3_site?: LausanneSite;
};

export const TRAINING_DISCIPLINES: TrainingDiscipline[] = [
  "intro",
  "aiim",
  "ut",
  "tether",
  "surveying",
  "rad_sensor",
  "gas_sensor",
];

export const DISCIPLINE_LABEL: Record<TrainingDiscipline, Localized> = {
  intro: { en: "Intro", de: "Einführung", fr: "Intro" },
  aiim: { en: "AIIM", de: "AIIM", fr: "AIIM" },
  ut: { en: "UT", de: "UT", fr: "UT" },
  tether: { en: "Tether", de: "Tether", fr: "Tether" },
  surveying: { en: "Surveying", de: "Surveying", fr: "Surveying" },
  rad_sensor: { en: "Radiation sensor", de: "Strahlungssensor", fr: "Capteur de radiation" },
  gas_sensor: { en: "Gas sensor", de: "Gassensor", fr: "Capteur de gaz" },
};

export const LAUSANNE_SITE_OPTIONS: Array<{ id: LausanneSite; label: Localized }> = [
  { id: "tridel", label: { en: "Tridel", de: "Tridel", fr: "Tridel" } },
  { id: "tank_bern", label: { en: "Bern", de: "Bern", fr: "Berne" } },
  { id: "aigle_bridge", label: { en: "Aigle", de: "Aigle", fr: "Aigle" } },
  { id: "montetan", label: { en: "Montétan", de: "Montétan", fr: "Montétan" } },
];

/** The location phrase woven into the agenda (after "in"/"à"). */
const LAUSANNE_SITE_PLACE: Record<LausanneSite, Localized> = {
  tridel: { en: "Tridel in Lausanne", de: "Tridel in Lausanne", fr: "Tridel (Lausanne)" },
  tank_bern: { en: "Bern", de: "Bern", fr: "Berne" },
  aigle_bridge: { en: "Aigle", de: "Aigle", fr: "Aigle" },
  montetan: { en: "Montétan in Lausanne", de: "Montétan in Lausanne", fr: "Montétan (Lausanne)" },
};

/** Short location label used in the "please bring" safety list. */
const LAUSANNE_SITE_SHORT: Record<LausanneSite, Localized> = {
  tridel: { en: "Tridel", de: "Tridel", fr: "Tridel" },
  tank_bern: { en: "Bern", de: "Bern", fr: "Berne" },
  aigle_bridge: { en: "Aigle", de: "Aigle", fr: "Aigle" },
  montetan: { en: "Montétan", de: "Montétan", fr: "Montétan" },
};

/** Safety equipment to bring per asset. `null` = nothing required. */
const LAUSANNE_SITE_SAFETY: Record<LausanneSite, Localized | null> = {
  tridel: null,
  tank_bern: {
    en: "safety shoes, vest, helmet",
    de: "Sicherheitsschuhe, Warnweste, Helm",
    fr: "chaussures de sécurité, gilet, casque",
  },
  aigle_bridge: {
    en: "helmet, safety shoes",
    de: "Helm, Sicherheitsschuhe",
    fr: "casque, chaussures de sécurité",
  },
  montetan: null,
};

/** Pre-reading resource IDs always offered, regardless of disciplines. */
export const BASELINE_PRE_CHANGE_IDS = ["material_intro", "useful_knowledge_base"];

/** Discipline → default pre-reading resource IDs (from change-options). */
export const DISCIPLINE_PRE_CHANGE_IDS: Record<TrainingDiscipline, string[]> = {
  intro: ["material_intro"],
  aiim: ["material_aiim"],
  ut: ["useful_intro_ut", "useful_ut_advanced", "useful_ut_probe"],
  tether: ["useful_tether"],
  surveying: ["useful_scan_bim", "useful_faro_deck"],
  rad_sensor: ["useful_rad_video"],
  gas_sensor: ["useful_gas_sensor"],
};

const DISCIPLINE_BULLETS: Record<TrainingDiscipline, LocalizedList> = {
  intro: {
    en: [
      "Safety, limits, and best practices",
      "Elios 3 setup (payloads, batteries, RC, cockpit checks)",
      "Core flight exercises{SITE_CLAUSE} (LOS/FPV, stability, ATTI recovery)",
      "Intro to the data workflow in Inspector",
    ],
    de: [
      "Sicherheit, Grenzen und Best Practices",
      "Elios 3 Setup (Payloads, Batterien, RC, Cockpit-Checks)",
      "Fluggrundlagen{SITE_CLAUSE} (LOS/FPV, Stabilität, ATTI-Recovery)",
      "Einführung in den Datenworkflow in Inspector",
    ],
    fr: [
      "Sécurité, limites et bonnes pratiques",
      "Configuration Elios 3 (charges utiles, batteries, RC, contrôles cockpit)",
      "Exercices de vol de base{SITE_CLAUSE} (LOS/FPV, stabilité, récupération ATTI)",
      "Introduction au workflow de données dans Inspector",
    ],
  },
  aiim: {
    en: [
      "AIIM method: plan, prepare, execute, post-process",
      "Recon / local / systematic inspection methodology",
      "Mission planning and risk mitigation",
      "Practice flight{SITE_CLAUSE} (AIIM scenario)",
      "Data download and reporting in Inspector",
    ],
    de: [
      "AIIM-Methodik: planen, vorbereiten, durchführen, nachbearbeiten",
      "Methodik für Reco-, lokale und systematische Inspektionen",
      "Missionsplanung und Risikominderung",
      "Praxisflug{SITE_CLAUSE} (AIIM-Szenario)",
      "Daten-Download und Reporting in Inspector",
    ],
    fr: [
      "Méthode AIIM : planifier, préparer, exécuter, post-traiter",
      "Méthodologie d'inspection reco / locale / systématique",
      "Planification de mission et réduction des risques",
      "Vol pratique{SITE_CLAUSE} (scénario AIIM)",
      "Téléchargement des données et reporting dans Inspector",
    ],
  },
  ut: {
    en: [
      "UT theory and probe selection",
      "UT payload setup and calibration",
      "Practice flight with the UT payload{SITE_CLAUSE}",
      "UT data post-processing and reporting in Inspector",
    ],
    de: [
      "UT-Theorie und Sondenauswahl",
      "UT-Payload-Setup und Kalibrierung",
      "Praxisflug mit der UT-Payload{SITE_CLAUSE}",
      "Nachbearbeitung und Reporting der UT-Daten in Inspector",
    ],
    fr: [
      "Théorie UT et choix des sondes",
      "Configuration et calibration du payload UT",
      "Vol pratique avec le payload UT{SITE_CLAUSE}",
      "Post-traitement et reporting des données UT dans Inspector",
    ],
  },
  tether: {
    en: [
      "Tether system overview (power, comms, safe operating limits)",
      "Tether unit rigging and setup",
      "Tethered flight practice{SITE_CLAUSE} and best practices",
      "Tether maintenance and troubleshooting",
    ],
    de: [
      "Tether-System-Überblick (Stromversorgung, Kommunikation, sichere Betriebsgrenzen)",
      "Rigging und Setup der Tether-Einheit",
      "Praxis im tethered Flug{SITE_CLAUSE} und Best Practices",
      "Tether-Wartung und Fehlerbehebung",
    ],
    fr: [
      "Présentation du système Tether (alimentation, communication, limites de sécurité)",
      "Gréage et configuration de l'unité Tether",
      "Pratique du vol tethered{SITE_CLAUSE} et bonnes pratiques",
      "Maintenance et dépannage du Tether",
    ],
  },
  surveying: {
    en: [
      "Mapping flight methodology and scan-to-BIM workflow",
      "Practice mapping flight{SITE_CLAUSE}",
      "Point-cloud processing with FARO Connect",
      "Georeferencing and final survey deliverables",
    ],
    de: [
      "Methodik für Kartierungsflüge und Scan-to-BIM-Workflow",
      "Praktischer Kartierungsflug{SITE_CLAUSE}",
      "Punktwolkenverarbeitung mit FARO Connect",
      "Georeferenzierung und finale Surveying-Ergebnisse",
    ],
    fr: [
      "Méthodologie des vols de cartographie et workflow scan vers BIM",
      "Vol de cartographie pratique{SITE_CLAUSE}",
      "Traitement de nuages de points avec FARO Connect",
      "Géoréférencement et livrables surveying finaux",
    ],
  },
  rad_sensor: {
    en: [
      "Radiation (RAD) payload theory and safety",
      "RAD payload setup and calibration",
      "Practice flight with RAD payload{SITE_CLAUSE} (dose-rate mapping)",
      "Radiation data review in Inspector",
    ],
    de: [
      "Theorie und Sicherheit der Strahlungs-Payload (RAD)",
      "RAD-Payload-Setup und Kalibrierung",
      "Praxisflug mit RAD-Payload{SITE_CLAUSE} (Dosisleistungs-Mapping)",
      "Auswertung der Strahlungsdaten in Inspector",
    ],
    fr: [
      "Théorie et sécurité du payload de radiation (RAD)",
      "Configuration et calibration du payload RAD",
      "Vol pratique avec payload RAD{SITE_CLAUSE} (cartographie de débit de dose)",
      "Analyse des données de radiation dans Inspector",
    ],
  },
  gas_sensor: {
    en: [
      "Gas sensor payload theory and target gases",
      "Gas payload setup and calibration",
      "Practice flight with gas sensor payload{SITE_CLAUSE}",
      "Gas readings review and reporting",
    ],
    de: [
      "Theorie der Gassensor-Payload und Zielgase",
      "Gas-Payload-Setup und Kalibrierung",
      "Praxisflug mit Gassensor-Payload{SITE_CLAUSE}",
      "Auswertung und Reporting der Gasmesswerte",
    ],
    fr: [
      "Théorie du payload capteur de gaz et gaz ciblés",
      "Configuration et calibration du payload gaz",
      "Vol pratique avec payload capteur de gaz{SITE_CLAUSE}",
      "Analyse et reporting des mesures de gaz",
    ],
  },
};

function dayWord(language: MailLanguage, n: number): string {
  if (language === "de") return `Tag ${n}`;
  if (language === "fr") return `Jour ${n}`;
  return `Day ${n}`;
}

function agendaHeading(language: MailLanguage): string {
  if (language === "fr") return "Programme :";
  return "Agenda:";
}

function disciplinesForDay(input: PreAgendaInput, dayIdx: number): TrainingDiscipline[] {
  const arrays = [input.day1_disciplines, input.day2_disciplines, input.day3_disciplines];
  const list = arrays[dayIdx] ?? [];
  return list.filter((d): d is TrainingDiscipline => TRAINING_DISCIPLINES.includes(d));
}

/** Clamp/normalize day count to 1–3. */
function resolveDayCount(input: PreAgendaInput): number {
  const n = input.day_count ?? 1;
  if (n < 1) return 1;
  if (n > 3) return 3;
  return n;
}

/** The flight site (asset) selected for a given day index (0-based). */
function siteForDay(input: PreAgendaInput, dayIdx: number): LausanneSite | undefined {
  const sites = [input.day1_site, input.day2_site, input.day3_site];
  return sites[dayIdx];
}

/** Preposition that introduces the location inside an agenda bullet. */
const SITE_PREP: Record<MailLanguage, string> = { en: "in", de: "in", fr: "à" };

/**
 * The location clause spliced into a day's practical-flight bullet, e.g.
 * " in Montétan in Lausanne". Empty string when no site is selected, so the
 * bullet falls back to its plain wording.
 */
function siteClause(site: LausanneSite | undefined, lang: MailLanguage): string {
  if (!site) return "";
  return ` ${SITE_PREP[lang]} ${LAUSANNE_SITE_PLACE[site][lang]}`;
}

export function buildAgendaBlock(input: PreAgendaInput): string {
  const lang = input.language;
  const dayCount = resolveDayCount(input);
  const sections: string[] = [agendaHeading(lang)];

  for (let dayIdx = 0; dayIdx < dayCount; dayIdx += 1) {
    const disciplines = disciplinesForDay(input, dayIdx);
    const topicLabels = disciplines.map((d) => DISCIPLINE_LABEL[d][lang]);

    const title = topicLabels.length
      ? `${dayWord(lang, dayIdx + 1)} - ${topicLabels.join(" / ")}`
      : dayWord(lang, dayIdx + 1);
    sections.push(title);

    const clause = siteClause(siteForDay(input, dayIdx), lang);
    const bullets: string[] = [];
    for (const d of disciplines) bullets.push(...DISCIPLINE_BULLETS[d][lang]);
    for (const bullet of bullets) sections.push(`* ${bullet.replace("{SITE_CLAUSE}", clause)}`);
    sections.push("");
  }

  return sections.join("\n").trim();
}

const SAFETY_HEADING: Localized = {
  en: "Please bring:",
  de: "Bitte mitbringen:",
  fr: "Merci d'apporter :",
};

/**
 * Lausanne-only: the safety gear to bring, per day, for assets that require it.
 * Locations themselves are woven into the agenda (see {SITE_CLAUSE}); this block
 * covers only what to wear/bring. Returns "" when no selected asset needs gear.
 */
export function flightSiteLine(input: PreAgendaInput): string {
  if (input.template_variant !== "lausanne") return "";
  const lang = input.language;
  const dayCount = resolveDayCount(input);

  const entries: Array<{ day: number; site: LausanneSite; gear: string }> = [];
  for (let dayIdx = 0; dayIdx < dayCount; dayIdx += 1) {
    const site = siteForDay(input, dayIdx);
    const gear = site ? LAUSANNE_SITE_SAFETY[site]?.[lang] : undefined;
    if (site && gear) entries.push({ day: dayIdx + 1, site, gear });
  }
  if (entries.length === 0) return "";

  if (dayCount === 1) {
    return `${SAFETY_HEADING[lang]} ${entries[0].gear}.`;
  }

  const lines = [SAFETY_HEADING[lang]];
  for (const entry of entries) {
    lines.push(`* ${dayWord(lang, entry.day)} (${LAUSANNE_SITE_SHORT[entry.site][lang]}): ${entry.gear}`);
  }
  return lines.join("\n");
}

/** Abroad-only: the "please prepare" block; second bullet depends on day count. */
export function facilityPrepBlock(input: PreAgendaInput): string {
  if (input.template_variant !== "abroad") return "";
  const lang = input.language;
  const multiDay = resolveDayCount(input) >= 2;

  const header: Localized = {
    en: "Before the training, please have ready:",
    de: "Bitte stellt vor dem Training bereit:",
    fr: "Avant la formation, merci de prévoir :",
  };
  const theoryRoom: Localized = {
    en: "A room or area for theory and data processing",
    de: "Einen Raum oder Bereich für Theorie und Datenauswertung",
    fr: "Une salle ou un espace pour la théorie et le traitement des données",
  };
  const flightSingle: Localized = {
    en: "A simple, accessible area where we can safely learn to fly and navigate the drone",
    de: "Ein einfacher, gut zugänglicher Bereich, in dem wir das Fliegen und Navigieren der Drohne sicher erlernen können",
    fr: "Un endroit simple et accessible où nous pourrons apprendre à piloter et naviguer le drone en toute sécurité",
  };
  const flightMulti: Localized = {
    en: "Access to an asset representative of where you will use the drone after the training, so the practice mirrors your real operations as closely as possible",
    de: "Zugang zu einem Objekt, das repräsentativ für den späteren Einsatzort der Drohne ist, damit die Praxis möglichst nah an eurem realen Einsatz ist",
    fr: "L'accès à un actif représentatif de l'endroit où vous utiliserez le drone après la formation, afin que la pratique soit au plus proche de vos opérations réelles",
  };

  const flightBullet = multiDay ? flightMulti[lang] : flightSingle[lang];
  return [header[lang], `* ${theoryRoom[lang]}`, `* ${flightBullet}`].join("\n");
}

/** All disciplines across every day, de-duplicated in canonical order. */
function allDisciplines(input: PreAgendaInput): TrainingDiscipline[] {
  const set = new Set<TrainingDiscipline>();
  for (let dayIdx = 0; dayIdx < resolveDayCount(input); dayIdx += 1) {
    for (const d of disciplinesForDay(input, dayIdx)) set.add(d);
  }
  return TRAINING_DISCIPLINES.filter((d) => set.has(d));
}

/** Default pre-reading resource IDs derived from the selected disciplines. */
export function defaultPreChangeIds(input: PreAgendaInput): string[] {
  const ids: string[] = [...BASELINE_PRE_CHANGE_IDS];
  for (const d of allDisciplines(input)) {
    for (const id of DISCIPLINE_PRE_CHANGE_IDS[d]) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}
