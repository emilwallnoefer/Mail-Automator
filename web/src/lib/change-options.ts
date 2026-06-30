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
  other_useful_links: {
    en: "🔗 Software & learning resources",
    de: "🔗 Software & Lernressourcen",
    fr: "🔗 Logiciels et ressources d'apprentissage",
  },
  other_trainings: {
    en: "📑 Additional training slide decks",
    de: "📑 Weitere Trainings-Folien",
    fr: "📑 Autres diaporamas de formation",
  },
  online_courses: { en: "💻 Online platform", de: "💻 Online-Plattform", fr: "💻 Plateforme en ligne" },
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
    en: "Short videos on getting the Flyability payloads and accessories right.\nWatch before starting to use them.",
    de: "Kurze Videos zum richtigen Umgang mit den Flyability-Payloads und dem Zubehör.\nVor der ersten Verwendung ansehen.",
    fr: "Vidéos courtes sur la bonne prise en main des payloads et accessoires Flyability.\nÀ visionner avant la première utilisation.",
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

/** Thinkific academy courses and the Academy hub link. */
export const THINKIFIC_ONLINE_COURSES_ORDER: string[] = [
  "thinkific_regulation",
  "thinkific_gas_sensor",
  "thinkific_cement",
  "thinkific_mining",
  "thinkific_wastewater",
  "thinkific_faro_connect",
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
    label_de: "Einführungstraining für die Elios 3",
    label_fr: "Formation d'introduction Elios 3",
    desc_en:
      "Training deck with every Elios 3 drone and controller function, to get a new pilot up and running.\nUse it to onboard other colleagues internally.",
    desc_de:
      "Trainings-Foliensatz mit allen Funktionen der Drohne und der Fernsteuerung, damit neue Pilotinnen und Piloten die Elios 3 sicher bedienen können.\nZum Einarbeiten weiterer Kolleginnen und Kollegen intern nutzen.",
    desc_fr:
      "Diaporama avec toutes les fonctions du drone et de la télécommande, pour permettre à un nouveau pilote de prendre en main l'Elios 3.\nÀ utiliser pour former d'autres collègues en interne.",
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
      "Deck covering every key flight-prep step and the different inspection types: reconnaissance, inspection, and mapping. Reference before any complex mission.",
    desc_de:
      "Foliensatz zu allen wichtigen Schritten der Flugvorbereitung und den verschiedenen Inspektionsarten: Erkundungs-, Inspektions- und Kartierungsflug. Vor jedem komplexen Einsatz als Referenz nutzen.",
    desc_fr:
      "Diaporama couvrant toutes les étapes importantes de la préparation de vol et les différents types d'inspections : reconnaissance, inspection et cartographie. À consulter avant toute mission complexe.",
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
      "Template for gathering as much information as possible from a client or service requester before a flight. Use as-is or adapt to your needs.",
    desc_de:
      "Vorlage, um vor einem Flug möglichst viele Informationen beim Kunden oder Auftraggeber abzuholen. So nutzen oder an eure Bedürfnisse anpassen.",
    desc_fr:
      "Modèle pour recueillir un maximum d'informations auprès d'un client ou d'un demandeur de service avant un vol. À utiliser tel quel ou à adapter à vos besoins.",
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
      "Assessment guide for scoring a mission's difficulty up front by rating risk across each relevant category.\nUse before demanding or unfamiliar flights.",
    desc_de:
      "Bewertungsleitfaden, um den Schwierigkeitsgrad einer Mission vorab durch Einstufung des Risikos je Kategorie festzulegen.\nVor anspruchsvollen oder ungewohnten Flügen nutzen.",
    desc_fr:
      "Guide d'évaluation pour définir en amont le niveau de difficulté d'une mission en notant le risque par catégorie d'éléments.\nÀ utiliser avant des vols exigeants ou peu familiers.",
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
      "Simple, effective standard operating procedure template.\nAdapt to your needs to build a procedure that fits your own workflow.",
    desc_de:
      "Einfache, wirkungsvolle Vorlage für eine Standard Operating Procedure.\nAn eure Bedürfnisse anpassen, um ein eigenes Verfahren aufzubauen.",
    desc_fr:
      "Modèle simple mais efficace de procédure opératoire standard.\nÀ adapter à vos besoins pour bâtir une procédure qui vous est propre.",
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
      "Flyability hub with FAQs, the latest software updates, product guides, firmware troubleshooting, and handy notes on autonomous features.\nYour day-to-day “Wikipedia-bility”.",
    desc_de:
      "Flyability-Hub mit FAQs, aktuellen Software-Updates, Produktguides, Firmware-Troubleshooting und praktischen Hinweisen zu den autonomen Funktionen.\nEure alltägliche „Wikipedia-bility“.",
    desc_fr:
      "Hub Flyability avec FAQ, dernières mises à jour logicielles, guides produit, dépannage firmware et infos pratiques sur les fonctions autonomes.\nVotre « Wikipedia-bility » au quotidien.",
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
      "Flyability's YouTube channel with tutorial playlists, payload walkthroughs, and industry case studies\ngreat for quick refreshers.",
    desc_de:
      "Flyability-YouTube-Kanal mit Tutorial-Playlists, Payload-Walkthroughs und Branchen-Fallstudien\nideal für schnelle Auffrischer.",
    desc_fr:
      "Chaîne YouTube Flyability avec playlists tutos, démos des payloads et études de cas sectorielles\nidéale pour des rappels rapides.",
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
      "Downloadable Elios 3 brand assets, brochures, spec sheets, sample datasets, and marketing media\nreuse in your own client materials.",
    desc_de:
      "Herunterladbare Elios-3-Markenassets, Broschüren, Datenblätter, Beispieldatensätze und Marketing-Medien\nfür eigene Kundenunterlagen wiederverwendbar.",
    desc_fr:
      "Assets de marque, brochures, fiches techniques, jeux de données et médias marketing Elios 3 téléchargeables\nà réutiliser dans vos supports clients.",
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
      "Our software for viewing and reviewing the data captured by the Elios 3, all in one place.\n(Always the latest version at this link.)",
    desc_de:
      "Unsere Software zum Ansehen und Auswerten der mit der Elios 3 aufgenommenen Daten an einem Ort.\n(Stets die aktuelle Version unter diesem Link.)",
    desc_fr:
      "Notre logiciel pour visualiser et relire simultanément les données capturées par l'Elios 3.\n(Toujours la dernière version à ce lien.)",
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
      "Third-party software for animating point clouds (subscription required).\nHandy for building client-ready presentations.",
    desc_de:
      "Drittanbieter-Software für Punktwolken-Animationen (Abo erforderlich).\nPraktisch für kundentaugliche Präsentationen.",
    desc_fr:
      "Logiciel tiers pour animer des nuages de points (abonnement requis).\nUtile pour préparer des présentations clients.",
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
      "Quick guide to the steps for turning an Elios 3 point cloud into a BIM model.\nReference before your first scan-to-BIM workflow.",
    desc_de:
      "Kurzanleitung mit den Schritten, um eine Elios-3-Punktwolke in ein BIM-Modell zu überführen.\nVor eurem ersten Scan-to-BIM-Workflow nutzen.",
    desc_fr:
      "Guide rapide expliquant les étapes à suivre pour passer d'un nuage de points Elios 3 à un modèle BIM.\nÀ consulter avant votre premier workflow scan-to-BIM.",
    default_checked: false,
    link_key: "SCAN_TO_BIM_WORKFLOW_URL",
  },
  {
    id: "useful_intro_ut",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "Introductory UT training for Elios 3",
    label_de: "UT-Einführungstraining Elios 3",
    label_fr: "Formation d'introduction UT Elios 3",
    desc_en:
      "Light intro slide deck on the UT payload hardware, first setup, and basic ultrasonic concepts. Use before first UT jobs.",
    desc_de:
      "Leichter Einführungsfoliensatz zu Hardware, erster Inbetriebnahme und Ultraschall-Grundlagen des UT-Payloads. Vor den ersten UT-Einsätzen nutzen.",
    desc_fr:
      "Diaporama d'introduction allégé sur le hardware, la première mise en route et les bases ultrason du payload UT. À utiliser avant les premiers jobs UT.",
    default_checked: false,
    link_key: "INTRO_UT_TRAINING_URL",
  },
  {
    id: "useful_ut_advanced",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "Advanced UT training for Elios 3",
    label_de: "UT-Fortgeschrittenentraining Elios 3",
    label_fr: "Formation UT avancée Elios 3",
    desc_en:
      "Full UT payload slide deck on probe technology, dual-crystal mechanics, measurement theory, and inspection methodology. Use for any UT mission.",
    desc_de:
      "Vollständiger UT-Payload-Foliensatz zu Sondentechnologie, Dual-Crystal-Mechanik, Messtheorie und Inspektionsmethodik. Für jeden UT-Einsatz nutzbar.",
    desc_fr:
      "Diaporama complet du payload UT : technologie des sondes, mécanique double cristal, théorie de mesure et méthodologie d'inspection. Utilisable sur toute mission UT.",
    default_checked: false,
    link_key: "UT_ADVANCED_ELIO3_DECK_URL",
  },
  {
    id: "useful_faro_deck",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "FARO Connect Training (Surveying)",
    label_de: "FARO Connect Training (Vermessung)",
    label_fr: "Formation FARO Connect (levé topographique)",
    desc_en:
      "Deck covering the full FARO Connect workflow, from capture to a corrected and clean point cloud.\nReference while post-processing.",
    desc_de:
      "Foliensatz zum gesamten FARO-Connect-Workflow, von der Aufnahme bis zur korrigierten, sauberen Punktwolke.\nAls Referenz bei der Nachbearbeitung.",
    desc_fr:
      "Diaporama couvrant l'ensemble du workflow FARO Connect, de la capture au nuage de points corrigé et propre.\nComme référence pendant le post-traitement.",
    default_checked: false,
    link_key: "FARO_CONNECT_DECK_URL",
  },
  {
    id: "useful_water_wastewater_deck",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "Water and Wastewater AIIM Training",
    label_de: "Water and Wastewater AIIM Training",
    label_fr: "Water and Wastewater AIIM Training",
    desc_en:
      "Slide deck covering risks, safety considerations, flight best practices, and target-based georeferencing in sewers and underground pipes. Use before similar jobs.",
    desc_de:
      "Foliensatz zu Risiken, Sicherheitsaspekten, Flug-Best-Practices und Target-basierter Georeferenzierung in Kanälen und unterirdischen Leitungen. Vor ähnlichen Einsätzen nutzen.",
    desc_fr:
      "Diaporama sur les risques, considérations de sécurité, bonnes pratiques de vol et géoréférencement par cibles dans égouts et conduites souterraines. À utiliser avant des missions similaires.",
    default_checked: false,
    link_key: "WATER_WASTEWATER_DECK_URL",
  },
  {
    id: "useful_cement_deck",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "Cement AIIM Training",
    label_de: "Cement AIIM Training",
    label_fr: "Cement AIIM Training",
    desc_en:
      "Slide deck on cement-plant environments, risk points, flight best practices, and inspection examples on kilns, coolers, and typical assets.",
    desc_de:
      "Foliensatz zu Zementanlagen, Risikopunkten, Flug-Best-Practices und Inspektionsbeispielen an Ofen, Kühler und typischen Anlagen.",
    desc_fr:
      "Diaporama sur les environnements cimentiers, les points de risque, les bonnes pratiques de vol et des exemples d'inspections sur fours, refroidisseurs et ouvrages typiques.",
    default_checked: false,
    link_key: "CEMENT_ONLINE_DECK_URL",
  },
  {
    id: "useful_academy_hub",
    category: "useful_link",
    resourceSection: "online_courses",
    label_en: "Flyability Academy",
    label_de: "Flyability Academy",
    label_fr: "Flyability Academy",
    desc_en:
      "Our current Academy offers free industry-specific modules to help you get the most out of Elios 3 inspections. Explore after training to go deeper.",
    desc_de:
      "Unsere aktuelle Academy bietet kostenlose, branchenspezifische Module, um das Beste aus euren Elios-3-Inspektionen herauszuholen. Nach dem Training zum Vertiefen nutzen.",
    desc_fr:
      "Notre Academy actuelle propose des modules gratuits spécifiques à plusieurs industries pour maximiser les résultats de vos inspections avec l'Elios 3. À parcourir après la formation pour approfondir.",
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
      "Knowledge-base quick-start on the gas sensor mounting, preflight checks, alarm thresholds, and in-flight readings. Watch before first use.",
    desc_de:
      "Knowledge-Base-Quick-Start zu Gas-Sensor-Montage, Preflight, Alarmschwellen und Ablesen im Flug. Vor dem ersten Einsatz ansehen.",
    desc_fr:
      "Guide de démarrage rapide Knowledge Base sur le montage du capteur de gaz, les vérifications avant vol, les seuils d'alarme et la lecture en vol. À voir avant la première utilisation.",
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
      "Tutorial video on the Elios 3 radiation sensor - mounting, flight behaviour, data cues, acquisition, and on-site practices. Watch before first use.",
    desc_de:
      "Tutorial-Video zum Elios-3-Strahlungssensor - Montage, Flugverhalten, Datenhinweise, Aufnahme und Praxis vor Ort. Vor dem ersten Einsatz ansehen.",
    desc_fr:
      "Vidéo tutorielle sur le capteur de radiation Elios 3 - montage, comportement en vol, indices dans les données, acquisition et pratiques sur site. À voir avant la première utilisation.",
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
      "Video covering the differences in drone behaviour between standard and high-capacity batteries.\nWatch before switching to high-capacity batteries.",
    desc_de:
      "Video zu den Unterschieden im Flugverhalten zwischen Standard- und High-Capacity-Akkus.\nVor dem Wechsel auf High-Capacity-Akkus ansehen.",
    desc_fr:
      "Vidéo couvrant les différences de comportement du drone entre batteries standards et haute capacité.\nÀ voir avant de passer aux batteries haute capacité.",
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
      "Video on rigging, safe in-flight use, maintenance, and best practices for the Tether.\nWatch before your first tethered flight.",
    desc_de:
      "Video zu Aufbau, sicherem Flugeinsatz, Wartung und Best Practices des Tethers.\nVor dem ersten Tether-Flug ansehen.",
    desc_fr:
      "Vidéo sur le montage, l'utilisation en toute sécurité, la maintenance et les bonnes pratiques du Tether.\nÀ voir avant le premier vol attaché.",
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
      "Step-by-step video on how to fold the Flyability tent back into its bag without damaging fabric or poles\nWatch before packing up on site.",
    desc_de:
      "Schritt-für-Schritt-Video, wie das Flyability-Zelt wieder in die Tasche gefaltet wird, ohne Stoff oder Stangen zu beschädigen\nVor dem Zusammenpacken vor Ort ansehen.",
    desc_fr:
      "Vidéo pas à pas pour replier la tente Flyability dans son sac sans abîmer le tissu ni les arceaux\nÀ voir avant le rangement sur site.",
    default_checked: false,
    link_key: "TENT_FOLDING_TUTORIAL_URL",
  },
  {
    id: "useful_ut_probe",
    category: "useful_link",
    resourceSection: "other_trainings",
    label_en: "Flyability guide to UT probe selection",
    label_de: "Flyability-Leitfaden zur UT-Sondenauswahl",
    label_fr: "Guide Flyability - choix des sondes UT",
    desc_en:
      "Decision guide comparing dual-crystal and single-crystal UT probes with selection criteria by surface, coating, and environment. Use during mission prep.",
    desc_de:
      "Entscheidungsleitfaden mit Vergleich von Dual- und Single-Crystal-UT-Sonden und Auswahlkriterien nach Oberfläche, Beschichtung und Umgebung. Während der Missionsvorbereitung nutzen.",
    desc_fr:
      "Guide de décision comparant sondes UT double et simple cristal avec critères de choix selon surface, revêtement et environnement. À consulter pendant la préparation.",
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
        en: "Academy course on the gas-sensor payload - mounting, in-flight use, alarm thresholds, and reading flammable-gas trends. Take before first use.",
        de: "Academy-Kurs zum Gas-Sensor-Payload - Montage, Einsatz im Flug, Alarmschwellen und Ablesen brennbarer Gastrends. Vor dem ersten Einsatz nutzen.",
        fr: "Cours Academy sur le payload capteur de gaz - montage, utilisation en vol, seuils d'alarme et lecture des tendances de gaz inflammables. À suivre avant la première utilisation.",
      },
      cement: {
        en: "Academy course on cement-plant inspections with Elios 3 - kilns, coolers, silos, and typical hot and dusty assets. Use before site deployment.",
        de: "Academy-Kurs zu Zementwerk-Inspektionen mit der Elios 3 - Öfen, Kühler, Silos und typische heiße, staubige Anlagen. Vor dem Einsatz vor Ort nutzen.",
        fr: "Cours Academy sur les inspections de cimenterie avec l'Elios 3 - fours, refroidisseurs, silos et ouvrages chauds et poussiéreux typiques. À utiliser avant le déploiement sur site.",
      },
      mining: {
        en: "Academy course on underground mining inspections - drifts, stopes, raises, ore passes, and ground support. Use before site deployment.",
        de: "Academy-Kurs zu Untertage-Inspektionen im Bergbau - Strecken, Abbaukammern, Überhauen, Erzrutschen und Gebirgssicherung. Vor dem Einsatz vor Ort nutzen.",
        fr: "Cours Academy sur les inspections minières souterraines - galeries, chantiers, montages, couloirs à minerai et soutènement. À utiliser avant le déploiement sur site.",
      },
      wastewater: {
        en: "Academy course on wastewater workflows - sewer networks, treatment plants, access points, and inspection reporting. Use before similar jobs.",
        de: "Academy-Kurs zu Abwasser-Workflows - Kanalnetze, Kläranlagen, Zugangspunkte und Inspektionsberichte. Vor ähnlichen Einsätzen nutzen.",
        fr: "Cours Academy sur les workflows eaux usées - réseaux d'égouts, stations de traitement, points d'accès et rapports d'inspection. À utiliser avant des missions similaires.",
      },
      regulation: {
        en: "Academy course with modules on aviation rules, airspace classes, authority approvals, and operational compliance. Use before regulated flights.",
        de: "Academy-Kurs mit Modulen zu Luftfahrtregeln, Luftraumklassen, Behördengenehmigungen und operativer Compliance. Vor regulierten Flügen nutzen.",
        fr: "Cours Academy avec modules sur règles aériennes, classes d'espace aérien, autorisations et conformité opérationnelle. À utiliser avant les vols réglementés.",
      },
      faro_connect: {
        en: "Guided Academy course with hands-on FARO Connect exercises on Elios 3 exports, from ingest to customer-ready deliverables. Work through at your own pace.",
        de: "Geführter Academy-Kurs mit praktischen FARO-Connect-Übungen an Elios-3-Exports, vom Import bis zu kundenfähigen Ergebnissen. Im eigenen Tempo durcharbeiten.",
        fr: "Cours Academy guidé avec exercices pratiques sur FARO Connect à partir d'exports Elios 3, de l'import aux livrables clients. À suivre à son rythme.",
      },
    };
    const desc = descriptionById[id] ?? {
      en: "Academy course covering additional industry or payload context beyond the core pilot training\npick the track that matches your next jobs.",
      de: "Academy-Kurs mit zusätzlichen Branchen- oder Payload-Inhalten jenseits der Basis\nwählt die Spur, die zu euren nächsten Jobs passt.",
      fr: "Cours Academy couvrant un contexte secteur ou payload au-delà du socle pilote\nchoisissez le parcours aligné sur vos missions.",
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
