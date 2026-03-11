import fs from "node:fs";
import path from "node:path";
import industryLinks from "@/mail-config/industry-training-links.json";
import trainingLinks from "@/mail-config/training-links.json";
import usefulLinksPolicy from "@/mail-config/useful-links-policy.json";

export type MailInput = {
  mail_type: "pre" | "post";
  template_variant?: "lausanne" | "abroad";
  language: "en" | "de";
  training_type?: "intro_1day" | "aiim_3day";
  recipient_name: string;
  company_name: string;
  date: string;
  location: string;
  custom_opener_note?: string;
  industry_course_ids?: string;
  include_certification_note?: boolean;
  include_simulator_note?: boolean;
  include_customer_toolkit?: boolean;
  company_research_text?: string;
};

export type RenderResult = {
  template_id: string;
  subject: string;
  body: string;
  html_body: string;
};

type Course = {
  id: string;
  label_en: string;
  label_de: string;
  url: string;
  keywords: string[];
};

function readTemplates(): string {
  const filePath = path.join(process.cwd(), "src/mail-config/training-email-templates.md");
  return fs.readFileSync(filePath, "utf-8");
}

function parseTemplates(raw: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const regex = /^## TEMPLATE_ID:\s*([a-z0-9_]+)\s*$/gm;
  const matches = [...raw.matchAll(regex)];

  matches.forEach((match, index) => {
    const id = match[1];
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? raw.length) : raw.length;
    sections[id] = raw.slice(start, end).trim();
  });
  return sections;
}

function chooseTemplateId(input: MailInput): string {
  if (input.mail_type === "post") return `post_${input.language}`;
  if (!input.template_variant) throw new Error("template_variant required for pre templates");
  return `pre_${input.template_variant}_${input.language}`;
}

function extractSubjectAndBody(templateText: string) {
  const lines = templateText.split("\n");
  const first = lines[0] ?? "";
  if (!first.startsWith("SUBJECT:")) throw new Error("Template missing SUBJECT line");
  const subject = first.replace("SUBJECT:", "").trim();
  const body = lines
    .slice(1)
    .filter((line) => line.trim() !== "---")
    .join("\n")
    .trim();
  return { subject, body };
}

function trimPretrainingDays(body: string, trainingType?: string) {
  if (trainingType === "intro_1day") {
    body = body.replace(/\n?<!-- DAY2_START -->[\s\S]*?<!-- DAY2_END -->\n?/g, "\n");
    body = body.replace(/\n?<!-- DAY3_START -->[\s\S]*?<!-- DAY3_END -->\n?/g, "\n");
  }
  body = body.replace(/<!-- DAY[123]_(START|END) -->\n?/g, "");
  return body;
}

function replacePlaceholders(text: string, replacements: Record<string, string>) {
  let result = text;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value ?? "");
  }
  return result;
}

function normalize(text: string) {
  return (
    text
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

function stripMarkdownLinks(text: string) {
  return text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1");
}

function markdownToHtml(text: string) {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  const linked = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    (_match, label, url) => `<a href="${url}">${label}</a>`,
  );

  return linked
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((p) => `<p>${p.replaceAll("\n", "<br>")}</p>`)
    .join("\n");
}

function parseIndustryIds(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function inferIndustryCourseIds(input: MailInput, catalog: Course[]) {
  const explicit = parseIndustryIds(input.industry_course_ids);
  if (explicit.length) return explicit;

  const source = [
    input.company_name,
    input.company_research_text ?? "",
    input.custom_opener_note ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return catalog
    .filter((course) => course.keywords.some((kw) => source.includes(kw.toLowerCase())))
    .map((course) => course.id);
}

function buildIndustryTrainingBlock(language: "en" | "de", selectedIds: string[], catalog: Course[]) {
  if (!selectedIds.length) return "";
  const byId = new Map(catalog.map((course) => [course.id, course]));
  const lines = [language === "de" ? "Branchenspezifische Academy-Kurse" : "Industry-specific Academy courses"];

  for (const id of selectedIds) {
    const course = byId.get(id);
    if (!course) continue;
    const label = language === "de" ? course.label_de : course.label_en;
    lines.push(`- [${label}](${course.url})`);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

function buildUsefulLinksBlock(language: "en" | "de", selectedIds: string[], input: MailInput) {
  const policy = usefulLinksPolicy as {
    common: Array<Record<string, unknown>>;
    conditional: Array<Record<string, unknown>>;
  };
  const links = trainingLinks as Record<string, string>;
  const lines = [language === "de" ? "Weitere nützliche Links" : "Other Useful Links"];

  const addItem = (item: Record<string, unknown>) => {
    const linkKey = String(item.link_key ?? "");
    const url = links[linkKey];
    if (!url) return;
    const label = language === "de" ? String(item.label_de ?? "") : String(item.label_en ?? "");
    const desc = language === "de" ? String(item.desc_de ?? "") : String(item.desc_en ?? "");
    lines.push(`[${label}](${url}) - ${desc}`);
  };

  policy.common.forEach(addItem);
  policy.conditional.forEach((item) => {
    const required = new Set((item.industry_course_ids as string[] | undefined) ?? []);
    const includeFlag = String(item.include_flag ?? "");
    const includeByFlag = includeFlag ? Boolean((input as Record<string, unknown>)[includeFlag]) : false;
    const includeByIndustry = [...required].some((id) => selectedIds.includes(id));
    if (includeByFlag || includeByIndustry) addItem(item);
  });

  return lines.length > 1 ? lines.join("\n") : "";
}

function certificationNote(language: "en" | "de", enabled?: boolean) {
  if (!enabled) return "";
  if (language === "de") {
    return "Zertifizierungshinweis\nEs freut mich, euch mitzuteilen, dass ihr das Training erfolgreich absolviert habt. Die Zertifikate dienen als offizieller Nachweis in unserer Datenbank, dass ihr ausgebildete Piloten seid.";
  }
  return "Certification note\nI am happy to confirm that you successfully completed the training. Your certificates act as official proof in our records that you are trained pilots.";
}

function simulatorNote(language: "en" | "de", enabled?: boolean) {
  if (!enabled) return "";
  const course = "https://flyabilityacademy.thinkific.com/courses/Introductorytrainingcourse";
  if (language === "de") {
    return `Hinweis für Kollegen ohne Trainingsteilnahme\nKollegen, die nicht teilnehmen konnten, können ihr Zertifikat über den Simulator erhalten. Nutzt dazu die Training App auf dem Tablet und absolviert den Kurs [Einführungstraining (Online-Kurs)](${course}).`;
  }
  return `Note for colleagues who missed the training\nColleagues who could not attend can still obtain certification through simulator training in the tablet app. They can complete the [Introductory Training Course](${course}).`;
}

export function renderMail(input: MailInput): RenderResult {
  const templates = parseTemplates(readTemplates());
  const templateId = chooseTemplateId(input);
  const template = templates[templateId];
  if (!template) throw new Error(`Template not found: ${templateId}`);

  let { subject, body } = extractSubjectAndBody(template);
  if (templateId.startsWith("pre_")) body = trimPretrainingDays(body, input.training_type);

  const catalog = (industryLinks.courses as Course[]) ?? [];
  const selected = inferIndustryCourseIds(input, catalog);

  const replacements: Record<string, string> = {
    ...(trainingLinks as Record<string, string>),
    RECIPIENT_NAME: input.recipient_name || "",
    COMPANY_NAME: input.company_name || "",
    TRAINING_DATE: input.date || "",
    LOCATION: input.location || "",
    CUSTOM_OPENER_NOTE: input.custom_opener_note || "",
    USEFUL_LINKS_BLOCK: buildUsefulLinksBlock(input.language, selected, input),
    INDUSTRY_TRAINING_BLOCK: buildIndustryTrainingBlock(input.language, selected, catalog),
    CERTIFICATION_NOTE_BLOCK: certificationNote(input.language, input.include_certification_note),
    SIMULATOR_NOTE_BLOCK: simulatorNote(input.language, input.include_simulator_note),
    COMPANY_CONTEXT_LINE: "",
  };

  subject = normalize(replacePlaceholders(subject, replacements)).trim();
  const markdownBody = replacePlaceholders(body, replacements);
  return {
    template_id: templateId,
    subject,
    body: normalize(stripMarkdownLinks(markdownBody)),
    html_body: markdownToHtml(markdownBody),
  };
}
