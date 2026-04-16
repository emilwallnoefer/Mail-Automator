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
    en: "📑 Additional training decks",
    de: "📑 Weitere Trainingsfolien",
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
    en: "Short walkthroughs on payloads, power options, and field accessories—ideal for pilots and site support before tether work or high-capacity battery operations.",
    de: "Kurze Walkthroughs zu Payloads, Energieversorgung und Feldzubehör—für Piloten und Unterstützung vor Ort, insbesondere vor Tether-Einsätzen oder mit High-Capacity-Akkus.",
    fr: "Guides courts sur charges utiles, alimentation et accessoires de terrain—pour les pilotes et l'équipe terrain avant usage du tether ou batteries grande capacité.",
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
      "Curated Flyability playlists for payloads, inspections, and field workflows—quick video refreshers between missions without long manual reads.",
    desc_de:
      "Kuratierte Flyability-Playlists zu Payloads, Inspektionen und Feldworkflow—kurze Video-Auffrischer zwischen den Einsätzen statt langer Handbücher.",
    desc_fr:
      "Playlists Flyability sur charges utiles, inspections et terrain—rappels vidéo courts entre missions sans relire de longs manuels.",
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
      "Downloadable brand assets, brochures, datasheets, and sample datasets for polished customer-facing deliverables.",
    desc_de:
      "Herunterladbare Markenassets, Broschüren, Datenblätter und Beispieldatensätze für professionelle Kundenunterlagen.",
    desc_fr:
      "Assets de marque, brochures, fiches techniques et jeux de données téléchargeables pour des livrables clients soignés.",
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
      "Covers Elios 3 UT hardware, pre-flight checks, and how A-scans support defect interpretation before your first ultrasonic inspections on site.",
    desc_de:
      "Elios-3-UT-Hardware, Preflight-Checks und A-Scan-Bezug zu Befunden—Grundlage vor den ersten UT-Inspektionen bei euch vor Ort.",
    desc_fr:
      "Matériel UT Elios 3, vérifications et lecture A-scan pour l'interprétation des défauts avant les premières inspections ultrason sur site.",
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
      "Builds on the intro deck with scan plans, gating, and more demanding scenarios for complex UT geometry and tight access.",
    desc_de:
      "Baut auf dem Einführungsdeck auf: Scanpläne, Gates und anspruchsvollere Szenarien bei komplexer Geometrie oder engem Zugang.",
    desc_fr:
      "Prolonge l'intro avec plans de balayage, gates et cas plus exigeants pour géométrie UT complexe ou accès restreint.",
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
      "Self-paced FARO Connect modules with examples and quizzes across the full import-to-delivery workflow beyond what slides alone cover.",
    desc_de:
      "Selbststudium-Module mit Beispielen und Quizzes über den gesamten FARO-Connect-Workflow vom Import bis zur Auslieferung.",
    desc_fr:
      "Modules à votre rythme, exemples et quiz sur tout le flux FARO Connect de l'import à la livraison, au-delà du seul diaporama.",
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
      "Sector framing for pipes, wet wells, and treatment assets so the team shares one approach before wastewater inspection campaigns.",
    desc_de:
      "Branchenrahmen für Leitungen, Schächte und Kläranlagen—gemeinsame Linie vor Abwasser- und Versorger-Inspektionskampagnen.",
    desc_fr:
      "Cadre eau et eaux usées pour conduites, regards et ouvrages de traitement—alignement d'équipe avant campagnes d'inspection réseau.",
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
      "Kiln, cooler, and high-dust plant angles that go beyond generic indoor guidance for cement-site inspection briefings.",
    desc_de:
      "Ofen, Kühler und staubige Heißanlagen aus Zement-Sicht—über generische Indoor-Hinweise hinaus für Einsatzbriefings.",
    desc_fr:
      "Fours, refroidisseurs et sites chauds poussiéreux vus ciment—au-delà du guidage indoor générique pour vos briefs terrain.",
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
      "Academy path on access, inspection patterns, and reporting norms—a structured follow-on after the sector slide deck.",
    desc_de:
      "Academy-Pfad zu Zugang, Inspektionsmustern und Berichtsnormen—strukturierte Vertiefung nach dem Branchen-Foliensatz.",
    desc_fr:
      "Parcours Academy sur accès, modes d'inspection et normes de rapport—suite structurée après le diaporama sectoriel.",
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
      "Mounting, pre-flight checks, and in-flight flammable-gas reading practice for this payload.",
    desc_de:
      "Montage, Preflight-Checks und brennbare Gaswerte im Flug für diesen Payload.",
    desc_fr:
      "Montage, vérifications avant vol et lectures de gaz inflammables en vol pour cette charge utile.",
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
      "RAD flight behaviour, data cues, and Elios 3 field practices so acquisition expectations are clear before you fly.",
    desc_de:
      "RAD-Flugverhalten, Datenhinweise und Elios-3-Feldpraxis—klare Erwartungen an die Datenerfassung vor dem Flug.",
    desc_fr:
      "Comportement RAD en vol, indices dans les données et pratiques Elios 3—attentes d'acquisition claires avant le vol.",
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
      "Step-by-step folding so the tent packs cleanly for transport after outdoor operations.",
    desc_de:
      "Schritt-für-Schritt-Falten, damit das Zelt sauber in die Tasche passt und transporttauglich bleibt.",
    desc_fr:
      "Pliage pas à pas pour ranger la tente proprement dans son sac après interventions extérieures.",
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
      "Probe types, couplant choice, and surface preparation so ultrasonic readings stay consistent on demanding surfaces.",
    desc_de:
      "Sondentypen, Koppelmittelwahl und Oberflächenvorbereitung für konsistente UT-Messungen auf anspruchsvollen Oberflächen.",
    desc_fr:
      "Types de sondes, choix du couplant et préparation de surface pour des mesures UT stables sur surfaces exigeantes.",
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
        en: "Academy modules on gas-sensor setup, monitoring, and safe interpretation of flammable trends for regulated or confined operations.",
        de: "Academy-Module zu Gas-Sensor-Setup, Monitoring und sicherer Einordnung brennbarer Trends für regulierte oder begrenzte Einsätze.",
        fr: "Modules Academy sur installation, suivi et lecture sûre des tendances inflammables pour opérations réglementées ou confinées.",
      },
      cement: {
        en: "Online cement modules for kilns, coolers, and Elios flight paths in dusty, high-heat plants—structured depth after the sector slide deck.",
        de: "Online-Zement-Module für Ofen, Kühler und Elios-Flugpfade in staubigen Heißanlagen—strukturierte Vertiefung nach dem Branchen-Foliensatz.",
        fr: "Modules ciment en ligne pour fours, refroidisseurs et parcours Elios sous chaleur et poussière—approfondissement après le diaporama sectoriel.",
      },
      mining: {
        en: "Underground mining modules on headings, ground support, and Elios flight tactics for teams that routinely work in cave or drift environments.",
        de: "Untertage-Bergbau-Module zu Ortsbrüsten, Gebirgssicherung und Elios-Flugtaktik für Teams in Stollen- und Streckenroutine.",
        fr: "Modules mines souterraines : galeries, soutènements et tactiques de vol Elios pour équipes en travail de galerie courant.",
      },
      wastewater: {
        en: "Wastewater Academy modules on sewers, treatment assets, access, and reporting norms—paced lessons alongside the sector slide deck.",
        de: "Academy-Abwasser-Module zu Kanälen, Anlagen, Zugang und Berichtsnormen—strukturierte Lektionen ergänzend zum Branchen-Foliensatz.",
        fr: "Modules Academy eaux usées : réseaux, ouvrages, accès et normes de rapport—leçons structurées en complément du diaporama sectoriel.",
      },
      regulation: {
        en: "Regulation-focused modules on approvals, airspace, and UAS compliance basics beyond what fits in classroom time.",
        de: "Regulatorik-Module zu Genehmigungen, Luftraum und UAS-Compliance-Grundlagen—über den klassischen Schulungsumfang hinaus.",
        fr: "Modules réglementation : autorisations, espace aérien et bases conformité UAS—au-delà du temps de cours classique.",
      },
      faro_connect: {
        en: "Hands-on FARO Connect drills on Elios exports from import through delivery for your daily processing workflow.",
        de: "Praxisnahe FARO-Connect-Übungen an Elios-Exporten vom Import bis zur Auslieferung für den täglichen Verarbeitungsworkflow.",
        fr: "Exercices FARO Connect sur exports Elios de l'import à la livraison pour votre flux de traitement quotidien.",
      },
    };
    const desc = descriptionById[id] ?? {
      en: "Industry-focused Academy modules beyond core Elios pilot training when a single vertical dominates your inspection work.",
      de: "Branchenfokussierte Academy-Module jenseits der Elios-Grundausbildung, wenn eine Domäne eure Inspektionsarbeit prägt.",
      fr: "Modules Academy sectoriels au-delà du socle pilote Elios lorsqu'un vertical structure votre activité d'inspection.",
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
