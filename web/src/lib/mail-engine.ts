/**
 * Public entry point for the mail rendering engine. The implementation is split
 * into cohesive modules under `mail-engine/`:
 *   - `templates.ts` — template parsing + placeholder / grammatical-number rendering
 *   - `links.ts`     — link / course policy + resource-section block assembly + notes
 *   - `html.ts`      — minimal markdown → email-safe HTML
 *   - `render.ts`    — `renderMail` / `renderBriefMail` orchestration
 * This file preserves the original public API so importers (and the existing
 * tests) keep working unchanged.
 */
export type {
  BriefRenderInput,
  MailInlineAttachment,
  MailInput,
  PostTrainingType,
  RenderResult,
} from "./mail-engine/types";
export { recipientCount } from "./mail-engine/templates";
export { renderBriefMail, renderMail } from "./mail-engine/render";
