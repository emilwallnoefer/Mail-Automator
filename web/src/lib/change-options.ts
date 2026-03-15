import industryLinks from "@/mail-config/industry-training-links.json";

export type ChangeOptionCategory = "training_material" | "useful_link" | "thinkific";

export type ChangeOption = {
  id: string;
  category: ChangeOptionCategory;
  label_en: string;
  label_de: string;
  desc_en: string;
  desc_de: string;
  default_checked: boolean;
  link_key?: string;
  course_id?: string;
  url?: string;
};

const coreOptions: ChangeOption[] = [
  {
    id: "material_intro",
    category: "training_material",
    label_en: "Introductory Training for Elios 3",
    label_de: "Einführungstraining für den Elios 3",
    desc_en: "Everything covered on day one and drone operation basics.",
    desc_de: "Alles vom ersten Tag und die Grundlagen der Drohnenbedienung.",
    default_checked: true,
    link_key: "INTRO_TRAINING_URL",
  },
  {
    id: "material_aiim",
    category: "training_material",
    label_en: "Indoor Aerial Inspection Methodology (AIIM) Training",
    label_de: "Indoor Aerial Inspection Methodology (AIIM) Training",
    desc_en: "Step-by-step preparation for inspection missions and reco flights.",
    desc_de: "Schritt-für-Schritt-Vorbereitung von Inspektionsmissionen inklusive Erkundungsflügen.",
    default_checked: true,
    link_key: "AIIM_TRAINING_URL",
  },
  {
    id: "material_method_statement",
    category: "training_material",
    label_en: "Method Statement Template",
    label_de: "Method Statement Vorlage",
    desc_en: "Collect customer details and document mission requirements clearly.",
    desc_de: "Sammelt Kundendetails und dokumentiert Missionsanforderungen klar.",
    default_checked: true,
    link_key: "METHOD_STATEMENT_URL",
  },
  {
    id: "material_risk_assessment",
    category: "training_material",
    label_en: "Risk Assessment Guide",
    label_de: "Leitfaden zur Risikobewertung",
    desc_en: "Classify mission risk and align preparation to required experience.",
    desc_de: "Klassifiziert Missionsrisiken und hilft bei der passenden Vorbereitung.",
    default_checked: true,
    link_key: "RISK_ASSESSMENT_URL",
  },
  {
    id: "material_sop",
    category: "training_material",
    label_en: "SOP (Standard Operating Procedure)",
    label_de: "SOP (Standard Operating Procedure)",
    desc_en: "Current pre- and post-inspection workflow reference.",
    desc_de: "Aktuelles Referenzdokument für Schritte vor und nach der Inspektion.",
    default_checked: true,
    link_key: "SOP_URL",
  },
];

const usefulOptions: ChangeOption[] = [
  {
    id: "useful_inspector",
    category: "useful_link",
    label_en: "Inspector 5",
    label_de: "Inspector 5",
    desc_en: "Software to download drone flight data.",
    desc_de: "Software zum Herunterladen von Flugdaten.",
    default_checked: true,
    link_key: "INSPECTOR_URL",
  },
  {
    id: "useful_knowledge_base",
    category: "useful_link",
    label_en: "Knowledge Base",
    label_de: "Knowledge Base",
    desc_en: "Answers to (almost) all your questions.",
    desc_de: "Antworten auf (fast) alle eure Fragen.",
    default_checked: true,
    link_key: "KNOWLEDGE_BASE_URL",
  },
  {
    id: "useful_nubigon",
    category: "useful_link",
    label_en: "Nubigon",
    label_de: "Nubigon",
    desc_en: "Software for creating point cloud animations.",
    desc_de: "Software zur Erstellung von Punktwolken-Animationen.",
    default_checked: false,
    link_key: "NUBIGON_URL",
  },
  {
    id: "useful_intro_ut",
    category: "useful_link",
    label_en: "Intro UT Training Deck",
    label_de: "UT Einführungstraining",
    desc_en: "UT kit basics and usage walkthrough.",
    desc_de: "Grundlagen und Anwendung des UT-Kits.",
    default_checked: false,
    link_key: "INTRO_UT_TRAINING_URL",
  },
  {
    id: "useful_customer_toolkit",
    category: "useful_link",
    label_en: "Customer Toolkit",
    label_de: "Customer Toolkit",
    desc_en: "Brand assets, brochures, specs, sample datasets, and media.",
    desc_de: "Brand-Assets, Broschüren, Datenblätter, Beispieldaten und Medien.",
    default_checked: false,
    link_key: "CUSTOMER_TOOLKIT_URL",
  },
];

const thinkificOptions: ChangeOption[] = ((industryLinks.courses as Array<Record<string, unknown>>) ?? []).map(
  (course) => {
    const id = String(course.id ?? "");
    const label_en = String(course.label_en ?? id);
    const label_de = String(course.label_de ?? label_en);
    const url = String(course.url ?? "");
    const descriptionById: Record<string, { en: string; de: string }> = {
      introductory_training: {
        en: "Basics for Elios 3 setup, safety, and first missions.",
        de: "Grundlagen zu Elios-3-Setup, Sicherheit und ersten Missionen.",
      },
      gas_sensor: {
        en: "Use of gas sensor payload and gas reading best practices.",
        de: "Einsatz des Gas-Sensor-Payloads und Best Practices bei Messwerten.",
      },
      cement: {
        en: "Inspection workflows for cement plants and kiln environments.",
        de: "Inspektions-Workflows für Zementwerke und Ofenbereiche.",
      },
      mining: {
        en: "Inspection workflows for underground mining environments.",
        de: "Inspektions-Workflows für untertägige Bergbauumgebungen.",
      },
      wastewater: {
        en: "Workflows for wastewater assets, sewers, and treatment structures.",
        de: "Workflows für Abwasseranlagen, Kanäle und Beckenstrukturen.",
      },
      regulation: {
        en: "Key rules, compliance, and operational regulation guidance.",
        de: "Wichtige Regeln, Compliance- und Regulatorik-Hinweise.",
      },
      elios3_ut: {
        en: "UT payload operation and wall-thickness/NDT workflows.",
        de: "UT-Payload-Bedienung und Workflows für Wanddicke/NDT.",
      },
      faro_connect: {
        en: "Point-cloud processing and FARO Connect workflow essentials.",
        de: "Grundlagen zu Punktwolkenverarbeitung und FARO-Connect-Workflow.",
      },
    };
    const desc = descriptionById[id] ?? {
      en: "Use-case specific online training content.",
      de: "Use-Case-spezifische Online-Trainingsinhalte.",
    };
    return {
      id: `thinkific_${id}`,
      category: "thinkific" as const,
      label_en,
      label_de,
      desc_en: desc.en,
      desc_de: desc.de,
      default_checked: false,
      course_id: id,
      url,
    };
  },
);

export const CHANGE_OPTIONS: ChangeOption[] = [...coreOptions, ...usefulOptions, ...thinkificOptions];

export const DEFAULT_INCLUDED_CHANGE_IDS = CHANGE_OPTIONS.filter((opt) => opt.default_checked).map((opt) => opt.id);

