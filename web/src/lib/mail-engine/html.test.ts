import { describe, expect, it } from "vitest";
import { escapeHtmlText, markdownToHtml, safeAttrUrl, stripMarkdownLinks } from "./html";

describe("stripMarkdownLinks", () => {
  it("keeps link labels and image alt text", () => {
    expect(stripMarkdownLinks("see [docs](https://example.com/x)")).toBe("see docs");
    expect(stripMarkdownLinks("![Scan me](https://example.com/qr.png)")).toBe("Scan me");
    expect(stripMarkdownLinks("![](cid:feedback-qr)")).toBe("QR code");
  });
});

describe("escapeHtmlText", () => {
  it("escapes ampersands and angle brackets", () => {
    expect(escapeHtmlText("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });
});

describe("safeAttrUrl", () => {
  it("allows http(s) and rejects other schemes", () => {
    expect(safeAttrUrl("https://example.com/a?b=1&c=2")).toBe("https://example.com/a?b=1&amp;c=2");
    expect(safeAttrUrl("javascript:alert(1)")).toBe("");
    expect(safeAttrUrl("cid:x")).toBe("");
    expect(safeAttrUrl("cid:x", true)).toBe("cid:x");
  });
});

describe("markdownToHtml", () => {
  it("wraps output and renders headings, bold and links", () => {
    const html = markdownToHtml("## Title\n\n**bold** and [link](https://example.com)");
    expect(html.startsWith("<div")).toBe(true);
    expect(html).toContain("<h2");
    expect(html).toContain("font-weight:600");
    expect(html).toContain('<a href="https://example.com">link</a>');
  });

  it("collapses duplicate horizontal rules", () => {
    const html = markdownToHtml("a\n\n---\n\n---\n\nb");
    expect(html.match(/border-top:2px solid #ddd/g)?.length).toBe(1);
  });
});
