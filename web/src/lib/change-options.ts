import industryLinks from "@/mail-config/industry-training-links.json";

export type ChangeOptionCategory = "training_material" | "useful_link" | "thinkific";

/** Supported languages for generated mail bodies and UI labels. */
export type MailLanguage = "en" | "de" | "fr";

/** Group headings for suggested links (UI + email subsections). */
export type ResourceSectionId = "other_useful_links" | "other_trainings" | "online_courses" | "videos";

export const RESOURCE_SECTION_ORDER: ResourceSectionId[] = [
  "other_useful_links",
  "other_trainings",
  "online_courses",
  "videos",
];

/** UI + email subsection titles (main “Other Useful Links” block is separate in the template). */
export const RESOURCE_SECTION_LABELS: Record<ResourceSectionId, { en: string; de: string; fr: string }> = {
  other_useful_links: { en: "Other useful links", de: "Weitere nützliche Links", fr: "Autres liens utiles" },
  other_trainings: {
    en: "📑 Additional training slide decks",
    de: "📑 Weitere Trainings-Folien",
    fr: "📑 Autres diaporamas de formation",
  },
  online_courses: { en: "💻 Online courses", de: "💻 Online-Schulungen", fr: "💻 Cours en ligne" },
  videos: { en: "🎬 Training videos", de: "🎬 Schulungsvideos", fr: "🎬 Vidéos de formation" },
};

export function resourceSectionLabel(sectionId: ResourceSectionId, lang: MailLanguage): string {
  const row = RESOURCE_SECTION_LABELS[sectionId];
  if (lang === "de") return row.de;
  if (lang === "fr") return row.fr;
  return row.en;
}

/** Optional intro paragraph after a ### subsection heading (post-mail useful-links HTML only). */
export const RESOURCE_SECTION_EMAIL_INTRO: Partial<
  Record<ResourceSectionId, { en: string; de: string; fr: string }>
> = {
  videos: {
    en: "These walkthroughs and quick guides focus on specific payloads, power options, and field accessories. Share them with pilots and anyone supporting inspections on site so the team knows what to prepare and how to handle kit safely.",
    de: "Die folgenden Videos und Kurzanleitungen betreffen konkrete Payloads, Energieversorgung und Feldzubehör. Teilt sie mit Piloten und allen, die Inspektionen vor Ort unterstützen, damit klar ist, was vorbereitet werden muss und wie ihr das Material sicher handhabt.",
    fr: "Ces vidéos et guides courts portent sur des charges utiles précises, l’alimentation et le matériel de terrain. Partagez-les avec les pilotes et toute personne qui soutient les inspections sur place, pour préparer les missions et manipuler le matériel en toute sécurité.",
  },
};

export function resourceSectionEmailIntro(sectionId: ResourceSectionId, lang: MailLanguage): string | undefined {
  const row = RESOURCE_SECTION_EMAIL_INTRO[sectionId];
  if (!row) return undefined;
  if (lang === "de") return row.de;
  if (lang === "fr") return row.fr;
  return row.en;
}

/** Subsections listed here do not repeat a sub-heading in the email (the block title already matches). */
export const RESOURCE_SECTION_OMIT_EMAIL_SUBHEADING: ReadonlySet<ResourceSectionId> = new Set([
  "other_useful_links",
]);

/** Decks, slide packs, UT materials (under “Additional training slide decks” in composer + email). */
export const OTHER_TRAININGS_DISPLAY_ORDER: string[] = [
  "useful_intro_ut",
  "useful_ut_advanced",
  "useful_ut_probe",
  "useful_faro_deck",
  "useful_water_wastewater_deck",
  "useful_cement_deck",
];

/** Thinkific academy courses, hub link, and explicit Thinkific URLs that mirror catalog entries. */
export const THINKIFIC_ONLINE_COURSES_ORDER: string[] = [
  "useful_faro_online",
  "thinkific_regulation",
  "thinkific_gas_sensor",
  "thinkific_cement",
  "thinkific_mining",
  "thinkific_wastewater",
  "thinkific_faro_connect",
  "useful_wastewater_course",
  "useful_academy_hub",
];

/** @deprecated Use OTHER_TRAININGS_DISPLAY_ORDER + THINKIFIC_ONLINE_COURSES_ORDER */
export const ONLINE_COURSES_DISPLAY_ORDER: string[] = [
  ...OTHER_TRAININGS_DISPLAY_ORDER,
  ...THINKIFIC_ONLINE_COURSES_ORDER,
];

export type ChangeOption = {
  id: string;
  category: ChangeOptionCategory;
  label_en: string;
  label_de: string;
  label_fr: string;
  desc_en: string;
  desc_de: string;
  desc_fr: string;
  default_checked: boolean;
  link_key?: string;
  course_id?: string;
  url?: string;
  /** Suggested links only; used for grouping in the UI and in the email body. */
  resourceSection?: ResourceSectionId;
};

export function getChangeOptionLabelDesc(option: ChangeOption, lang: MailLanguage): { label: string; desc: string } {
  if (lang === "de") return { label: option.label_de, desc: option.desc_de };
  if (lang === "fr") return { label: option.label_fr, desc: option.desc_fr };
  return { label: option.label_en, desc: option.desc_en };
}

const coreOptions: ChangeOption[] = [
  {
    id: "material_intro",
    category: "training_material",
    label_en: "Introductory Training for Elios 3",
    label_de: "Einführungstraining für den Elios 3",
    label_fr: "Formation d'introduction Elios 3",
    desc_en:
      "This deck covers day-one essentials: setup, core flying, and operational basics for running Elios 3 missions confidently.",
    desc_de:
      "Diese Unterlage deckt die Grundlagen von Tag 1 ab: Setup, Basisflug und operativer Einstieg mit dem Elios 3.",
    desc_fr:
      "Cette présentation reprend les fondamentaux du jour 1: configuration, pilotage de base et prise en main opérationnelle de l'Elios 3.",
    default_checked: true,
    link_key: "INTRO_TRAINING_URL",
  },
  {
    id: "material_aiim",
    category: "training_material",
    label_en: "Indoor Aerial Inspection Methodology (AIIM) Training",
    label_de: "Indoor Aerial Inspection Methodology (AIIM) Training",
    label_fr: "Formation Indoor Aerial Inspection Methodology (AIIM)",
    desc_en:
      "This material details the AIIM method from planning to post-processing, helping your team run structured and repeatable indoor inspections.",
    desc_de:
      "Diese Unterlage beschreibt die AIIM-Methode von der Vorbereitung bis zur Nachbearbeitung für strukturierte und reproduzierbare Indoor-Inspektionen.",
    desc_fr:
      "Ce support détaille la méthode AIIM, de la préparation au post-traitement, pour structurer des inspections indoor efficaces et reproductibles.",
    default_checked: true,
    link_key: "AIIM_TRAINING_URL",
  },
  {
    id: "material_method_statement",
    category: "training_material",
    label_en: "Method Statement Template",
    label_de: "Method Statement Vorlage",
    label_fr: "Modèle de méthodologie (Method Statement)",
    desc_en:
      "This template helps you define mission scope, constraints, and responsibilities before deployment so everyone starts aligned.",
    desc_de:
      "Diese Vorlage hilft euch, Auftrag, Rahmenbedingungen und Verantwortlichkeiten vor dem Einsatz klar festzulegen.",
    desc_fr:
      "Ce modèle vous aide à cadrer mission, périmètre et contraintes avant intervention afin d'aligner toutes les parties prenantes.",
    default_checked: true,
    link_key: "METHOD_STATEMENT_URL",
  },
  {
    id: "material_risk_assessment",
    category: "training_material",
    label_en: "Risk Assessment Guide",
    label_de: "Leitfaden zur Risikobewertung",
    label_fr: "Guide d'évaluation des risques",
    desc_en:
      "This guide lets you assess mission risk level and define practical mitigation actions before entering the asset.",
    desc_de:
      "Mit diesem Leitfaden bewertet ihr das Missionsrisiko und legt vor dem Flug passende Minderungsmaßnahmen fest.",
    desc_fr:
      "Ce guide permet d'évaluer le niveau de risque de chaque mission et de choisir les bonnes mesures de mitigation avant le vol.",
    default_checked: true,
    link_key: "RISK_ASSESSMENT_URL",
  },
  {
    id: "material_sop",
    category: "training_material",
    label_en: "SOP (Standard Operating Procedure)",
    label_de: "SOP (Standard Operating Procedure)",
    label_fr: "SOP (Standard Operating Procedure)",
    desc_en:
      "This SOP baseline structures key pre-, during-, and post-inspection steps so operations stay consistent across teams.",
    desc_de:
      "Diese SOP-Grundlage strukturiert die zentralen Schritte vor, während und nach der Inspektion für konsistente Abläufe im Team.",
    desc_fr:
      "Cette base SOP formalise les étapes clés avant, pendant et après inspection pour standardiser vos opérations sur le terrain.",
    default_checked: true,
    link_key: "SOP_URL",
  },
];

const usefulOptions: ChangeOption[] = [
  {
    id: "useful_knowledge_base",
    category: "useful_link",
    resourceSection: "other_useful_links",
    label_en: "Flyability Knowledge Base",
    label_de: "Flyability Knowledge Base",
    label_fr: "Base de connaissances Flyability",
    desc_en:
      "Your main entry point for product support, firmware guidance, and practical field troubleshooting.",
    desc_de:
      "Euer zentraler Einstieg für Produktsupport, Firmware-Hinweise und praxisnahes Troubleshooting im Feld.",
    desc_fr:
      "Votre point d'entrée principal pour le support produit, les notes firmware et les bonnes pratiques d'exploitation.",
    default_checked: true,
    link_key: "KNOWLEDGE_BASE_URL",
  },
  {
    id: "useful_youtube",
    category: "useful_link",
    resourceSection: "other_useful_links",
    label_en: "YouTube Channel",
    label_de: "YouTube-Kanal",
    label_fr: "Chaîne YouTube",
    desc_en:
      "Flyability playlists for payloads, inspections, and field work. Use it for short video refreshers between missions instead of manuals.",
    desc_de:
      "Flyability-Playlists zu Payloads, Inspektionen und Feldarbeit. Nutzt es für kurze Video-Auffrischer zwischen Jobs statt lange Handbücher zu lesen.",
    desc_fr:
      "Playlists Flyability sur charges utiles, inspections et terrain. Utilisez-les pour des rappels vidéo courts entre missions plutôt que relire les PDF.",
    default_checked: false,
    link_key: "YOUTUBE_CHANNEL_URL",
  },
  {
    id: "useful_customer_toolkit",
    category: "useful_link",
    resourceSection: "other_useful_links",
    label_en: "Customer Toolkit",
    label_de: "Customer Toolkit",
    label_fr: "Customer Toolkit",
    desc_en:
      "Logos, brochures, datasheets, and sample sets for customer-facing work. Use it when proposals need polished files without hours of layout.",
    desc_de:
      "Logos, Broschüren, Datenblätter und Beispielsets für Kundenunterlagen. Nutzt es, wenn Angebote fertige Dateien ohne endloses Layout brauchen.",
    desc_fr:
      "Logos, brochures, fiches et jeux d'exemple pour livrables clients. Utilisez-le quand les propositions doivent paraître soignées sans refaire la mise en page.",
    default_checked: false,
    link_key: "CUSTOMER_TOOLKIT_URL",
  },
  {
    id: "useful_inspector",
    category: "useful_link",
    resourceSection: "other_useful_links",
    label_en: "Inspector 5",
    label_de: "Inspector 5",
    label_fr: "Inspector 5",
    desc_en:
      "Inspector 5 centralizes captured mission data and streamlines visual review before internal handoff or customer delivery.",
    desc_de:
      "Inspector 5 bündelt erfasste Einsatzdaten und vereinfacht die visuelle Auswertung vor interner Übergabe oder Kundendokumentation.",
    desc_fr:
      "Inspector 5 centralise les données capturées et facilite la revue visuelle avant partage interne ou livrable client.",
    default_checked: true,
    link_key: "INSPECTOR_URL",
  },
  {
    id: "useful_nubigon",
    category: "useful_link",
    resourceSection: "other_useful_links",
    label_en: "Nubigon",
    label_de: "Nubigon",
    label_fr: "Nubigon",
    desc_en:
      "Nubigon helps you leverage point clouds for advanced visual reviews and decision-ready stakeholder presentations.",
    desc_de:
      "Mit Nubigon nutzt ihr Punktwolken für vertiefte visuelle Analysen und entscheidungsorientierte Präsentationen.",
    desc_fr:
      "Nubigon permet d'exploiter les nuages de points pour des revues visuelles avancées et des présentations orientées décision.",
    default_checked: false,
    link_key: "NUBIGON_URL",
  },
  {
    id: "useful_scan_bim",
    category: "useful_link",
    resourceSection: "other_useful_links",
    label_en: "Scan to BIM Workflow",
    label_de: "Scan-to-BIM-Workflow",
    label_fr: "Workflow Scan vers BIM",
    desc_en:
      "This workflow explains how to move from field capture to BIM-ready outputs usable by engineering teams.",
    desc_de:
      "Dieser Workflow zeigt, wie ihr Felddaten in BIM-fähige Ergebnisse für Engineering-Teams überführt.",
    desc_fr:
      "Ce workflow décrit le passage de la donnée terrain vers une utilisation BIM exploitable par les équipes ingénierie.",
    default_checked: false,
    link_key: "SCAN_TO_BIM_WORKFLOW_URL",
  },
  {
    id: "useful_intro_ut",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "Introductory UT training for Elios 3 — slide deck",
    label_de: "UT-Einführungstraining Elios 3 — Foliensatz",
    label_fr: "Formation d'introduction UT Elios 3 — diaporama",
    desc_en:
      "Introduces Elios 3 UT hardware, checks, and how A-scans support defect calls. Use it before the first ultrasonic inspection on site.",
    desc_de:
      "Stellt Elios-3-UT-Hardware, Checks und den A-Scan-Bezug zu Befunden vor. Nutzt es vor der ersten UT-Inspektion bei euch vor Ort.",
    desc_fr:
      "Présente le matériel UT Elios 3, les vérifications et le lien A-scan / défauts. Utilisez-le avant la première inspection ultrason sur site.",
    default_checked: false,
    link_key: "INTRO_UT_TRAINING_URL",
  },
  {
    id: "useful_ut_advanced",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "Advanced UT training for Elios 3 — slide deck",
    label_de: "UT-Fortgeschrittenentraining Elios 3 — Foliensatz",
    label_fr: "Formation UT avancée Elios 3 — diaporama",
    desc_en:
      "Adds scan plans, gates, and tougher data cases beyond the intro deck. Use it when UT jobs add complex geometry or tight access.",
    desc_de:
      "Ergänzt Scanpläne, Gates und kniffligere Fälle jenseits der Einführung. Nutzt es, wenn UT-Aufträge komplexe Geometrie oder engen Zugang haben.",
    desc_fr:
      "Ajoute plans de balayage, gates et cas plus difficiles après l'intro. Utilisez-le quand l'UT impose géométrie complexe ou accès étroit.",
    default_checked: false,
    link_key: "UT_ADVANCED_ELIO3_DECK_URL",
  },
  {
    id: "useful_faro_deck",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "FARO Connect training — slide deck",
    label_de: "FARO Connect Training — Foliensatz",
    label_fr: "Formation FARO Connect — diaporama",
    desc_en:
      "This deck covers the full FARO Connect chain from import to clean point-cloud output ready for analysis.",
    desc_de:
      "Dieser Foliensatz behandelt die komplette FARO-Connect-Kette vom Import bis zur bereinigten, auswertbaren Punktwolke.",
    desc_fr:
      "Ce diaporama couvre la chaîne complète FARO Connect, de l'import au nuage de points propre prêt pour exploitation.",
    default_checked: false,
    link_key: "FARO_CONNECT_DECK_URL",
  },
  {
    id: "useful_faro_online",
    category: "useful_link",
    resourceSection: "online_courses",
    label_en: "FARO Connect Online Course",
    label_de: "FARO Connect Online-Kurs",
    label_fr: "Cours en ligne FARO Connect",
    desc_en:
      "Self-paced FARO modules with examples and quizzes end to end. Use it when slides alone still leave gaps in your Connect workflow.",
    desc_de:
      "Selbststudium-FARO-Module mit Beispielen und Quizzes über den ganzen Workflow. Nutzt es, wenn Folien allein Lücken in eurem Connect-Ablauf lassen.",
    desc_fr:
      "Modules FARO à votre rythme, exemples et quiz sur tout le flux. Utilisez-les quand les diapos laissent encore des trous dans votre workflow Connect.",
    default_checked: false,
    link_key: "FARO_CONNECT_ONLINE_COURSE_URL",
  },
  {
    id: "useful_water_wastewater_deck",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "Water & wastewater inspection training — slide deck",
    label_de: "Water & Wastewater Training — Foliensatz",
    label_fr: "Formation eau & eaux usées — diaporama",
    desc_en:
      "Water and wastewater framing for pipes, wet wells, and treatment assets. Use it to align crews before utility inspection campaigns.",
    desc_de:
      "Wasser- und Abwasser-Rahmen für Leitungen, Schächte und Anlagen. Nutzt es, um Teams vor Versorger-Inspektionskampagnen abzugleichen.",
    desc_fr:
      "Cadre eau et eaux usées pour conduites, regards et ouvrages de traitement. Utilisez-le pour aligner l'équipe avant campagnes d'inspection réseau.",
    default_checked: false,
    link_key: "WATER_WASTEWATER_DECK_URL",
  },
  {
    id: "useful_cement_deck",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "Cement plant & kiln inspection training — slide deck",
    label_de: "Zementwerk- & Ofeninspektion — Foliensatz",
    label_fr: "Inspection cimenterie & four — diaporama",
    desc_en:
      "Cement angles for kilns, coolers, and hot dusty plants. Use it when briefs need industry hazards beyond generic indoor guidance.",
    desc_de:
      "Zement-Blickwinkel für Ofen, Kühler und heiße staubige Anlagen. Nutzt es, wenn Briefings branchenspezifische Gefahren jenseits generischer Indoor-Hinweise brauchen.",
    desc_fr:
      "Angles ciment pour fours, refroidisseurs et sites chauds poussiéreux. Utilisez-le quand les briefs exigent des risques métier au-delà du guidage indoor générique.",
    default_checked: false,
    link_key: "CEMENT_ONLINE_DECK_URL",
  },
  {
    id: "useful_wastewater_course",
    category: "useful_link",
    resourceSection: "online_courses",
    label_en: "Wastewater Online Course",
    label_de: "Wastewater Online-Kurs",
    label_fr: "Cours en ligne eaux usées",
    desc_en:
      "Academy track on wastewater inspections, access, and reporting norms. Use it after the slide deck for deeper operational training.",
    desc_de:
      "Academy-Pfad zu Abwasser-Inspektionen, Zugang und Berichtsnormen. Nutzt ihn nach den Folien für tiefergehende operative Schulung.",
    desc_fr:
      "Parcours Academy inspections eaux usées, accès et normes de rapport. Utilisez-le après le diaporama pour une formation opérationnelle plus poussée.",
    default_checked: false,
    link_key: "WASTEWATER_ONLINE_COURSE_URL",
  },
  {
    id: "useful_academy_hub",
    category: "useful_link",
    resourceSection: "online_courses",
    label_en: "Flyability Academy",
    label_de: "Flyability Academy",
    label_fr: "Flyability Academy",
    desc_en:
      "Flyability Academy gives access to industry-focused modules so your team can continue building skills after core training.",
    desc_de:
      "Die Flyability Academy bietet branchenspezifische Module, damit euer Team seine Fähigkeiten nach dem Basistraining weiter ausbauen kann.",
    desc_fr:
      "La Flyability Academy donne accès à des modules sectoriels pour approfondir vos compétences au-delà de la formation initiale.",
    default_checked: false,
    link_key: "FLYABILITY_ACADEMY_HUB_URL",
  },
  {
    id: "useful_gas_sensor",
    category: "useful_link",
    resourceSection: "videos",
    label_en: "Gas Sensor Quick Start Guide",
    label_de: "Gas Sensor Quick-Start-Guide",
    label_fr: "Guide de démarrage capteur de gaz",
    desc_en:
      "Covers mounting, pre-flight checks, and flammable gas readings in flight. Use it as a refresher before missions with this payload.",
    desc_de:
      "Deckt Montage, Preflight-Checks und brennbare Gaswerte im Flug ab. Nutzt es als Auffrischung vor Einsätzen mit diesem Payload.",
    desc_fr:
      "Couvre montage, vérifications avant vol et lectures de gaz inflammables en vol. Servez-vous-en pour réviser avant missions avec cette charge utile.",
    default_checked: false,
    link_key: "GAS_SENSOR_QUICKSTART_URL",
  },
  {
    id: "useful_rad_video",
    category: "useful_link",
    resourceSection: "videos",
    label_en: "Elios 3 RAD Sensor Training Video",
    label_de: "Elios 3 RAD-Sensor Schulungsvideo",
    label_fr: "Vidéo de formation capteur RAD Elios 3",
    desc_en:
      "Explains RAD flight behavior, data cues, and Elios 3 field tips. Use it before flying so acquisition expectations stay aligned.",
    desc_de:
      "Erklärt RAD-Flugverhalten, Daten-Hinweise und Elios-3-Feldtipps. Nutzt es vor dem Flug, damit die Erwartungen zur Erfassung übereinstimmen.",
    desc_fr:
      "Explique comportement RAD en vol, signaux dans les données et conseils Elios 3. Utilisez-le avant vol pour aligner les attentes d'acquisition.",
    default_checked: false,
    link_key: "RAD_SENSOR_VIDEO_URL",
  },
  {
    id: "useful_battery",
    category: "useful_link",
    resourceSection: "videos",
    label_en: "High Capacity Battery Start Guide",
    label_de: "High-Capacity-Akku Start-Guide",
    label_fr: "Guide de démarrage batterie grande capacité",
    desc_en:
      "This guide explains handling, constraints, and best practices for high-capacity batteries to support longer, controlled flights.",
    desc_de:
      "Dieses Video zeigt Handhabung, Grenzen und Best Practices für High-Capacity-Akkus bei längeren, kontrollierten Flügen.",
    desc_fr:
      "Cette vidéo présente l'usage, les limites et les bonnes pratiques des batteries grande capacité pour des vols plus longs et maîtrisés.",
    default_checked: false,
    link_key: "HIGH_CAP_BATTERY_GUIDE_URL",
  },
  {
    id: "useful_tether",
    category: "useful_link",
    resourceSection: "videos",
    label_en: "Tether Unit Start Guide",
    label_de: "Tether-Einheit Start-Guide",
    label_fr: "Guide de démarrage unité d'attache",
    desc_en:
      "This video details tether setup, in-flight use, and maintenance for missions requiring continuous power.",
    desc_de:
      "Dieses Video erläutert Aufbau, Einsatz im Flug und Wartung der Tether-Einheit für Missionen mit Dauerstrom.",
    desc_fr:
      "Cette vidéo détaille l'installation, l'utilisation en vol et la maintenance du tether pour des missions en alimentation continue.",
    default_checked: false,
    link_key: "TETHER_UNIT_GUIDE_URL",
  },
  {
    id: "useful_tent",
    category: "useful_link",
    resourceSection: "videos",
    label_en: "Flyability Tent Folding Tutorial",
    label_de: "Flyability-Zelt Falt-Tutorial",
    label_fr: "Tutoriel pliage tente Flyability",
    desc_en:
      "Step-by-step folding so the tent fits its bag for transport. Use it after outdoor jobs to save time and avoid torn fabric or bent poles.",
    desc_de:
      "Schritt für Schritt Falten, damit das Zelt in die Tasche passt und transporttauglich bleibt. Nutzt es nach Außeneinsätzen, um Zeit zu sparen und Schäden zu vermeiden.",
    desc_fr:
      "Pliage pas à pas pour que la tente tienne dans son sac et survive au transport. Utilisez-le après travaux extérieurs pour gagner du temps et limiter casse.",
    default_checked: false,
    link_key: "TENT_FOLDING_TUTORIAL_URL",
  },
  {
    id: "useful_ut_probe",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "Flyability guide to UT probe selection — slide deck",
    label_de: "Flyability-Leitfaden zur UT-Sondenauswahl — Foliensatz",
    label_fr: "Guide Flyability — choix des sondes UT — diaporama",
    desc_en:
      "Probe types, couplant, and surface prep so UT readings stay trustworthy. Use it before accessories or demanding wall and tank scans.",
    desc_de:
      "Sondentypen, Koppelmittel und Oberflächenvorbereitung für belastbare UT-Werte. Nutzt es vor Zubehörkäufen oder anspruchsvollen Wand- und Tank-Scans.",
    desc_fr:
      "Types de sondes, couplant et préparation de surface pour des mesures UT fiables. Utilisez-le avant achats d'accessoires ou scans mur/réservoir difficiles.",
    default_checked: false,
    link_key: "UT_PROBE_SELECTION_GUIDE_URL",
  },
];

const thinkificOptions: ChangeOption[] = ((industryLinks.courses as Array<Record<string, unknown>>) ?? []).map(
  (course) => {
    const id = String(course.id ?? "");
    const label_en = String(course.label_en ?? id);
    const label_de = String(course.label_de ?? label_en);
    const label_fr = String(course.label_fr ?? label_en);
    const url = String(course.url ?? "");
    const descriptionById: Record<string, { en: string; de: string; fr: string }> = {
      gas_sensor: {
        en: "Gas modules on setup, monitoring, and reading flammable trends safely. Use it before confined or regulated missions with this payload.",
        de: "Gas-Module zu Setup, Monitoring und sicherer Einordnung brennbarer Trends. Nutzt es vor begrenzten oder regulierten Missionen mit diesem Payload.",
        fr: "Modules gaz : installation, suivi et lecture sûre des tendances inflammables. Utilisez-les avant missions confinées ou réglementées avec cette charge.",
      },
      cement: {
        en: "Cement modules for kilns, coolers, and Elios paths in dusty high-heat plants. Use it after the slide deck for structured online depth.",
        de: "Zement-Module für Ofen, Kühler und Elios-Pfade in staubigen Heißanlagen. Nutzt es nach den Folien für strukturierte Online-Tiefe.",
        fr: "Modules ciment pour fours, refroidisseurs et parcours Elios sous chaleur et poussière. Utilisez-les après le diaporama pour approfondir en ligne.",
      },
      mining: {
        en: "Mining modules for headings, ground support, and Elios underground flight tactics. Use it when cave or heading work is common for your team.",
        de: "Bergbau-Module zu Ortsbrüsten, Gebirgssicherung und unterirdischen Elios-Flugtaktiken. Nutzt es, wenn Stollen- oder Streckenarbeit zur Routine wird.",
        fr: "Modules mines : galeries, soutènements et tactiques de vol Elios souterrain. Utilisez-les quand le travail en galerie devient courant pour l'équipe.",
      },
      wastewater: {
        en: "Wastewater modules on sewers, treatment assets, access, and reporting norms. Use it with the slide deck for paced lessons beyond static PDFs.",
        de: "Abwasser-Module zu Kanälen, Anlagen, Zugang und Berichtsnormen. Nutzt es mit den Folien für strukturiertes Lernen jenseits statischer PDFs.",
        fr: "Modules eaux usées : réseaux, ouvrages, accès et normes de rapport. Utilisez-les avec le diaporama pour un rythme pédagogique au-delà des PDF.",
      },
      regulation: {
        en: "Regulation modules on approvals, airspace, and compliance basics for UAS ops. Use it when legal questions go beyond what class time allowed.",
        de: "Regulatorik-Module zu Genehmigungen, Luftraum und Compliance-Grundlagen für UAS. Nutzt es, wenn Rechtsfragen über den Schulungsumfang hinausgehen.",
        fr: "Modules réglementaires : autorisations, espace aérien et bases conformité pour UAS. Utilisez-les quand le juridique dépasse le temps de cours.",
      },
      faro_connect: {
        en: "FARO drills on Elios exports from import through delivery. Use it when slide-only review still leaves gaps in your daily processing workflow.",
        de: "FARO-Übungen an Elios-Exporten vom Import bis zur Auslieferung. Nutzt es, wenn Folien allein noch Lücken im täglichen Verarbeitungsworkflow lassen.",
        fr: "Exercices FARO sur exports Elios de l'import à la livraison. Utilisez-les quand les diapos seules laissent des trous dans votre flux quotidien.",
      },
    };
    const desc = descriptionById[id] ?? {
      en: "Academy modules for specialized industries beyond core Elios pilot training. Use it when one vertical dominates your inspection calendar.",
      de: "Academy-Module für Branchen jenseits der Elios-Grundausbildung. Nutzt es, wenn eine Domäne euren Inspektionskalender dominiert.",
      fr: "Modules Academy pour secteurs spécialisés au-delà du socle Elios. Utilisez-les quand un vertical occupe la majeure partie du calendrier d'inspection.",
    };
    return {
      id: `thinkific_${id}`,
      category: "thinkific" as const,
      resourceSection: "online_courses" as const,
      label_en,
      label_de,
      label_fr,
      desc_en: desc.en,
      desc_de: desc.de,
      desc_fr: desc.fr,
      default_checked: false,
      course_id: id,
      url,
    };
  },
);

export const CHANGE_OPTIONS: ChangeOption[] = [...coreOptions, ...usefulOptions, ...thinkificOptions];

export function getOtherTrainingsOptionsInOrder(catalog: ChangeOption[] = CHANGE_OPTIONS): ChangeOption[] {
  const byId = new Map(catalog.map((o) => [o.id, o]));
  return OTHER_TRAININGS_DISPLAY_ORDER.map((id) => byId.get(id)).filter((o): o is ChangeOption => o != null);
}

export function getThinkificOnlineCoursesInOrder(catalog: ChangeOption[] = CHANGE_OPTIONS): ChangeOption[] {
  const byId = new Map(catalog.map((o) => [o.id, o]));
  return THINKIFIC_ONLINE_COURSES_ORDER.map((id) => byId.get(id)).filter((o): o is ChangeOption => o != null);
}

/** Full legacy ordering (other trainings + Thinkific) for callers that need one combined list. */
export function getOnlineCoursesOptionsInOrder(catalog: ChangeOption[] = CHANGE_OPTIONS): ChangeOption[] {
  return [...getOtherTrainingsOptionsInOrder(catalog), ...getThinkificOnlineCoursesInOrder(catalog)];
}

export const DEFAULT_INCLUDED_CHANGE_IDS = CHANGE_OPTIONS.filter((opt) => opt.default_checked).map((opt) => opt.id);
