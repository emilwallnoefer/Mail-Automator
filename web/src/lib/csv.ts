/**
 * Minimal, dependency-free CSV serialization for admin exports.
 *
 * Cells are quoted when they contain a comma, quote, CR, or LF, and inner
 * quotes are doubled per RFC 4180. Cells that a spreadsheet could interpret as
 * a formula (leading `=`, `+`, `@`, tab/CR, or a `-` not starting a number)
 * are prefixed with a single quote to defuse CSV-injection attacks.
 */
function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  let str = String(value);
  const injectable =
    /^[=+@\t\r]/.test(str) || (str[0] === "-" && !/^-\d/.test(str));
  if (injectable) str = `'${str}`;
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** Build an RFC 4180 CSV string (CRLF line endings) from headers + rows. */
export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCsvCell).join(","));
  return lines.join("\r\n");
}

/** Wrap CSV text in a downloadable `text/csv` response (attachment). */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
