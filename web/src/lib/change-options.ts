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
    en: "📚 Other trainings",
    de: "📚 Weitere Trainings",
    fr: "📚 Autres formations",
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

/** Decks, slide packs, UT materials, Academy hub (under “Other trainings” in composer + email). */
export const OTHER_TRAININGS_DISPLAY_ORDER: string[] = [
  "useful_intro_ut",
  "useful_ut_advanced",
  "useful_ut_probe",
  "useful_faro_deck",
  "useful_water_wastewater_deck",
  "useful_cement_deck",
  "useful_academy_hub",
];

/** Thinkific academy courses only (plus explicit Thinkific URLs that mirror catalog entries). */
export const THINKIFIC_ONLINE_COURSES_ORDER: string[] = [
  "useful_faro_online",
  "thinkific_regulation",
  "thinkific_gas_sensor",
  "thinkific_cement",
  "thinkific_mining",
  "thinkific_wastewater",
  "thinkific_faro_connect",
  "useful_wastewater_course",
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
    desc_en: "Everything covered on day one and drone operation basics.",
    desc_de: "Alles vom ersten Tag und die Grundlagen der Drohnenbedienung.",
    desc_fr: "Contenu du premier jour et bases du pilotage du drone.",
    default_checked: true,
    link_key: "INTRO_TRAINING_URL",
  },
  {
    id: "material_aiim",
    category: "training_material",
    label_en: "Indoor Aerial Inspection Methodology (AIIM) Training",
    label_de: "Indoor Aerial Inspection Methodology (AIIM) Training",
    label_fr: "Formation Indoor Aerial Inspection Methodology (AIIM)",
    desc_en: "Step-by-step preparation for inspection missions and reco flights.",
    desc_de: "Schritt-für-Schritt-Vorbereitung von Inspektionsmissionen inklusive Erkundungsflügen.",
    desc_fr: "Préparation pas à pas des missions d'inspection et des vols de reconnaissance.",
    default_checked: true,
    link_key: "AIIM_TRAINING_URL",
  },
  {
    id: "material_method_statement",
    category: "training_material",
    label_en: "Method Statement Template",
    label_de: "Method Statement Vorlage",
    label_fr: "Modèle de méthodologie (Method Statement)",
    desc_en: "Collect customer details and document mission requirements clearly.",
    desc_de: "Sammelt Kundendetails und dokumentiert Missionsanforderungen klar.",
    desc_fr: "Recueillir les informations client et documenter clairement les exigences de mission.",
    default_checked: true,
    link_key: "METHOD_STATEMENT_URL",
  },
  {
    id: "material_risk_assessment",
    category: "training_material",
    label_en: "Risk Assessment Guide",
    label_de: "Leitfaden zur Risikobewertung",
    label_fr: "Guide d'évaluation des risques",
    desc_en: "Classify mission risk and align preparation to required experience.",
    desc_de: "Klassifiziert Missionsrisiken und hilft bei der passenden Vorbereitung.",
    desc_fr: "Classer le risque de mission et adapter la préparation au niveau requis.",
    default_checked: true,
    link_key: "RISK_ASSESSMENT_URL",
  },
  {
    id: "material_sop",
    category: "training_material",
    label_en: "SOP (Standard Operating Procedure)",
    label_de: "SOP (Standard Operating Procedure)",
    label_fr: "SOP (Standard Operating Procedure)",
    desc_en: "Current pre- and post-inspection workflow reference.",
    desc_de: "Aktuelles Referenzdokument für Schritte vor und nach der Inspektion.",
    desc_fr: "Référence pour le déroulement avant et après inspection.",
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
    desc_en: "Answers to (almost) all your questions.",
    desc_de: "Antworten auf (fast) alle eure Fragen.",
    desc_fr: "Des réponses à (presque) toutes vos questions.",
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
    desc_en: "Playlists and videos from Flyability.",
    desc_de: "Playlists und Videos von Flyability.",
    desc_fr: "Playlists et vidéos Flyability.",
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
    desc_en: "Brand assets, brochures, specs, sample datasets, and media.",
    desc_de: "Brand-Assets, Broschüren, Datenblätter, Beispieldaten und Medien.",
    desc_fr: "Éléments de marque, brochures, fiches techniques, jeux de données et médias.",
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
    desc_en: "Software to download drone flight data.",
    desc_de: "Software zum Herunterladen von Flugdaten.",
    desc_fr: "Logiciel pour télécharger les données de vol du drone.",
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
    desc_en: "Software for creating point cloud animations.",
    desc_de: "Software zur Erstellung von Punktwolken-Animationen.",
    desc_fr: "Logiciel pour créer des animations de nuages de points.",
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
    desc_en: "Overview of scan-to-BIM processing for inspection data.",
    desc_de: "Überblick über Scan-to-BIM für Inspektionsdaten.",
    desc_fr: "Vue d'ensemble du traitement scan vers BIM pour les données d'inspection.",
    default_checked: false,
    link_key: "SCAN_TO_BIM_WORKFLOW_URL",
  },
  {
    id: "useful_intro_ut",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "UT Intro Training Elios 3",
    label_de: "UT Einführungstraining Elios 3",
    label_fr: "Formation intro UT Elios 3",
    desc_en: "Introductory slides for the ultrasonic testing kit on Elios 3.",
    desc_de: "Einführungsfolien zum UT-Kit am Elios 3.",
    desc_fr: "Diapos d'introduction au kit de contrôle ultrason sur Elios 3.",
    default_checked: false,
    link_key: "INTRO_UT_TRAINING_URL",
  },
  {
    id: "useful_ut_advanced",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "UT Advanced Training Elios 3",
    label_de: "UT Fortgeschrittenentraining Elios 3",
    label_fr: "Formation UT avancée Elios 3",
    desc_en: "Advanced slides for UT missions and data interpretation.",
    desc_de: "Vertiefende Folien für UT-Missionen und Datenauswertung.",
    desc_fr: "Diapos avancées pour missions UT et interprétation des données.",
    default_checked: false,
    link_key: "UT_ADVANCED_ELIO3_DECK_URL",
  },
  {
    id: "useful_faro_deck",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "FARO Connect Training",
    label_de: "FARO Connect Training",
    label_fr: "Formation FARO Connect",
    desc_en: "Slide deck for FARO Connect processing workflows.",
    desc_de: "Folien zu FARO-Connect-Verarbeitungs-Workflows.",
    desc_fr: "Diaporama sur les workflows de traitement FARO Connect.",
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
    desc_en: "Structured online training for FARO Connect.",
    desc_de: "Strukturierte Online-Schulung für FARO Connect.",
    desc_fr: "Formation en ligne structurée pour FARO Connect.",
    default_checked: false,
    link_key: "FARO_CONNECT_ONLINE_COURSE_URL",
  },
  {
    id: "useful_water_wastewater_deck",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "Water & Wastewater Training",
    label_de: "Water & Wastewater Training",
    label_fr: "Formation eau & eaux usées",
    desc_en: "Slide deck for water and wastewater inspection workflows.",
    desc_de: "Folien für Wasser- und Abwasser-Inspektions-Workflows.",
    desc_fr: "Diaporama pour les workflows d'inspection eau et eaux usées.",
    default_checked: false,
    link_key: "WATER_WASTEWATER_DECK_URL",
  },
  {
    id: "useful_cement_deck",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "Cement Online Course",
    label_de: "Cement Online-Kurs",
    label_fr: "Cours en ligne ciment",
    desc_en: "Slide deck for cement plant and kiln inspection topics.",
    desc_de: "Folien zu Inspektionen in Zementwerken und im Ofenbereich.",
    desc_fr: "Diaporama sur les inspections en cimenterie et four.",
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
    desc_en: "Academy course focused on wastewater inspections.",
    desc_de: "Academy-Kurs mit Fokus auf Abwasser-Inspektionen.",
    desc_fr: "Cours Academy axé sur les inspections d'eaux usées.",
    default_checked: false,
    link_key: "WASTEWATER_ONLINE_COURSE_URL",
  },
  {
    id: "useful_academy_hub",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "Flyability Academy",
    label_de: "Flyability Academy",
    label_fr: "Flyability Academy",
    desc_en: "Main portal for Flyability online courses and enrollments.",
    desc_de: "Hauptportal für Flyability Online-Kurse und Anmeldungen.",
    desc_fr: "Portail principal des cours en ligne et inscriptions Flyability.",
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
      "Covers mounting, pre-flight checks, and how to interpret flammable gas readings during operations. Use it as a refresher before the first mission with this payload so everyone knows the safety basics and what the data means.",
    desc_de:
      "Zeigt Montage, Checks vor dem Flug und wie ihr brennbare Gas-Messwerte im Einsatz einordnet. Nutzt es als Auffrischung vor der ersten Mission mit diesem Payload, damit alle Sicherheitsgrundlagen und die Bedeutung der Daten kennen.",
    desc_fr:
      "Aborde la mise en place, les vérifications avant vol et l’interprétation des mesures de gaz inflammables en opération. À revoir avant la première mission avec cette charge utile pour rappeler les fondamentaux sécurité et la lecture des données.",
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
      "Explains how the RAD payload behaves in flight, what to watch in the data, and practical tips for Elios 3. Helpful for the team before flying so expectations for acquisition and reporting stay aligned.",
    desc_de:
      "Erklärt das Flugverhalten des RAD-Payloads, worauf ihr in den Daten achten sollt und praktische Tipps für den Elios 3. Hilft dem Team vor dem Einsatz, damit Erwartungen zu Erfassung und Auswertung klar sind.",
    desc_fr:
      "Présente le comportement en vol du capteur RAD, les points à surveiller dans les données et des conseils pratiques sur Elios 3. Utile avant les vols pour aligner l’équipe sur l’acquisition et le traitement.",
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
      "Walks through charging habits, installing and removing the pack, and realistic runtime expectations. Reduces ground delays caused by mishandling or uncertainty about the high capacity battery.",
    desc_de:
      "Geht auf Ladegewohnheiten, Ein- und Ausbau des Packs und realistische Laufzeiterwartungen ein. Reduziert Verzögerungen am Boden durch unsichere Handhabung oder Missverständnisse zum High-Capacity-Akku.",
    desc_fr:
      "Décrit les bonnes pratiques de charge, la pose et le retrait de la batterie, ainsi que l’autonomie attendue. Limite les retours au sol dus à une manipulation hésitante ou à des attentes floues sur la grande capacité.",
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
      "Shows how to rig the tether, operate it during flight, and pack it away without tangling or damaging leads. Review as a crew before jobs where continuous power or long hovers matter.",
    desc_de:
      "Zeigt, wie ihr das Tether montiert, im Flug nutzt und ohne Verknoten oder Beschädigung wieder verstaut. Besprecht es als Team vor Einsätzen, bei denen Dauerstrom oder langes Schweben wichtig sind.",
    desc_fr:
      "Montre comment installer le filin, l’utiliser en vol et le ranger sans nœuds ni dommages. À regarder en équipe avant les missions où l’alimentation continue ou de longues phases de vol stationnaire comptent.",
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
      "Step-by-step folding and packing so the tent fits cleanly in its bag and survives transport. Saves time on site and helps avoid torn fabric or bent poles when you work outdoors often.",
    desc_de:
      "Schritt für Schritt Falten und Verpacken, damit das Zelt sauber in die Tasche passt und den Transport übersteht. Spart Zeit vor Ort und schützt vor Rissen im Stoff oder verbogenen Stangen bei häufigem Außeneinsatz.",
    desc_fr:
      "Plier et ranger la tente pas à pas pour un sac bien rempli et un transport sans casse. Gagne du temps sur le terrain et limite déchirures ou arceaux pliés si vous travaillez souvent en extérieur.",
    default_checked: false,
    link_key: "TENT_FOLDING_TUTORIAL_URL",
  },
  {
    id: "useful_ut_probe",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "Flyability Guide to UT Probe Selection",
    label_de: "Leitfaden zur UT-Sondenauswahl",
    label_fr: "Guide Flyability — choix des sondes UT",
    desc_en: "Choosing the right UT probe for your inspection.",
    desc_de: "Die passende UT-Sonde für eure Inspektion wählen.",
    desc_fr: "Choisir la sonde UT adaptée à votre inspection.",
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
        en: "Use of gas sensor payload and gas reading best practices.",
        de: "Einsatz des Gas-Sensor-Payloads und Best Practices bei Messwerten.",
        fr: "Utilisation de la charge utile gaz et bonnes pratiques de lecture.",
      },
      cement: {
        en: "Inspection workflows for cement plants and kiln environments.",
        de: "Inspektions-Workflows für Zementwerke und Ofenbereiche.",
        fr: "Workflows d'inspection pour cimenteries et fours.",
      },
      mining: {
        en: "Inspection workflows for underground mining environments.",
        de: "Inspektions-Workflows für untertägige Bergbauumgebungen.",
        fr: "Workflows d'inspection pour environnements miniers souterrains.",
      },
      wastewater: {
        en: "Workflows for wastewater assets, sewers, and treatment structures.",
        de: "Workflows für Abwasseranlagen, Kanäle und Beckenstrukturen.",
        fr: "Workflows pour réseaux d'assainissement et ouvrages de traitement.",
      },
      regulation: {
        en: "Key rules, compliance, and operational regulation guidance.",
        de: "Wichtige Regeln, Compliance- und Regulatorik-Hinweise.",
        fr: "Règles clés, conformité et cadre réglementaire opérationnel.",
      },
      faro_connect: {
        en: "Point-cloud processing and FARO Connect workflow essentials.",
        de: "Grundlagen zu Punktwolkenverarbeitung und FARO-Connect-Workflow.",
        fr: "Traitement des nuages de points et essentiels du workflow FARO Connect.",
      },
    };
    const desc = descriptionById[id] ?? {
      en: "Use-case specific online training content.",
      de: "Use-Case-spezifische Online-Trainingsinhalte.",
      fr: "Contenu de formation en ligne spécifique au cas d'usage.",
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
