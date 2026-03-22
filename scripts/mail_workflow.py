#!/usr/bin/env python3
"""Render training email templates and create Gmail drafts via gmail_bridge."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_FILE = PROJECT_ROOT / "templates" / "training-email-templates.md"
LINKS_FILE = PROJECT_ROOT / "config" / "training-links.json"
INDUSTRY_LINKS_FILE = PROJECT_ROOT / "config" / "industry-training-links.json"
USEFUL_LINKS_POLICY_FILE = PROJECT_ROOT / "config" / "useful-links-policy.json"
DEFAULT_CREDENTIALS_FILE = PROJECT_ROOT / "scripts" / "credentials.json"
DEFAULT_TOKEN_FILE = PROJECT_ROOT / "scripts" / "token.json"
CONFIRM_PHRASE = "confirm draft"
DEFAULT_SIGNATURE_NAME = "Emil Wallnöfer"


def load_json(path: Path) -> Dict:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_templates(raw: str) -> Dict[str, str]:
    sections: Dict[str, str] = {}
    pattern = re.compile(r"^## TEMPLATE_ID:\s*([a-z0-9_]+)\s*$", re.MULTILINE)
    matches = list(pattern.finditer(raw))
    for i, match in enumerate(matches):
        template_id = match.group(1).strip()
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(raw)
        sections[template_id] = raw[start:end].strip()
    return sections


def choose_template_id(payload: Dict) -> str:
    mail_type = payload.get("mail_type")
    language = payload.get("language")
    variant = payload.get("template_variant")

    if mail_type == "post":
        if language not in {"en", "de", "fr"}:
            raise ValueError("For post mail_type, language must be 'en', 'de', or 'fr'.")
        return f"post_{language}"

    if mail_type == "pre":
        if language not in {"en", "de", "fr"}:
            raise ValueError("For pre mail_type, language must be 'en', 'de', or 'fr'.")
        if variant not in {"lausanne", "abroad"}:
            raise ValueError("For pre mail_type, template_variant must be 'lausanne' or 'abroad'.")
        return f"pre_{variant}_{language}"

    raise ValueError("mail_type must be 'pre' or 'post'.")


def extract_subject_and_body(template_text: str) -> Tuple[str, str]:
    lines = template_text.splitlines()
    if not lines or not lines[0].startswith("SUBJECT:"):
        raise ValueError("Template must start with 'SUBJECT: ...'.")
    subject = lines[0].replace("SUBJECT:", "", 1).strip()
    body_lines = [line for line in lines[1:] if line.strip() != "---"]
    body = "\n".join(body_lines).strip()
    return subject, body


def trim_pretraining_days(body: str, training_type: str) -> str:
    if training_type not in {"intro_1day", "aiim_3day"}:
        return body

    if training_type == "intro_1day":
        # Remove Day 2 and Day 3 blocks including markers.
        body = re.sub(r"\n?<!-- DAY2_START -->.*?<!-- DAY2_END -->\n?", "\n", body, flags=re.DOTALL)
        body = re.sub(r"\n?<!-- DAY3_START -->.*?<!-- DAY3_END -->\n?", "\n", body, flags=re.DOTALL)

    # Remove day markers in all cases.
    body = re.sub(r"<!-- DAY[123]_START -->\n?", "", body)
    body = re.sub(r"<!-- DAY[123]_END -->\n?", "", body)
    return body


def replace_placeholders(text: str, replacements: Dict[str, str]) -> str:
    rendered = text
    for key, value in replacements.items():
        rendered = rendered.replace(f"{{{{{key}}}}}", value or "")
    return rendered


def normalize_spacing(text: str) -> str:
    lines = [line.rstrip() for line in text.splitlines()]
    compact = "\n".join(lines)
    compact = re.sub(r"\n{3,}", "\n\n", compact).strip()
    return compact + "\n"


def strip_markdown_links(text: str) -> str:
    return re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r"\1", text)


def markdown_to_html(text: str) -> str:
    escaped = html.escape(text)
    linked = re.sub(
        r"\[([^\]]+)\]\((https?://[^)]+)\)",
        lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>',
        escaped,
    )
    paragraphs = linked.strip().split("\n\n")
    html_paragraphs = [f"<p>{p.replace('\n', '<br>')}</p>" for p in paragraphs if p.strip()]
    return "\n".join(html_paragraphs)


def parse_industry_ids(raw: Any) -> List[str]:
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    if isinstance(raw, str) and raw.strip():
        return [part.strip() for part in raw.split(",") if part.strip()]
    return []


def is_truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y", "ja"}


def infer_industry_course_ids(payload: Dict[str, Any], industry_catalog: List[Dict[str, Any]]) -> List[str]:
    explicit_ids = parse_industry_ids(payload.get("industry_course_ids"))
    if explicit_ids:
        return explicit_ids

    source_text = " ".join(
        [
            str(payload.get("company_name", "")),
            str(payload.get("company_context_line", "")),
            str(payload.get("company_research_text", "")),
            str(payload.get("custom_opener_note", "")),
        ]
    ).lower()

    selected: List[str] = []
    for course in industry_catalog:
        keywords = [kw.lower() for kw in course.get("keywords", [])]
        if any(keyword in source_text for keyword in keywords):
            selected.append(course["id"])
    return selected


def build_industry_training_block(
    language: str,
    selected_ids: List[str],
    industry_catalog: List[Dict[str, Any]],
) -> str:
    if not selected_ids:
        return ""

    by_id = {course["id"]: course for course in industry_catalog}
    lines: List[str] = []
    if language == "de":
        lines.append("Branchenspezifische Academy-Kurse")
    elif language == "fr":
        lines.append("Cours Academy spécifiques au secteur")
    else:
        lines.append("Industry-specific Academy courses")

    for course_id in selected_ids:
        course = by_id.get(course_id)
        if not course:
            continue
        if language == "de":
            label = course["label_de"]
        elif language == "fr":
            label = course.get("label_fr") or course["label_en"]
        else:
            label = course["label_en"]
        lines.append(f"- [{label}]({course['url']})")

    if len(lines) == 1:
        return ""
    return "\n".join(lines)


def build_useful_links_block(
    language: str,
    selected_course_ids: List[str],
    links: Dict[str, str],
    useful_links_policy: Dict[str, Any],
    payload: Dict[str, Any],
) -> str:
    if language == "de":
        header = "Weitere nützliche Links"
    elif language == "fr":
        header = "Autres liens utiles"
    else:
        header = "Other Useful Links"
    lines: List[str] = [header]

    def append_item(item: Dict[str, Any]) -> None:
        url = links.get(item["link_key"], "")
        if not url:
            return
        if language == "de":
            label, desc = str(item.get("label_de", "")), str(item.get("desc_de", ""))
        elif language == "fr":
            label = str(item.get("label_fr") or item.get("label_en", ""))
            desc = str(item.get("desc_fr") or item.get("desc_en", ""))
        else:
            label, desc = str(item.get("label_en", "")), str(item.get("desc_en", ""))
        lines.append(f"[{label}]({url}) - {desc}")

    for item in useful_links_policy.get("common", []):
        append_item(item)

    for item in useful_links_policy.get("conditional", []):
        required_courses = set(item.get("industry_course_ids", []))
        include_flag = item.get("include_flag")
        include = False
        if required_courses and required_courses.intersection(selected_course_ids):
            include = True
        if include_flag and is_truthy(payload.get(include_flag)):
            include = True
        if include:
            append_item(item)

    if len(lines) == 1:
        return ""
    return "\n".join(lines)


def get_certification_note_block(payload: Dict[str, Any], language: str) -> str:
    if not payload.get("include_certification_note"):
        return ""
    if language == "de":
        return (
            "Zertifizierungshinweis\n"
            "Es freut mich, euch mitzuteilen, dass ihr das Training erfolgreich absolviert habt. "
            "Die Zertifikate dienen als offizieller Nachweis in unserer Datenbank, dass ihr ausgebildete Piloten seid."
        )
    if language == "fr":
        return (
            "Note sur la certification\n"
            "Je suis heureux de vous confirmer que vous avez terminé la formation avec succès. "
            "Vos certificats font foi officiellement dans nos dossiers : vous êtes des pilotes formés."
        )
    return (
        "Certification note\n"
        "I am happy to confirm that you successfully completed the training. "
        "Your certificates act as official proof in our records that you are trained pilots."
    )


def get_simulator_note_block(payload: Dict[str, Any], language: str) -> str:
    if not payload.get("include_simulator_note"):
        return ""
    intro_course = "https://flyabilityacademy.thinkific.com/courses/Introductorytrainingcourse"
    if language == "de":
        return (
            "Hinweis für Kollegen ohne Trainingsteilnahme\n"
            "Kollegen, die nicht teilnehmen konnten, können ihr Zertifikat über den Simulator erhalten. "
            "Nutzt dazu die Training App auf dem Tablet und absolviert den Kurs "
            f"[Einführungstraining (Online-Kurs)]({intro_course})."
        )
    if language == "fr":
        return (
            "Note pour les collègues n'ayant pas pu participer\n"
            "Les collègues absents peuvent tout de même obtenir leur certification via le simulateur dans l'application tablette. "
            f"Ils peuvent suivre la [formation d'introduction (cours en ligne)]({intro_course})."
        )
    return (
        "Note for colleagues who missed the training\n"
        "Colleagues who could not attend can still obtain certification through simulator training in the tablet app. "
        f"They can complete the [Introductory Training Course]({intro_course})."
    )


def render_payload(
    payload: Dict,
    templates_file: Path,
    links_file: Path,
    industry_links_file: Path,
    useful_links_policy_file: Path,
) -> Dict:
    templates = parse_templates(templates_file.read_text(encoding="utf-8"))
    links = load_json(links_file)
    industry_catalog = load_json(industry_links_file).get("courses", [])
    useful_links_policy = load_json(useful_links_policy_file)

    template_id = payload.get("template_id") or choose_template_id(payload)
    if template_id not in templates:
        raise ValueError(f"Template id not found: {template_id}")

    subject_template, body_template = extract_subject_and_body(templates[template_id])
    if template_id.startswith("pre_"):
        body_template = trim_pretraining_days(body_template, payload.get("training_type", "aiim_3day"))

    sig_name = str(payload.get("signature_name", "")).strip()
    replacements = {
        **links,
        "RECIPIENT_NAME": payload.get("recipient_name", ""),
        "COMPANY_NAME": payload.get("company_name", ""),
        "TRAINING_DATE": payload.get("date", ""),
        "LOCATION": payload.get("location", ""),
        "CUSTOM_OPENER_NOTE": payload.get("custom_opener_note", ""),
        "COMPANY_CONTEXT_LINE": "",
        "INDUSTRY_TRAINING_BLOCK": "",
        "USEFUL_LINKS_BLOCK": "",
        "CERTIFICATION_NOTE_BLOCK": "",
        "SIMULATOR_NOTE_BLOCK": "",
        "SIGNATURE_NAME": sig_name or DEFAULT_SIGNATURE_NAME,
    }
    language = payload.get("language", "en")
    selected_course_ids = infer_industry_course_ids(payload, industry_catalog)
    replacements["INDUSTRY_TRAINING_BLOCK"] = build_industry_training_block(
        language=language, selected_ids=selected_course_ids, industry_catalog=industry_catalog
    )
    replacements["USEFUL_LINKS_BLOCK"] = build_useful_links_block(
        language=language,
        selected_course_ids=selected_course_ids,
        links=links,
        useful_links_policy=useful_links_policy,
        payload=payload,
    )
    replacements["CERTIFICATION_NOTE_BLOCK"] = get_certification_note_block(payload, language=language)
    replacements["SIMULATOR_NOTE_BLOCK"] = get_simulator_note_block(payload, language=language)

    subject = replace_placeholders(subject_template, replacements)
    body_markdown = replace_placeholders(body_template, replacements)
    subject = normalize_spacing(subject).strip()
    body_plain = normalize_spacing(strip_markdown_links(body_markdown))
    body_html = markdown_to_html(body_markdown)

    result = {
        "to": payload.get("to", ""),
        "cc": payload.get("cc", ""),
        "bcc": payload.get("bcc", ""),
        "subject": subject,
        "body": body_plain,
        "html_body": body_html,
        "template_id": template_id,
    }
    return result


def cmd_render(args: argparse.Namespace) -> int:
    payload = load_json(Path(args.input_file))
    result = render_payload(
        payload,
        Path(args.templates_file),
        Path(args.links_file),
        Path(args.industry_links_file),
        Path(args.useful_links_policy_file),
    )
    output = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output_file:
        Path(args.output_file).write_text(output + "\n", encoding="utf-8")
    else:
        print(output)
    return 0


def cmd_create_draft(args: argparse.Namespace) -> int:
    import gmail_bridge

    payload = load_json(Path(args.payload_file))

    approval = payload.get("approval", "").strip().lower()
    if not args.force and approval != CONFIRM_PHRASE:
        raise ValueError(
            f"Draft creation blocked. Set payload approval to '{CONFIRM_PHRASE}' "
            "or use --force for testing."
        )

    required = ["to", "subject", "body"]
    missing = [field for field in required if not payload.get(field)]
    if missing:
        raise ValueError(f"Payload missing required fields: {', '.join(missing)}")

    credentials_file = Path(args.credentials_file).expanduser().resolve()
    token_file = Path(args.token_file).expanduser().resolve()
    service = gmail_bridge.get_service(credentials_file=credentials_file, token_file=token_file)
    result = gmail_bridge.create_draft(
        service=service,
        to=payload["to"],
        subject=payload["subject"],
        body=payload["body"],
        cc=payload.get("cc") or None,
        bcc=payload.get("bcc") or None,
        html_body=payload.get("html_body") or None,
    )
    print(json.dumps({"draft_id": result.get("id"), "message_id": result.get("message", {}).get("id")}))
    return 0


def cmd_dry_run(args: argparse.Namespace) -> int:
    payload = load_json(Path(args.input_file))
    result = render_payload(
        payload,
        Path(args.templates_file),
        Path(args.links_file),
        Path(args.industry_links_file),
        Path(args.useful_links_policy_file),
    )
    print(f"Subject: {result['subject']}\n")
    print(result["body"])
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Mail workflow renderer and Gmail draft creator.")
    parser.add_argument("--templates-file", default=str(TEMPLATES_FILE), help="Templates markdown file path.")
    parser.add_argument("--links-file", default=str(LINKS_FILE), help="Training links JSON path.")
    parser.add_argument(
        "--industry-links-file",
        default=str(INDUSTRY_LINKS_FILE),
        help="Industry-specific course links JSON path.",
    )
    parser.add_argument(
        "--useful-links-policy-file",
        default=str(USEFUL_LINKS_POLICY_FILE),
        help="Useful links policy JSON path.",
    )
    parser.add_argument(
        "--credentials-file",
        default=str(DEFAULT_CREDENTIALS_FILE),
        help="OAuth credentials JSON path.",
    )
    parser.add_argument(
        "--token-file",
        default=str(DEFAULT_TOKEN_FILE),
        help="OAuth token file path.",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    render_parser = subparsers.add_parser("render", help="Render a template payload to subject/body JSON.")
    render_parser.add_argument("--input-file", required=True, help="Input JSON with template variables.")
    render_parser.add_argument("--output-file", help="Optional output JSON path.")
    render_parser.set_defaults(func=cmd_render)

    dry_run_parser = subparsers.add_parser("dry-run", help="Print rendered subject/body.")
    dry_run_parser.add_argument("--input-file", required=True, help="Input JSON with template variables.")
    dry_run_parser.set_defaults(func=cmd_dry_run)

    create_parser = subparsers.add_parser("create-draft", help="Create Gmail draft from payload JSON.")
    create_parser.add_argument("--payload-file", required=True, help="JSON with to/subject/body (+ optional cc/bcc).")
    create_parser.add_argument("--force", action="store_true", help="Bypass confirm phrase guard for testing.")
    create_parser.set_defaults(func=cmd_create_draft)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
