#!/usr/bin/env python3
"""Local Gmail API bridge for creating drafts (no auto-send)."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from email.message import EmailMessage
from pathlib import Path
from typing import Any, Dict

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES = ["https://www.googleapis.com/auth/gmail.compose"]
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CREDENTIALS_FILE = SCRIPT_DIR / "credentials.json"
DEFAULT_TOKEN_FILE = SCRIPT_DIR / "token.json"


def get_paths(args: argparse.Namespace) -> tuple[Path, Path]:
    credentials_file = Path(args.credentials_file).expanduser().resolve()
    token_file = Path(args.token_file).expanduser().resolve()
    return credentials_file, token_file


def get_credentials(credentials_file: Path, token_file: Path, force_auth: bool = False) -> Credentials:
    creds = None
    if not force_auth and token_file.exists():
        creds = Credentials.from_authorized_user_file(str(token_file), SCOPES)

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        token_file.write_text(creds.to_json(), encoding="utf-8")
        return creds

    if not credentials_file.exists():
        raise FileNotFoundError(
            f"Missing credentials file: {credentials_file}\n"
            "Download OAuth Desktop credentials JSON and place it there."
        )

    flow = InstalledAppFlow.from_client_secrets_file(str(credentials_file), SCOPES)
    creds = flow.run_local_server(port=0)
    token_file.write_text(creds.to_json(), encoding="utf-8")
    return creds


def get_service(credentials_file: Path, token_file: Path, force_auth: bool = False):
    creds = get_credentials(credentials_file, token_file, force_auth=force_auth)
    return build("gmail", "v1", credentials=creds)


def build_message(
    to: str,
    subject: str,
    body: str,
    cc: str | None = None,
    bcc: str | None = None,
    html_body: str | None = None,
) -> Dict[str, Any]:
    msg = EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject
    if cc:
        msg["Cc"] = cc
    if bcc:
        msg["Bcc"] = bcc
    msg.set_content(body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
    return {"message": {"raw": raw}}


def create_draft(
    service,
    to: str,
    subject: str,
    body: str,
    cc: str | None = None,
    bcc: str | None = None,
    html_body: str | None = None,
) -> Dict[str, Any]:
    payload = build_message(to=to, subject=subject, body=body, cc=cc, bcc=bcc, html_body=html_body)
    return service.users().drafts().create(userId="me", body=payload).execute()


def cmd_auth(args: argparse.Namespace) -> int:
    credentials_file, token_file = get_paths(args)
    get_service(credentials_file=credentials_file, token_file=token_file, force_auth=True)
    print(f"Auth successful. Token saved to: {token_file}")
    return 0


def cmd_create_draft(args: argparse.Namespace) -> int:
    credentials_file, token_file = get_paths(args)
    service = get_service(credentials_file=credentials_file, token_file=token_file)
    result = create_draft(
        service=service,
        to=args.to,
        subject=args.subject,
        body=args.body,
        cc=args.cc,
        bcc=args.bcc,
        html_body=None,
    )
    print(json.dumps({"draft_id": result.get("id"), "message_id": result.get("message", {}).get("id")}))
    return 0


def cmd_create_draft_json(args: argparse.Namespace) -> int:
    credentials_file, token_file = get_paths(args)
    input_file = Path(args.input_file).expanduser().resolve()
    payload = json.loads(input_file.read_text(encoding="utf-8"))

    required = ["to", "subject", "body"]
    missing = [key for key in required if not payload.get(key)]
    if missing:
        raise ValueError(f"Missing required fields in JSON payload: {', '.join(missing)}")

    service = get_service(credentials_file=credentials_file, token_file=token_file)
    result = create_draft(
        service=service,
        to=payload["to"],
        subject=payload["subject"],
        body=payload["body"],
        cc=payload.get("cc"),
        bcc=payload.get("bcc"),
        html_body=payload.get("html_body"),
    )
    print(json.dumps({"draft_id": result.get("id"), "message_id": result.get("message", {}).get("id")}))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create Gmail drafts via local OAuth.")
    parser.add_argument(
        "--credentials-file",
        default=os.environ.get("GMAIL_CREDENTIALS_FILE", str(DEFAULT_CREDENTIALS_FILE)),
        help="Path to OAuth desktop credentials JSON.",
    )
    parser.add_argument(
        "--token-file",
        default=os.environ.get("GMAIL_TOKEN_FILE", str(DEFAULT_TOKEN_FILE)),
        help="Path to OAuth token file.",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    auth_parser = subparsers.add_parser("auth", help="Run OAuth flow and store token.")
    auth_parser.set_defaults(func=cmd_auth)

    draft_parser = subparsers.add_parser("create-draft", help="Create a Gmail draft from CLI args.")
    draft_parser.add_argument("--to", required=True, help="Recipient email(s), comma-separated if multiple.")
    draft_parser.add_argument("--subject", required=True, help="Email subject.")
    draft_parser.add_argument("--body", required=True, help="Email body (plain text).")
    draft_parser.add_argument("--cc", default=None, help="CC email(s), comma-separated.")
    draft_parser.add_argument("--bcc", default=None, help="BCC email(s), comma-separated.")
    draft_parser.set_defaults(func=cmd_create_draft)

    json_parser = subparsers.add_parser(
        "create-draft-json", help="Create a draft from a JSON file with to/subject/body."
    )
    json_parser.add_argument("--input-file", required=True, help="Path to JSON payload file.")
    json_parser.set_defaults(func=cmd_create_draft_json)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except (FileNotFoundError, ValueError, HttpError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
