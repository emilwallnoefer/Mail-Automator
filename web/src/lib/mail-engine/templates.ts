import fs from "node:fs";
import path from "node:path";
import type { MailInput } from "./types";

export function readTemplates(): string {
  const filePath = path.join(process.cwd(), "src/mail-config/training-email-templates.md");
  return fs.readFileSync(filePath, "utf-8");
}

export function parseTemplates(raw: string): Record<string, string> {
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

export function chooseTemplateId(input: MailInput): string {
  if (input.mail_type === "post") return `post_${input.language}`;
  if (!input.template_variant) throw new Error("template_variant required for pre templates");
  return `pre_${input.template_variant}_${input.language}`;
}

export function extractSubjectAndBody(templateText: string) {
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

/** Number of distinct names in the recipient field ("Marco" → 1, "Marco and Hans" → 2). */
export function recipientCount(raw: string): number {
  return (raw || "")
    .split(/\s*(?:,|&|\+|\/|\bund\b|\band\b|\bet\b)\s*/i)
    .map((t) => t.trim())
    .filter(Boolean).length;
}

/** Exactly one named recipient → write the mail in the singular (du / tu / "a trained pilot"). */
export function isSingularRecipient(raw: string): boolean {
  return recipientCount(raw) === 1;
}

/**
 * Resolves grammatical-number blocks in templates:
 *   {{#sg}}…{{/sg}} is kept only for a single recipient,
 *   {{#pl}}…{{/pl}} is kept only for multiple recipients.
 */
export function applyGrammaticalNumber(text: string, singular: boolean): string {
  return text
    .replace(/\{\{#sg\}\}([\s\S]*?)\{\{\/sg\}\}/g, singular ? "$1" : "")
    .replace(/\{\{#pl\}\}([\s\S]*?)\{\{\/pl\}\}/g, singular ? "" : "$1");
}

export function replacePlaceholders(text: string, replacements: Record<string, string>) {
  let result = text;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value ?? "");
  }
  return result;
}

export function normalize(text: string) {
  return (
    text
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}
