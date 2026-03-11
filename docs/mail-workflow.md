# `/mail` Workflow Usage

## Quick flow

1. Trigger `/mail` in Cursor.
2. Answer intake questions (type, language, variant, training type, recipient, date/location).
3. Review generated `Subject` + `Body`.
4. Confirm with exact phrase: `confirm draft`.
5. Cursor runs local bridge and creates draft in Gmail.

## Local CLI equivalents

Render a payload to subject/body JSON:

```bash
python3 scripts/mail_workflow.py render \
  --input-file data/scenarios/post_en_full_links.json \
  --output-file data/scenarios/rendered_post_en_full_links.json
```

Preview only:

```bash
python3 scripts/mail_workflow.py dry-run \
  --input-file data/scenarios/post_en_full_links.json
```

Create a draft (requires OAuth setup):

```bash
python3 scripts/mail_workflow.py create-draft \
  --payload-file data/scenarios/rendered_post_en_full_links.json \
  --force
```

## Required payload fields for rendering

- `mail_type`: `pre` or `post`
- `language`: `en` or `de`
- `template_variant`: `lausanne` or `abroad` (for pre templates)
- `training_type`: `intro_1day` or `aiim_3day` (for pre templates)
- `recipient_name`
- `company_name`
- `date`
- `location`
- `to`

Optional:
- `cc`
- `bcc`
- `custom_opener_note`
- `company_context_line`

## Confirmation guard

When creating a draft without `--force`, payload must include:

```json
{
  "approval": "confirm draft"
}
```

This prevents accidental draft creation before final review.
