import { google } from "googleapis";

export type TravelInfo = {
  client: string;
  location: string;
  responsible: string;
};

const DEFAULT_MONTH_YEAR_COLUMN = "A";
const DEFAULT_DAY_COLUMN = "C";
const DEFAULT_CLIENT_COLUMN = "P";
const DEFAULT_LOCATION_COLUMN = "Q";
const DEFAULT_RESPONSIBLE_COLUMN = "R";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function getFirstEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return "";
}

type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function collectOAuthCandidates() {
  const candidates: OAuthConfig[] = [];
  const pushIfComplete = (clientId: string, clientSecret: string, redirectUri: string) => {
    if (!clientId || !clientSecret || !redirectUri) return;
    const duplicate = candidates.some(
      (item) =>
        item.clientId === clientId &&
        item.clientSecret === clientSecret &&
        item.redirectUri === redirectUri,
    );
    if (!duplicate) candidates.push({ clientId, clientSecret, redirectUri });
  };

  // Prefer the main Gmail OAuth client first because the stored refresh token comes from Gmail connect flow.
  pushIfComplete(
    process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    process.env.GOOGLE_OAUTH_REDIRECT_URI || "",
  );
  // Fallback to Sheets-specific credentials if configured.
  pushIfComplete(
    process.env.GOOGLE_SHEETS_CLIENT_ID || "",
    process.env.GOOGLE_SHEETS_CLIENT_SECRET || "",
    process.env.GOOGLE_SHEETS_REDIRECT_URI || "",
  );
  // Mixed fallback for projects that share ID/secret but set redirect in only one namespace.
  pushIfComplete(
    getFirstEnv("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_SHEETS_CLIENT_ID"),
    getFirstEnv("GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_SHEETS_CLIENT_SECRET"),
    getFirstEnv("GOOGLE_OAUTH_REDIRECT_URI", "GOOGLE_SHEETS_REDIRECT_URI"),
  );

  return candidates;
}

function columnLetterToIndex(letter: string) {
  const normalized = letter.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) return -1;
  let result = 0;
  for (const ch of normalized) {
    result = result * 26 + (ch.charCodeAt(0) - 64);
  }
  return result - 1;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  januar: 1,
  februar: 2,
  maerz: 3,
  märz: 3,
  mai: 5,
  juni: 6,
  juli: 7,
  oktober: 10,
  dezember: 12,
};

function parseDateFromMonthYearDay(monthYearRaw: string, dayRaw: string) {
  const monthYear = monthYearRaw.trim().replace(/\s+/g, " ");
  const day = Number.parseInt(dayRaw.trim(), 10);
  if (!monthYear || !Number.isFinite(day) || day < 1 || day > 31) return null;

  const match = monthYear.match(/^([\p{L}.-]+)\s+(\d{4})$/u);
  if (!match) return null;
  const monthToken = match[1].toLowerCase();
  const year = Number.parseInt(match[2], 10);
  const month = MONTHS[monthToken];
  if (!month || !Number.isFinite(year)) return null;

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function cleanCell(value: unknown) {
  return String(value ?? "").trim();
}

function getColumnIndexFromEnv(name: string, fallback: string) {
  const fromEnv = process.env[name] || fallback;
  const index = columnLetterToIndex(fromEnv);
  if (index < 0) throw new Error(`Invalid sheet column letter in ${name}: ${fromEnv}`);
  return index;
}

export async function fetchTravelByDate(refreshToken: string): Promise<Record<string, TravelInfo>> {
  if (!refreshToken) return {};

  const spreadsheetId = requiredEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
  const baseRange = process.env.GOOGLE_SHEETS_RANGE || "A:R";
  const gid = process.env.GOOGLE_SHEETS_GID;

  const monthYearColIdx = getColumnIndexFromEnv(
    "GOOGLE_SHEETS_DATE_MONTH_YEAR_COLUMN",
    DEFAULT_MONTH_YEAR_COLUMN,
  );
  const dayColIdx = getColumnIndexFromEnv("GOOGLE_SHEETS_DATE_DAY_COLUMN", DEFAULT_DAY_COLUMN);
  const clientColIdx = getColumnIndexFromEnv("GOOGLE_SHEETS_COL_CLIENT", DEFAULT_CLIENT_COLUMN);
  const locationColIdx = getColumnIndexFromEnv("GOOGLE_SHEETS_COL_LOCATION", DEFAULT_LOCATION_COLUMN);
  const responsibleColIdx = getColumnIndexFromEnv("GOOGLE_SHEETS_COL_RESPONSIBLE", DEFAULT_RESPONSIBLE_COLUMN);

  const oauthCandidates = collectOAuthCandidates();
  if (oauthCandidates.length === 0) {
    throw new Error("Missing Google OAuth env vars for Sheets access");
  }
  let lastError: unknown = null;
  for (const candidate of oauthCandidates) {
    try {
      const oauthClient = new google.auth.OAuth2(
        candidate.clientId,
        candidate.clientSecret,
        candidate.redirectUri,
      );
      oauthClient.setCredentials({ refresh_token: refreshToken });
      const sheets = google.sheets({ version: "v4", auth: oauthClient });
      let range = baseRange;
      if (!range.includes("!") && gid) {
        const meta = await sheets.spreadsheets.get({
          spreadsheetId,
          fields: "sheets(properties(sheetId,title))",
        });
        const targetSheetId = Number.parseInt(gid, 10);
        const tabTitle =
          meta.data.sheets?.find((sheet) => sheet.properties?.sheetId === targetSheetId)?.properties?.title ?? "";
        if (tabTitle) {
          range = `'${tabTitle.replace(/'/g, "''")}'!${baseRange}`;
        }
      }

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const rows = response.data.values ?? [];
      const result: Record<string, TravelInfo> = {};

      let activeMonthYear = "";
      for (const row of rows) {
        const monthYearCandidate = cleanCell(row[monthYearColIdx]);
        if (monthYearCandidate) activeMonthYear = monthYearCandidate;
        const monthYear = activeMonthYear;
        const day = cleanCell(row[dayColIdx]);
        const dateKey = parseDateFromMonthYearDay(monthYear, day);
        if (!dateKey) continue;

        result[dateKey] = {
          client: cleanCell(row[clientColIdx]),
          location: cleanCell(row[locationColIdx]),
          responsible: cleanCell(row[responsibleColIdx]),
        };
      }

      return result;
    } catch (error) {
      lastError = error;
    }
  }
  throw (lastError instanceof Error ? lastError : new Error("Could not access Google Sheets with configured OAuth credentials."));
}
