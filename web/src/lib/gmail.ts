import { google } from "googleapis";

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.compose"];

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function getOAuthClient(redirectUri: string) {
  return new google.auth.OAuth2(
    requiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
    requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
    redirectUri,
  );
}

export function getAuthUrl(redirectUri: string) {
  const client = getOAuthClient(redirectUri);
  return client.generateAuthUrl({
    access_type: "offline",
    scope: GMAIL_SCOPES,
    prompt: "consent",
  });
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const client = getOAuthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  return tokens;
}

type DraftPayload = {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  html_body?: string;
};

function base64urlEncode(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildRawMessage(payload: DraftPayload) {
  const boundary = "mail-automator-boundary";
  const headers = [
    `To: ${payload.to}`,
    payload.cc ? `Cc: ${payload.cc}` : "",
    payload.bcc ? `Bcc: ${payload.bcc}` : "",
    `Subject: ${payload.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    payload.body,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    payload.html_body ?? payload.body.replaceAll("\n", "<br>"),
    "",
    `--${boundary}--`,
  ]
    .filter(Boolean)
    .join("\r\n");

  return base64urlEncode(headers);
}

export async function createGmailDraft(refreshToken: string, payload: DraftPayload) {
  const oauthClient = getOAuthClient(requiredEnv("GOOGLE_OAUTH_REDIRECT_URI"));
  oauthClient.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: "v1", auth: oauthClient });
  const raw = buildRawMessage(payload);

  const response = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw },
    },
  });

  return {
    draftId: response.data.id ?? "",
    messageId: response.data.message?.id ?? "",
  };
}
