export function stripMarkdownLinks(text: string) {
  return text
    .replace(/!\[([^\]]*)\]\((?:https?:\/\/[^)]+|cid:[^)]+)\)/g, (_m, alt) => String(alt || "").trim() || "QR code")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1");
}

export function escapeHtmlText(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Escape a URL for safe use inside an HTML attribute, and only allow http(s)/cid schemes. Returns "" if the scheme is not allowed. */
export function safeAttrUrl(raw: string, allowCid = false): string {
  const url = String(raw ?? "").trim();
  const ok = /^https?:\/\//i.test(url) || (allowCid && /^cid:/i.test(url));
  if (!ok) return "";
  return url
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
  c = c.replace(/!\[([^\]]*)\]\(([^)\s"]+)\)/g, (_m, alt, url) => {
    const safeAlt = escapeHtmlText(String(alt ?? ""));
    const src = safeAttrUrl(String(url), /*allowCid*/ true);
    if (!src) return safeAlt;
    return `<img src="${src}" alt="${safeAlt}" style="max-width:240px;height:auto;display:block;margin-top:10px;border:0;" />`;
  });
  c = c.replace(/\*\*([^*]+)\*\*/g, (_m, inner) => {
    return `<span style="font-weight:600;color:#222;">${escapeHtmlText(inner)}</span>`;
  });
  c = c.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s"]+)\)/g, (_m, label, url) => {
    const href = safeAttrUrl(String(url));
    if (!href) return escapeHtmlText(label);
    return `<a href="${href}">${escapeHtmlText(label)}</a>`;
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
export function markdownToHtml(text: string) {
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
