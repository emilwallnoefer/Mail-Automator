import fs from "node:fs";
import path from "node:path";
import {
  CHANGE_OPTIONS,
  DEFAULT_INCLUDED_CHANGE_IDS,
  RESOURCE_SECTION_OMIT_EMAIL_SUBHEADING,
  RESOURCE_SECTION_ORDER,
  getChangeOptionLabelDesc,
  getOtherTrainingsOptionsInOrder,
  getThinkificOnlineCoursesInOrder,
  resourceSectionEmailIntro,
  resourceSectionLabel,
  type MailLanguage,
  type ResourceSectionId,
} from "@/lib/change-options";
import industryLinks from "@/mail-config/industry-training-links.json";
import trainingLinks from "@/mail-config/training-links.json";
import usefulLinksPolicy from "@/mail-config/useful-links-policy.json";
import { MAIL_SIGNATURE_DEFAULT_NAME } from "@/lib/mail-signature-presets";

export type MailInput = {
  mail_type: "pre" | "post";
  template_variant?: "lausanne" | "abroad";
  language: MailLanguage;
  training_type?: "intro_1day" | "aiim_3day";
  recipient_name: string;
  recipient_optional?: string;
  company_name: string;
  use_case?: string;
  date: string;
  location: string;
  custom_opener_note?: string;
  industry_course_ids?: string;
  include_certification_note?: boolean;
  include_simulator_note?: boolean;
  include_customer_toolkit?: boolean;
  company_research_text?: string;
  included_change_ids?: string[];
  /** Shown in the template closing; defaults in renderMail when omitted. */
  signature_name?: string;
};

export type MailInlineAttachment = {
  contentId: string;
  mimeType: string;
  base64: string;
};

export type RenderResult = {
  template_id: string;
  subject: string;
  body: string;
  html_body: string;
  /** For Gmail: inline PNG so <img src="cid:…"> resolves without a public URL. */
  inline_attachments?: MailInlineAttachment[];
};

type Course = {
  id: string;
  label_en: string;
  label_de: string;
  label_fr?: string;
  url: string;
  keywords: string[];
};

function resolveLinkUrl(linkKey: string, catalog: Course[]) {
  const links = trainingLinks as Record<string, string>;
  const url = links[linkKey];
  if (url) return url;

  // Fallback for UT deck when dedicated deck link is not configured.
  if (linkKey === "INTRO_UT_TRAINING_URL") {
    const utCourse = catalog.find((course) => course.id === "elios3_ut");
    return utCourse?.url ?? "";
  }
  return "";
}

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
  return text
    .replace(/!\[([^\]]*)\]\((?:https?:\/\/[^)]+|cid:[^)]+)\)/g, (_m, alt) => String(alt || "").trim() || "QR code")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1");
}

function escapeHtmlText(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Gmail renders table/div borders more reliably than <hr> in some clients. */
const EMAIL_HR =
  '<div style="height:0;line-height:0;font-size:0;border-top:2px solid #ddd;margin:20px 0;clear:both;">&nbsp;</div>';

const EMAIL_WRAPPER_OPEN =
  '<div style="font-size:14px;line-height:1.55;color:#222;max-width:640px;font-family:Arial,Helvetica,sans-serif;">';
const EMAIL_WRAPPER_CLOSE = "</div>";

function isMarkdownHorizontalRule(line: string) {
  const t = line.trim();
  return /^(\*{3,}|_{3,}|-{3,})$/.test(t);
}

function formatHeading2(text: string) {
  return `<h2 style="font-size:22px;font-weight:700;line-height:1.25;margin:22px 0 10px;color:#111;">${escapeHtmlText(text)}</h2>`;
}

function formatHeading3(text: string) {
  return `<h3 style="font-size:20px;font-weight:700;line-height:1.3;margin:18px 0 8px;color:#111;">${escapeHtmlText(text)}</h3>`;
}

/** One markdown block (split on blank lines). */
function markdownBlockToHtml(chunk: string): string {
  const trimmed = chunk.trim();
  if (!trimmed) return "";

  if (isMarkdownHorizontalRule(trimmed)) return EMAIL_HR;

  const h3 = trimmed.match(/^###\s+(.+)$/);
  if (h3 && !trimmed.includes("\n")) return formatHeading3(h3[1]!.trim());

  const h2 = trimmed.match(/^##\s+(.+)$/);
  if (h2 && !trimmed.includes("\n")) return formatHeading2(h2[1]!.trim());

  let c = trimmed;
  c = c.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
    const safeAlt = escapeHtmlText(String(alt ?? ""));
    const src = String(url).trim();
    return `<img src="${src}" alt="${safeAlt}" style="max-width:240px;height:auto;display:block;margin-top:10px;border:0;" />`;
  });
  c = c.replace(/\*\*([^*]+)\*\*/g, (_m, inner) => {
    return `<span style="font-weight:600;color:#222;">${escapeHtmlText(inner)}</span>`;
  });
  c = c.replace(/(➡️\s*)\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_m, prefix, label, url) => {
    return `${prefix}<a href="${url}" style="font-size:17px;font-weight:600;color:#111;text-decoration:underline;">${escapeHtmlText(label)}</a>`;
  });
  c = c.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_m, label, url) => {
    return `<a href="${url}">${escapeHtmlText(label)}</a>`;
  });
  const parts = c.split(/(<[^>]+>)/);
  const merged = parts
    .map((part) => {
      if (part.startsWith("<")) return part;
      return escapeHtmlText(part);
    })
    .join("");
  return `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#222;">${merged.replaceAll("\n", "<br>")}</p>`;
}

/** Minimal markdown: ## / ### headings, **bold**, links, images (https or cid:), --- horizontal rules. */
function markdownToHtml(text: string) {
  let inner = text
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((p) => markdownBlockToHtml(p))
    .join("\n");
  const dup = `${EMAIL_HR}\n${EMAIL_HR}`;
  while (inner.includes(dup)) {
    inner = inner.replaceAll(dup, EMAIL_HR);
  }
  return EMAIL_WRAPPER_OPEN + inner + EMAIL_WRAPPER_CLOSE;
}

function resolvePublicAssetUrl(pathOrUrl: string): string {
  const raw = pathOrUrl.trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) {
    const base =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
    if (base) return `${base}${raw}`;
  }
  return raw;
}

function resolveFeedbackQr(input: MailInput): { url: string; attachment?: MailInlineAttachment } {
  const links = trainingLinks as Record<string, string>;
  if (input.mail_type !== "post") {
    return { url: resolvePublicAssetUrl(links.FEEDBACK_QR_IMAGE_URL ?? "") };
  }
  const qrPath = path.join(process.cwd(), "public", "feedback-training-qr.png");
  try {
    if (fs.existsSync(qrPath)) {
      return {
        url: "cid:flyability-feedback-qr",
        attachment: {
          contentId: "flyability-feedback-qr",
          mimeType: "image/png",
          base64: fs.readFileSync(qrPath).toString("base64"),
        },
      };
    }
  } catch {
    /* ignore */
  }
  return { url: resolvePublicAssetUrl(links.FEEDBACK_QR_IMAGE_URL ?? "") };
}

function parseIndustryIds(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function resolveIncludedChangeIds(input: MailInput) {
  const explicit = (input.included_change_ids ?? []).filter(Boolean);
  if (explicit.length > 0) return explicit;
  return DEFAULT_INCLUDED_CHANGE_IDS;
}

/** Canonical section titles (emoji + wording) aligned with internal recap style. */
function trainingMaterialsHeading(lang: MailLanguage) {
  if (lang === "de") return "## 📂 Trainings-Folien";
  if (lang === "fr") return "## 📂 Diaporamas de formation";
  return "## 📂 Training slide decks";
}

function buildTrainingMaterialsBlock(language: MailLanguage, selectedChangeIds: string[]) {
  const selected = new Set(selectedChangeIds);
  const links = trainingLinks as Record<string, string>;
  const materialOptions = CHANGE_OPTIONS.filter((opt) => opt.category === "training_material");
  const rows: string[] = [];
  for (const item of materialOptions) {
    if (!selected.has(item.id)) continue;
    const linkKey = item.link_key ?? "";
    const url = links[linkKey];
    if (!url) continue;
    const { label, desc } = getChangeOptionLabelDesc(item, language);
    rows.push(`➡️ [${label}](${url})`);
    rows.push(withCallout(language, desc, "callout"));
    rows.push("");
  }

  if (rows.length === 0) {
    return "";
  }
  return `${trainingMaterialsHeading(language)}\n\n${rows.join("\n").trim()}`;
}

function inferIndustryCourseIds(input: MailInput, catalog: Course[]) {
  const explicit = parseIndustryIds(input.industry_course_ids);
  if (explicit.length) return explicit;

  const source = [
    input.company_name,
    input.use_case ?? "",
    input.company_research_text ?? "",
    input.custom_opener_note ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return catalog
    .filter((course) => course.keywords.some((kw) => source.includes(kw.toLowerCase())))
    .map((course) => course.id);
}

function industryTrainingBlockTitle(lang: MailLanguage) {
  if (lang === "de") return "## 📋 Use-Case-spezifische Trainings und Unterlagen";
  if (lang === "fr") return "## 📋 Formations et documents spécifiques au cas d'usage";
  return "## 📋 Use-case specific trainings and docs";
}

function courseDisplayLabel(course: Course, lang: MailLanguage) {
  if (lang === "de") return course.label_de;
  if (lang === "fr") return course.label_fr ?? course.label_en;
  return course.label_en;
}

function buildIndustryTrainingBlock(language: MailLanguage, selectedIds: string[], catalog: Course[]) {
  if (!selectedIds.length) return "";
  const byId = new Map(catalog.map((course) => [course.id, course]));
  const lines = [industryTrainingBlockTitle(language)];

  for (const id of selectedIds) {
    const course = byId.get(id);
    if (!course) continue;
    const label = courseDisplayLabel(course, language);
    lines.push(`➡️ [${label}](${course.url})`);
  }
  return lines.length > 1 ? `${lines[0]}\n\n${lines.slice(1).join("\n")}` : "";
}

function usefulLinksMainHeader(lang: MailLanguage) {
  if (lang === "de") return "## 🔗 Weitere nützliche Links";
  if (lang === "fr") return "## 🔗 Autres liens utiles";
  return "## 🔗 Software & learning resources";
}

/** One line of copy after a linked asset (no prefix). `kind` kept for callers; both paths use the same output. */
function withCallout(_lang: MailLanguage, desc: string, _kind: "callout" | "plain"): string {
  const t = desc.trim();
  return t;
}

function policyItemLabelDesc(item: Record<string, unknown>, lang: MailLanguage) {
  if (lang === "de") {
    return { label: String(item.label_de ?? ""), desc: String(item.desc_de ?? "") };
  }
  if (lang === "fr") {
    return {
      label: String(item.label_fr ?? item.label_en ?? ""),
      desc: String(item.desc_fr ?? item.desc_en ?? ""),
    };
  }
  return { label: String(item.label_en ?? ""), desc: String(item.desc_en ?? "") };
}

function buildUsefulLinksBlock(language: MailLanguage, selectedIds: string[], input: MailInput) {
  const policy = usefulLinksPolicy as {
    common: Array<Record<string, unknown>>;
    conditional: Array<Record<string, unknown>>;
  };
  const links = trainingLinks as Record<string, string>;
  const lines: string[] = [usefulLinksMainHeader(language)];

  const addItem = (item: Record<string, unknown>) => {
    const linkKey = String(item.link_key ?? "");
    const url = links[linkKey];
    if (!url) return;
    const { label, desc } = policyItemLabelDesc(item, language);
    lines.push(`➡️ [${label}](${url})`);
    lines.push(withCallout(language, desc, "callout"));
    lines.push("");
  };

  policy.common.forEach(addItem);
  policy.conditional.forEach((item) => {
    const required = new Set((item.industry_course_ids as string[] | undefined) ?? []);
    const includeFlag = String(item.include_flag ?? "");
    const includeByFlag = includeFlag ? Boolean((input as Record<string, unknown>)[includeFlag]) : false;
    const includeByIndustry = [...required].some((id) => selectedIds.includes(id));
    if (includeByFlag || includeByIndustry) addItem(item);
  });

  return lines.length > 1 ? `${lines[0]}\n\n${lines.slice(1).join("\n")}` : "";
}

function buildUsefulLinksBlockFromChanges(language: MailLanguage, selectedChangeIds: string[]) {
  const selected = new Set(selectedChangeIds);
  const catalog = (industryLinks.courses as Course[]) ?? [];
  const header = usefulLinksMainHeader(language);

  const bySection = new Map<ResourceSectionId, typeof CHANGE_OPTIONS>();
  for (const opt of CHANGE_OPTIONS) {
    if (opt.category !== "useful_link" || !selected.has(opt.id)) continue;
    const sec = opt.resourceSection;
    if (!sec) continue;
    if (!bySection.has(sec)) bySection.set(sec, []);
    bySection.get(sec)!.push(opt);
  }

  const parts: string[] = [header, ""];

  function resolveOnlineItemUrl(item: (typeof CHANGE_OPTIONS)[number]): string {
    if (item.category === "thinkific") return item.url ?? "";
    return resolveLinkUrl(item.link_key ?? "", catalog);
  }

  for (const sectionId of RESOURCE_SECTION_ORDER) {
    if (sectionId === "other_trainings") {
      const ordered = getOtherTrainingsOptionsInOrder().filter((opt) => selected.has(opt.id));
      const withUrl = ordered.filter((item) => resolveLinkUrl(item.link_key ?? "", catalog));
      if (!withUrl.length) continue;

      parts.push(`### ${resourceSectionLabel(sectionId, language)}`);
      parts.push("");

      for (const item of withUrl) {
        const url = resolveLinkUrl(item.link_key ?? "", catalog);
        const { label, desc } = getChangeOptionLabelDesc(item, language);
        parts.push(`➡️ [${label}](${url})`);
        parts.push(withCallout(language, desc, "callout"));
        parts.push("");
      }
      continue;
    }

    if (sectionId === "online_courses") {
      const ordered = getThinkificOnlineCoursesInOrder().filter((opt) => selected.has(opt.id));
      const withUrl = ordered.filter((item) => resolveOnlineItemUrl(item));
      if (!withUrl.length) continue;

      parts.push(`### ${resourceSectionLabel(sectionId, language)}`);
      parts.push("");

      for (const item of withUrl) {
        const url = resolveOnlineItemUrl(item);
        const { label, desc } = getChangeOptionLabelDesc(item, language);
        parts.push(`➡️ [${label}](${url})`);
        parts.push(withCallout(language, desc, item.category === "thinkific" ? "plain" : "callout"));
        parts.push("");
      }
      continue;
    }

    const items = bySection.get(sectionId);
    const withUrl = items?.filter((item) => resolveLinkUrl(item.link_key ?? "", catalog)) ?? [];

    if (!withUrl.length) continue;

    if (!RESOURCE_SECTION_OMIT_EMAIL_SUBHEADING.has(sectionId)) {
      const sectionTitle = resourceSectionLabel(sectionId, language);
      parts.push(`### ${sectionTitle}`);
      parts.push("");
      const sectionIntro = resourceSectionEmailIntro(sectionId, language);
      if (sectionIntro) {
        parts.push(sectionIntro);
        parts.push("");
      }
    }

    const videoSection = sectionId === "videos";
    for (const item of withUrl) {
      const url = resolveLinkUrl(item.link_key ?? "", catalog);
      const { label, desc } = getChangeOptionLabelDesc(item, language);
      parts.push(`➡️ [${label}](${url})`);
      parts.push(withCallout(language, desc, videoSection ? "plain" : "callout"));
      parts.push("");
    }
  }

  const body = parts.join("\n").replace(/\n+$/, "");
  const hasContent = RESOURCE_SECTION_ORDER.some((id) => {
    if (id === "online_courses") {
      return getThinkificOnlineCoursesInOrder().some((item) => {
        if (!selected.has(item.id)) return false;
        return Boolean(resolveOnlineItemUrl(item));
      });
    }
    if (id === "other_trainings") {
      return getOtherTrainingsOptionsInOrder().some((item) => {
        if (!selected.has(item.id)) return false;
        return Boolean(resolveLinkUrl(item.link_key ?? "", catalog));
      });
    }
    const items = bySection.get(id);
    if (!items?.length) return false;
    return items.some((item) => resolveLinkUrl(item.link_key ?? "", catalog));
  });
  return hasContent ? body : "";
}

function certificationNote(language: MailLanguage, enabled?: boolean) {
  if (!enabled) return "";
  if (language === "de") {
    return "## Zertifizierungshinweis\n\nEs freut mich, euch mitzuteilen, dass ihr das Training erfolgreich absolviert habt. Die Zertifikate dienen als offizieller Nachweis in unserer Datenbank, dass ihr ausgebildete Piloten seid.";
  }
  if (language === "fr") {
    return "## Note sur la certification\n\nJe suis heureux de vous confirmer que vous avez terminé la formation avec succès. Vos certificats font foi officiellement dans nos dossiers : vous êtes des pilotes formés.";
  }
  return "## Certification note\n\nI am happy to confirm that you successfully completed the training. Your certificates act as official proof in our records that you are trained pilots.";
}

function simulatorNote(language: MailLanguage, enabled?: boolean) {
  if (!enabled) return "";
  const course = "https://flyabilityacademy.thinkific.com/courses/Introductorytrainingcourse";
  if (language === "de") {
    return `## Hinweis für Kollegen ohne Trainingsteilnahme\n\nKollegen, die nicht teilnehmen konnten, können ihr Zertifikat über den Simulator erhalten. Nutzt dazu die Training App auf dem Tablet und absolviert den Kurs [Einführungstraining (Online-Kurs)](${course}).`;
  }
  if (language === "fr") {
    return `## Note pour les collègues n'ayant pas pu participer\n\nLes collègues absents peuvent tout de même obtenir leur certification via le simulateur dans l'application tablette. Ils peuvent suivre la [formation d'introduction (cours en ligne)](${course}).`;
  }
  return `## Note for colleagues who missed the training\n\nColleagues who could not attend can still obtain certification through simulator training in the tablet app. They can complete the [Introductory Training Course](${course}).`;
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
  const includedChangeIds = resolveIncludedChangeIds(input);

  const links = trainingLinks as Record<string, string>;
  const feedbackQr = resolveFeedbackQr(input);
  const replacements: Record<string, string> = {
    ...links,
    FEEDBACK_QR_IMAGE_URL: feedbackQr.url,
    RECIPIENT_NAME: input.recipient_name || "",
    RECIPIENT_OPTIONAL: input.recipient_optional || "",
    COMPANY_NAME: input.company_name || "",
    TRAINING_DATE: input.date || "",
    LOCATION: input.location || "",
    CUSTOM_OPENER_NOTE: input.custom_opener_note || "",
    TRAINING_MATERIALS_BLOCK: buildTrainingMaterialsBlock(input.language, includedChangeIds),
    USEFUL_LINKS_BLOCK:
      input.included_change_ids && input.included_change_ids.length > 0
        ? buildUsefulLinksBlockFromChanges(input.language, includedChangeIds)
        : buildUsefulLinksBlock(input.language, selected, input),
    INDUSTRY_TRAINING_BLOCK:
      input.included_change_ids && input.included_change_ids.length > 0
        ? ""
        : buildIndustryTrainingBlock(input.language, selected, catalog),
    CERTIFICATION_NOTE_BLOCK: certificationNote(input.language, input.include_certification_note),
    SIMULATOR_NOTE_BLOCK: simulatorNote(input.language, input.include_simulator_note),
    COMPANY_CONTEXT_LINE: "",
    SIGNATURE_NAME: (input.signature_name && input.signature_name.trim()) || MAIL_SIGNATURE_DEFAULT_NAME,
  };

  subject = normalize(replacePlaceholders(subject, replacements)).trim();
  const markdownBody = replacePlaceholders(body, replacements);
  return {
    template_id: templateId,
    subject,
    body: normalize(stripMarkdownLinks(markdownBody)),
    html_body: markdownToHtml(markdownBody),
    inline_attachments: feedbackQr.attachment ? [feedbackQr.attachment] : undefined,
  };
}
