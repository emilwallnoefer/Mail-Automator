import "server-only";

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CHANGE_OPTIONS, type MailLanguage } from "@/lib/change-options";
import { DEFAULT_MAIL_BRIEF_MODEL, isMailBriefModel } from "@/lib/mail-brief-model";

/**
 * Brief mode: instead of the structured selection form, a pilot writes a free-text brief
 * (client, which assets to include, what was special about the training). Claude Opus 4.8
 * writes the human prose AND picks which asset IDs to include; the deterministic engine
 * (`renderBriefMail`) then renders the real click-tracked link blocks. The model never
 * emits or formats links, so tracking can never break — see `renderBriefMail`.
 */

/**
 * Chooses the model, in order: the admin workspace setting (`explicit`), then the
 * `MAIL_BRIEF_MODEL` env var, then the built-in default (Opus 4.8). Anything not on
 * the allowlist is ignored so a stale value can never send an unsupported model.
 */
function resolveModel(explicit?: string | null): string {
  if (isMailBriefModel(explicit)) return explicit;
  const env = (process.env.MAIL_BRIEF_MODEL ?? "").trim();
  if (isMailBriefModel(env)) return env;
  return DEFAULT_MAIL_BRIEF_MODEL;
}

/** Structured JSON the model must return. All fields required, no extras (structured-output rules). */
export const briefLlmResultSchema = z.object({
  subject: z.string(),
  opener: z.string(),
  recap_intro: z.string(),
  feedback_ask: z.string(),
  closing: z.string(),
  selected_change_ids: z.array(z.string()),
});

export type BriefLlmResult = z.infer<typeof briefLlmResultSchema>;

export type BriefLlmInput = {
  language: MailLanguage;
  recipient_name: string;
  /** The pilot's free-text brief: client, assets to include, what was special about the training. */
  brief: string;
  /** How many named recipients (drives singular/plural phrasing). */
  recipient_count: number;
  /** Whether a collected-data download link will be attached (so the model can mention it). */
  has_datasets_link: boolean;
  /** Admin-selected model (workspace setting); falls back to env / default when unset or invalid. */
  model?: string | null;
};

/** JSON Schema handed to the API. Kept in sync with `briefLlmResultSchema`. */
const OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "opener", "recap_intro", "feedback_ask", "closing", "selected_change_ids"],
  properties: {
    subject: { type: "string", description: "Email subject line. Plain text, no emoji." },
    opener: {
      type: "string",
      description:
        "The warm opening paragraph(s) after the greeting. Reference the client and what was special about the training. Do NOT repeat the greeting line.",
    },
    recap_intro: {
      type: "string",
      description: "One or two sentences that introduce the training materials and links listed below.",
    },
    feedback_ask: {
      type: "string",
      description:
        "A short, friendly ask for the recipient to scan the QR code below and leave quick feedback. Do not include the QR image itself.",
    },
    closing: {
      type: "string",
      description:
        "A brief sign-off sentiment before the signature (e.g. wishing success on their inspections, offering help). Do NOT write 'Best regards' or the name — those are added automatically.",
    },
    selected_change_ids: {
      type: "array",
      items: { type: "string" },
      description: "IDs chosen ONLY from the provided asset catalog. Never invent IDs.",
    },
  },
} as const;

let cachedTemplates: string | null = null;
function readTemplates(): string {
  if (cachedTemplates == null) {
    const filePath = path.join(process.cwd(), "src/mail-config/training-email-templates.md");
    cachedTemplates = fs.readFileSync(filePath, "utf-8");
  }
  return cachedTemplates;
}

/** Compact, stable listing of the asset catalog the model may choose from (English, for meaning). */
let cachedCatalog: string | null = null;
function assetCatalogText(): string {
  if (cachedCatalog == null) {
    cachedCatalog = CHANGE_OPTIONS.map((opt) => {
      const desc = (opt.desc_en || "").split("\n")[0]?.trim() ?? "";
      return `- ${opt.id} [${opt.category}] ${opt.label_en}${desc ? ` — ${desc}` : ""}`;
    }).join("\n");
  }
  return cachedCatalog;
}

const LANGUAGE_LABEL: Record<MailLanguage, string> = {
  en: "English",
  de: "German",
  fr: "French",
};

function buildSystemPrompt(): string {
  return [
    "You are Emil, a Flyability pilot and trainer, writing the follow-up recap email a customer receives after an on-site Elios 3 drone training.",
    "",
    "Your job: turn the pilot's short brief into a warm, natural, human-sounding recap email. It must read like a real person wrote it — not like a generated template. Vary sentence structure; be specific to what the brief says was special about this training; avoid corporate filler and avoid obvious AI tells (no emoji headings, no bullet-point-everything, no over-bolding).",
    "",
    "Ground your tone and structure in the reference templates below, but do NOT copy them verbatim — rewrite in a fresh, personal voice for this specific customer.",
    "",
    "CRITICAL — links are handled outside your output:",
    "- Do NOT write, invent, format, or paraphrase any URLs or asset links. The system inserts the real click-tracked links after you.",
    "- Instead, choose which assets to include by returning their IDs in `selected_change_ids`, picking ONLY from the asset catalog below. Base the choice on what the brief says (client industry, payloads/methods used, what was covered). Include the core onboarding materials plus anything relevant to what was special.",
    "",
    "Return only the requested JSON fields. Write `opener`, `recap_intro`, `feedback_ask`, and `closing` prose; do not include the greeting line, the QR image, the 'Best regards' line, or the signature name — the system adds those.",
    "",
    "=== REFERENCE TEMPLATES (for tone/structure only) ===",
    readTemplates(),
    "",
    "=== ASSET CATALOG (choose selected_change_ids only from these) ===",
    assetCatalogText(),
  ].join("\n");
}

function buildUserPrompt(input: BriefLlmInput): string {
  const number = input.recipient_count <= 1 ? "singular (one recipient)" : "plural (multiple recipients)";
  return [
    `Write the recap email in ${LANGUAGE_LABEL[input.language]}.`,
    `Recipient name(s): ${input.recipient_name}`,
    `Grammatical number: ${number}.`,
    input.has_datasets_link
      ? "A download link for the flight data collected during the training WILL be attached by the system — you may reference it briefly in the closing, but do not write the link."
      : "No collected-data download link is attached; do not mention one.",
    "",
    "Pilot's brief:",
    input.brief,
  ].join("\n");
}

const VALID_IDS = new Set(CHANGE_OPTIONS.map((opt) => opt.id));

function extractJsonText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

/**
 * Calls Opus 4.8 to draft the brief-mode email. Returns validated prose + asset IDs.
 * `selected_change_ids` are filtered to the known catalog before returning, so a hallucinated
 * ID can never reach the renderer.
 */
export async function generateBriefDraft(input: BriefLlmInput): Promise<BriefLlmResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured; Brief mode is unavailable.");
  }

  const client = new Anthropic();

  const message = await client.messages.create({
    // Roomy budget so adaptive-thinking tokens can't crowd out the JSON body and truncate it.
    model: resolveModel(input.model),
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    // Stable prefix (system + templates + catalog) is cached; the per-email brief is the volatile suffix.
    system: [
      {
        type: "text",
        text: buildSystemPrompt(),
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: OUTPUT_JSON_SCHEMA },
    },
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });

  if (message.stop_reason === "refusal") {
    throw new Error("The model declined to generate this email. Please revise the brief.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("The email was too long to finish. Please shorten the brief and try again.");
  }

  const jsonText = extractJsonText(message);
  if (!jsonText) {
    throw new Error("The model returned no usable content.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("The model returned malformed output. Please try again.");
  }

  const result = briefLlmResultSchema.parse(parsed);

  return {
    ...result,
    selected_change_ids: result.selected_change_ids.filter((id) => VALID_IDS.has(id)),
  };
}
