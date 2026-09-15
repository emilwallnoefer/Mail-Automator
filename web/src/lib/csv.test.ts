import { describe, expect, it } from "vitest";
import { csvResponse, toCsv } from "./csv";

/**
 * `escapeCsvCell` is not exported, so everything below goes through `toCsv`.
 * A single-cell row is written as `cell(value)` to keep the assertions readable.
 */
function cell(value: unknown): string {
  return toCsv(["h"], [[value]]).split("\r\n")[1];
}

describe("RFC 4180 shape", () => {
  it("joins header and rows with CRLF and commas", () => {
    expect(toCsv(["a", "b"], [["1", "2"], ["3", "4"]])).toBe("a,b\r\n1,2\r\n3,4");
  });

  it("writes a header-only file with no trailing newline", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b");
  });

  it("renders null and undefined as an empty cell, but keeps 0 and false", () => {
    expect(cell(null)).toBe("");
    expect(cell(undefined)).toBe("");
    expect(cell(0)).toBe("0");
    expect(cell(false)).toBe("false");
  });

  it("quotes cells containing a comma, quote, CR or LF", () => {
    expect(cell("Acme, Inc.")).toBe('"Acme, Inc."');
    expect(cell('He said "hi"')).toBe('"He said ""hi"""');
    expect(cell("line1\nline2")).toBe('"line1\nline2"');
    // A CRLF inside a cell survives as data — quoted, so it never reads as a
    // row break. (Asserted on the whole document: `cell` splits on CRLF.)
    expect(toCsv(["h"], [["line1\r\nline2"]])).toBe('h\r\n"line1\r\nline2"');
  });

  it("leaves ordinary text, unicode and negative numbers untouched", () => {
    expect(cell("Emil Wallnöfer")).toBe("Emil Wallnöfer");
    expect(cell("naïve — café 日本語 🙂")).toBe("naïve — café 日本語 🙂");
    expect(cell(-2.5)).toBe("-2.5");
    expect(cell("-120")).toBe("-120");
  });
});

describe("CSV injection", () => {
  // A spreadsheet evaluates a cell as a formula when it starts with =, +, - or @
  // (the last two are Lotus-compat), so each of those must be neutralised by the
  // leading apostrophe. Tab/CR can prefix a payload and are stripped by some
  // importers before the formula check, so they are defused too.
  it("defuses every formula-triggering prefix", () => {
    expect(cell("=1+1")).toBe("'=1+1");
    expect(cell("+1+1")).toBe("'+1+1");
    expect(cell("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
    expect(cell("-cmd|' /C calc'!A0")).toBe(`'-cmd|' /C calc'!A0`);
    // A tab needs no quoting (it is not a delimiter here), only the prefix.
    expect(cell("\t=1+1")).toBe("'\t=1+1");
    // A CR does need quoting on top, or it would break the row apart.
    expect(cell("\r=1+1")).toBe('"\'\r=1+1"');
  });

  it("defuses the classic DDE payloads, quoting on top where needed", () => {
    // Contains a comma, so it is both prefixed and quoted.
    expect(cell('=HYPERLINK("http://evil.example","click")')).toBe(
      `"'=HYPERLINK(""http://evil.example"",""click"")"`,
    );
    expect(cell("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
  });

  it("defuses a payload that hides behind a leading digit after the minus", () => {
    // `-1+cmd|…` is still a formula to Excel: the exemption for negative numbers
    // must apply to values that are a number *in full*, not merely start as one.
    expect(cell("-1+cmd|' /C calc'!A0")).toBe(`'-1+cmd|' /C calc'!A0`);
    expect(cell("-2h 30m")).toBe("'-2h 30m");
  });

  it("does not prefix a formula character that is not in the first position", () => {
    expect(cell("a=1+1")).toBe("a=1+1");
    expect(cell("2+2")).toBe("2+2");
  });

  it("prefixes before quoting, so the apostrophe stays inside the quotes", () => {
    const value = cell('=1,"2"');
    expect(value.startsWith(`"'=`)).toBe(true);
    expect(value).toBe(`"'=1,""2"""`);
  });

  it("escapes every cell of every row, not just the first", () => {
    expect(toCsv(["=h1", "h2"], [["ok", "=BAD()"]])).toBe("'=h1,h2\r\nok,'=BAD()");
  });
});

describe("csvResponse", () => {
  it("serves the body as a no-store attachment", async () => {
    const res = csvResponse("a,b\r\n1,2", "report.csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="report.csv"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("a,b\r\n1,2");
  });
});
