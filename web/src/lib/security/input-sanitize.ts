type TextSanitizeOptions = {
  maxLen?: number;
  allowNewlines?: boolean;
};

function stripControlChars(input: string) {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function sanitizeText(value: unknown, options: TextSanitizeOptions = {}) {
  const maxLen = options.maxLen ?? 500;
  const raw = String(value ?? "");
  const noControl = stripControlChars(raw);
  const normalizedNewlines = noControl.replace(/\r\n?/g, "\n");
  const collapsed = options.allowNewlines ? normalizedNewlines : normalizedNewlines.replace(/\s+/g, " ");
  return collapsed.trim().slice(0, maxLen);
}

export function sanitizeNullableText(value: unknown, options: TextSanitizeOptions = {}) {
  const cleaned = sanitizeText(value, options);
  return cleaned || undefined;
}

export function sanitizeEmailList(value: unknown, maxLen = 500) {
  const cleaned = sanitizeText(value, { maxLen });
  if (!cleaned) return undefined;
  const emails = cleaned
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry));
  return emails.length > 0 ? emails.join(", ") : undefined;
}

export function sanitizeColumnLetter(value: unknown) {
  const text = sanitizeText(value, { maxLen: 5 }).toUpperCase();
  if (!text) return "";
  if (!/^[A-Z]+$/.test(text)) return "";
  return text;
}
