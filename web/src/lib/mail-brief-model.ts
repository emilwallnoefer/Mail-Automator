/**
 * The Claude models Brief mode may use, shared by the admin UI (dropdown),
 * the workspace-settings API (validation), and the generator (`mail-brief-llm`).
 * Plain constants only — safe to import from client and server. Every model
 * here must be compatible with the generator's call (adaptive thinking +
 * structured JSON output).
 */

export const DEFAULT_MAIL_BRIEF_MODEL = "claude-opus-4-8";

export const MAIL_BRIEF_MODELS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 — best prose (default)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 — faster & cheaper" },
] as const;

export type MailBriefModelId = (typeof MAIL_BRIEF_MODELS)[number]["id"];

export const MAIL_BRIEF_MODEL_IDS = MAIL_BRIEF_MODELS.map((m) => m.id) as readonly string[];

export function isMailBriefModel(value: unknown): value is MailBriefModelId {
  return typeof value === "string" && MAIL_BRIEF_MODEL_IDS.includes(value);
}
