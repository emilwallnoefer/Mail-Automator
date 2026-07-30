import type { MailLanguage } from "@/lib/change-options";

/**
 * Brief mode renders its own greeting line ("Hallo <names>,") ahead of the model's `opener`.
 * The prompt tells the model not to repeat it, but it regularly does anyway — either as its own
 * line, or inline at the head of the first sentence ("Hallo Roger, hallo Christoph, die Schulung…").
 * Both produce a visibly duplicated welcome line, so we strip it deterministically here instead of
 * trusting the instruction.
 */

/** Greeting openers we recognise. Kept language-agnostic: the model occasionally mixes languages. */
const GREETING_WORDS = [
  // English
  "hello",
  "hi",
  "hey",
  "dear",
  "good morning",
  "good afternoon",
  "good evening",
  // German
  "hallo",
  "moin",
  "servus",
  "grüezi",
  "gruezi",
  "guten morgen",
  "guten tag",
  "guten abend",
  "liebe",
  "lieber",
  "liebes",
  "sehr geehrte",
  "sehr geehrter",
  // French
  "bonjour",
  "bonsoir",
  "salut",
  "coucou",
  "cher",
  "chère",
  "chere",
  "chers",
  "chères",
  "cheres",
];

const GREETING_HEAD = new RegExp(
  `^(?:${GREETING_WORDS.map((word) => word.replace(/ /g, "\\s+")).join("|")})\\b`,
  "iu",
);

/**
 * How many characters of recipient names may follow a greeting word. A cap is what keeps a normal
 * sentence that merely opens with a greeting word ("Hello was the first thing they said, …") from
 * being mistaken for a greeting and swallowed.
 */
const MAX_NAME_LENGTH = 60;

/** Ends a greeting: "Hallo Roger," / "Hey Roger!" / "Dear Roger:". */
const GREETING_TERMINATORS = new Set([",", "!", ":"]);
/** Ends a sentence, so what we were scanning was prose, not a greeting. */
const SENTENCE_TERMINATORS = new Set([".", "?", ";"]);

/**
 * Scans the recipient-name span after a greeting word and returns the index just past its
 * terminator, or -1 when this isn't a greeting after all.
 */
function findGreetingEnd(text: string): number {
  for (let i = 0; i < text.length && i <= MAX_NAME_LENGTH; i += 1) {
    const char = text[i];
    if (char === "\n") return i + 1;
    if (GREETING_TERMINATORS.has(char)) return i + 1;
    if (SENTENCE_TERMINATORS.has(char)) {
      // A dot closing a short word followed by more text is an abbreviated title
      // ("Dear Ms. Schmid,", "Hallo Dr. Weber,"), not the end of a sentence.
      if (char === "." && isAbbreviationDot(text, i)) continue;
      return -1;
    }
  }
  return -1;
}

function isAbbreviationDot(text: string, index: number): boolean {
  if (!/[ \t]/.test(text[index + 1] ?? "")) return false;
  const word = /(\p{L}+)$/u.exec(text.slice(0, index));
  return word != null && word[1].length <= 5;
}

/**
 * German mail convention (and every German template in `training-email-templates.md`) continues
 * the sentence in lower case after the greeting comma, so only English and French get re-capitalised
 * when stripping exposes a lower-case first letter.
 */
const CAPITALIZE_AFTER_GREETING: Record<MailLanguage, boolean> = { en: true, de: false, fr: true };

/**
 * Removes a greeting the model prepended to its own prose, including the repeated form
 * ("Hallo Roger, hallo Christoph,"). Returns the text unchanged when it doesn't start with one.
 */
export function stripLeadingGreeting(text: string, language: MailLanguage): string {
  let rest = text.trim();
  let stripped = false;

  // Loop so each greeting of a repeated form is consumed in turn.
  for (;;) {
    const head = GREETING_HEAD.exec(rest);
    if (!head) break;
    const end = findGreetingEnd(rest.slice(head[0].length));
    if (end < 0) break;
    rest = rest.slice(head[0].length + end).trimStart();
    stripped = true;
  }

  if (!stripped || !rest) return stripped ? "" : rest;
  if (!CAPITALIZE_AFTER_GREETING[language]) return rest;
  return rest[0].toUpperCase() + rest.slice(1);
}
