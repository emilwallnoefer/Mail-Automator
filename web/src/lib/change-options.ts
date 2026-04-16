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
    en: "Short videos on payloads, power, tether, and batteries—share with pilots and anyone supporting flights on site before those missions.",
    de: "Kurze Videos zu Payloads, Stromversorgung, Tether und Akkus—für Piloten und Unterstützung vor Ort, bevor solche Einsätze anstehen.",
    fr: "Vidéos courtes sur charges utiles, alimentation, tether et batteries—à partager avec pilotes et équipe terrain avant ces missions.",
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
    label_de: "Einführungstraining für die Elios 3",
    label_fr: "Formation d'introduction Elios 3",
    desc_en:
      "Everything from the first training day—your go-to if a function slips your mind or you need a quick refresher on the drone. The deck is updated often, so check back every few months.",
    desc_de:
      "Alles vom ersten Trainingstag—Nachschlagewerk, wenn eine Funktion entfällt oder die Bedienung aufgefrischt werden soll. Wird häufig aktualisiert, also regelmäßig nachschauen.",
    desc_fr:
      "Tout ce que nous avons vu le premier jour : fonctions du drone et de la télécommande, prise en main produit—utile aussi pour former d'autres collègues en interne.",
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
      "From day two onward: step-by-step prep for inspection missions, including the essential recon flight—especially when missions get complex.",
    desc_de:
      "Ab dem zweiten Tag: Schritt-für-Schritt-Vorbereitung von Inspektionsmissionen inklusive Erkundungsflug—besonders hilfreich bei komplexeren Einsätzen.",
    desc_fr:
      "Préparation de vol, types d'inspections (reco, inspection, cartographie) et méthode AIIM pour structurer vos missions indoor.",
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
      "Collect the mission facts your client owes you before flying—everything documented in one place. Adapt it, take ideas from it, or build your own version.",
    desc_de:
      "Damit erfasst ihr vor dem Flug die wichtigsten Kundeninformationen; alle Missionsdetails sind dokumentiert. Anpassen, als Vorlage nutzen oder eigene Version erstellen.",
    desc_fr:
      "Très utile pour recueillir le maximum d'informations auprès du client ou du demandeur. À utiliser tel quel ou adapté à vos besoins.",
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
      "Classify difficulty and risk so you can match crew experience to the job and back up pricing for tougher work.",
    desc_de:
      "Hilft, Missionen nach Schwierigkeit und Risiko einzustufen—für passende Crew-Erfahrung und nachvollziehbare Preislogik bei harten Jobs.",
    desc_fr:
      "Pour estimer la difficulté d'une mission et le niveau de risque par catégorie avant des vols exigeants ou peu familiers.",
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
      "Our latest manual for every pre- and post-inspection step—print it and run it each mission so quality stays consistent.",
    desc_de:
      "Unser aktuellstes Handbuch mit allen Schritten vor und nach der Inspektion—am besten ausdrucken und bei jeder Mission nutzen.",
    desc_fr:
      "Modèle de procédure opérationnelle standard, simple et efficace—à adapter pour une procédure qui vous correspond.",
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
      "FAQs, firmware notes, and Elios 3 answers—the first stop when something in the field behaves differently than it did in class.",
    desc_de:
      "FAQs, Firmware und Produktwissen für Elios 3—erster Anlauf, wenn’s vor Ort anders läuft als in der Schulung.",
    desc_fr:
      "Hub pour dépannage, firmware et guides produit : FAQ, mises à jour et astuces terrain (notre « Wikipedia-bility »).",
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
      "Packed with tutorials and training videos for quick refreshers between jobs.",
    desc_de:
      "Viele Tutorials und Trainingsvideos für kurze Auffrischer zwischen den Einsätzen.",
    desc_fr:
      "Nombreux tutoriels et vidéos de formation pour des rappels rapides entre deux missions.",
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
      "Logos, brochures, spec sheets, sample datasets, and media for polished customer handouts.",
    desc_de:
      "Logos, Broschüren, Datenblätter, Beispieldatensätze und Medien für überzeugende Kundenunterlagen.",
    desc_fr:
      "Logos, brochures, fiches techniques, jeux de données et médias téléchargeables pour livrables clients.",
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
      "Download and review flight data in one place.",
    desc_de:
      "Software zum Herunterladen und Auswerten der Flugdaten an einem Ort.",
    desc_fr:
      "Logiciel de visualisation des données capturées par le drone.",
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
      "Software for visually rich point-cloud animations in reviews and stakeholder meetings.",
    desc_de:
      "Software für anschauliche Punktwolken-Animationen in Reviews und Kundenterminen.",
    desc_fr:
      "Logiciel pour animer des nuages de points de façon convaincante (hors Flyability ; abonnement requis).",
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
      "Tutorial for converting point clouds into BIM models.",
    desc_de:
      "Tutorial zur Umwandlung von Punktwolken in BIM-Modelle.",
    desc_fr:
      "Guide rapide pour passer d'un nuage de points à un modèle BIM.",
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
      "The slide deck we used together for UT—baseline Elios 3 ultrasonic setup before first field UT jobs.",
    desc_de:
      "Der Foliensatz aus dem gemeinsamen UT-Block—Grundlage zur Elios-3-Ultraschall-UT vor ersten Feldjobs.",
    desc_fr:
      "Diaporama d'introduction UT : matériel, vérifications et lien A-scan / défauts avant premières inspections ultrason sur site.",
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
      "Adds scan plans, gates, and tougher data cases once the intro UT deck is under your belt.",
    desc_de:
      "Ergänzt Scanpläne, Gates und kniffligere Fälle, wenn die UT-Basis sitzt.",
    desc_fr:
      "Plans de balayage, gates et cas plus difficiles après l'intro UT.",
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
      "Slides covering FARO Connect with Elios outputs—from import through deliverables; pair with the online Academy course for daily habits.",
    desc_de:
      "Folien zu FARO Connect mit Elios-Daten vom Import bis zu Deliverables; mit Online-Academy-Kurs für feste Nachbearbeitungsroutine.",
    desc_fr:
      "Diaporama FARO Connect : de la capture à un nuage de points propre, prêt à exploiter.",
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
      "Self-paced FARO modules with examples and quizzes end to end when the slide deck alone still leaves gaps.",
    desc_de:
      "Selbststudium-FARO-Module mit Beispielen und Quizzes über den ganzen Workflow, wenn Folien allein nicht reichen.",
    desc_fr:
      "Modules à votre rythme avec exemples et quiz sur tout le flux Connect.",
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
      "Extra deck for sewer, channel, and wet-well work—field tips when inspections or mapping head underground.",
    desc_de:
      "Zusatzdeck für Kanal-, Schacht- und Untergrundarbeit—Praxistipps, wenn Inspektion oder Kartierung ins Netz geht.",
    desc_fr:
      "Axé inspections et cartographies en réseau d'égouts : bonnes pratiques terrain pour ces environnements.",
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
      "Cement-plant lens on kilns, coolers, and hot dusty assets—beyond generic indoor checklists.",
    desc_de:
      "Zement-Blick auf Ofen, Kühler und staubige Heißanlagen—über generische Indoor-Checklisten hinaus.",
    desc_fr:
      "Angles cimenterie et four pour inspections sous chaleur et poussière.",
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
      "Academy track on wastewater access, inspection flow, and reporting norms after the sector slides.",
    desc_de:
      "Academy-Track zu Zugang, Inspektionsablauf und Berichtslogik nach dem Branchen-Foliensatz.",
    desc_fr:
      "Parcours Academy eaux usées : accès, inspections et normes de rapport après le diaporama secteur.",
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
      "Where you enroll, resume, and track Flyability Academy courses after the links in this recap.",
    desc_de:
      "Hier meldet ihr euch an, setzt Kurse fort und behaltet den Überblick—wenn ihr nach dieser Mail weiterlernen wollt.",
    desc_fr:
      "Modules gratuits par secteur pour aller plus loin avec l'Elios 3 après la formation.",
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
      "Walkthrough for mounting, preflight checks, and flammable-gas readings before missions with this sensor.",
    desc_de:
      "Ablauf zu Montage, Preflight und brennbaren Gaswerten vor Einsätzen mit diesem Sensor.",
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
      "RAD flight behaviour and data cues on Elios 3 so acquisition expectations match what you will see on site.",
    desc_de:
      "RAD-Flugverhalten und Datenhinweise am Elios 3, damit die Erwartung zur Aufnahme zum Feld passt.",
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
      "Charging, pack handling, and realistic runtime on high-capacity packs before longer flights.",
    desc_de:
      "Laden, Pack-Handling und realistische Laufzeit der High-Capacity-Akkus vor längeren Flügen.",
    desc_fr:
      "Différences de comportement entre batteries standard et grande capacité.",
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
      "Rigging, in-flight use, maintenance, and tidy stowage for tethered missions and long hovers.",
    desc_de:
      "Aufbau, Flugeinsatz, Wartung und sauberes Verstauen für Tether-Einsätze und lange Schwebephase.",
    desc_fr:
      "Tether : utilisation sûre, maintenance, bonnes pratiques et montage.",
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
      "Step-by-step folding so the tent fits its bag after outdoor jobs without torn fabric or bent poles.",
    desc_de:
      "Schritt für Schritt Falten, damit das Zelt in die Tasche passt und transporttauglich bleibt.",
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
      "Probe types, couplant, and surface prep so UT readings stay trustworthy on demanding wall and tank scans.",
    desc_de:
      "Sondentypen, Koppelmittel und Oberflächenprep für belastbare UT-Werte bei harten Wand- und Tankflächen.",
    desc_fr:
      "Types de sondes, couplant et préparation de surface pour des mesures UT fiables sur surfaces exigeantes.",
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
        en: "Academy gas course—setup, monitoring, and safe reads of flammable trends before regulated or confined flights.",
        de: "Academy-Kurs Gas: Setup, Monitoring und sichere Einordnung brennbarer Trends vor regulierten oder engen Flügen.",
        fr: "Parcours Academy capteur gaz : installation, suivi et lecture sûre des tendances inflammables.",
      },
      cement: {
        en: "Academy cement track for kilns, coolers, and dusty hot plants after the cement slide deck.",
        de: "Academy-Zement-Track zu Ofen, Kühler und staubiger Hitze nach dem Zement-Foliensatz.",
        fr: "Parcours Academy ciment : fours, refroidisseurs et environnements chauds et poussiéreux.",
      },
      mining: {
        en: "Academy mining track—headings, ground support, and underground Elios tactics for routine drift work.",
        de: "Academy-Bergbau zu Strecken, Gebirgssicherung und Elios unter Tage bei laufender Stollenroutine.",
        fr: "Parcours Academy mines : galeries, soutènement et tactiques Elios souterrain.",
      },
      wastewater: {
        en: "Academy wastewater modules on networks, assets, access, and reporting—after the sector slide deck.",
        de: "Academy-Abwasser zu Netzen, Anlagen, Zugang und Reporting nach dem Branchen-Foliensatz.",
        fr: "Modules Academy eaux usées : réseaux, ouvrages, accès et normes de rapport.",
      },
      regulation: {
        en: "Approvals, airspace, and compliance refreshers when legal scope outgrows what we covered in class.",
        de: "Genehmigungen, Luftraum und Compliance-Refresh, wenn der rechtliche Rahmen über den Kursinhalt hinauswächst.",
        fr: "Autorisations, espace aérien et bases conformité UAS au-delà du temps de cours.",
      },
      faro_connect: {
        en: "Guided FARO Connect exercises on Elios exports from ingest to customer-ready deliverables.",
        de: "Geführte FARO-Connect-Übungen an Elios-Daten vom Import bis zum Kundenliefersatz.",
        fr: "Exercices guidés FARO Connect sur exports Elios jusqu'à livrables clients.",
      },
    };
    const desc = descriptionById[id] ?? {
      en: "Academy industry packs beyond core Elios pilot training—pick the track that matches your next jobs.",
      de: "Academy-Branchenpakete jenseits der Elios-Basis—wählt die Spur, die zu euren nächsten Jobs passt.",
      fr: "Modules sectoriels Academy au-delà du socle pilote Elios—choisissez le parcours aligné sur vos missions.",
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
