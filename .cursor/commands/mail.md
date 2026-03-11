# /mail

Use this command to generate customized training emails and optionally create Gmail drafts through the local API bridge.

## Behavior

1. Ask for inputs in a single message (fast mode), not one-by-one.
2. Use this exact form so user can paste all answers at once:

```text
mail_type: pre|post
template_variant: lausanne|abroad
language: en|de
training_type: intro_1day|aiim_3day
recipient_name:
company_name:
date:
location:
to:
cc: (optional)
custom_opener_note: (optional)
tone: neutral|formal|friendly (optional, default: neutral)
industry_course_ids: comma-separated ids (optional override)
include_certification_note: yes|no (optional)
include_simulator_note: yes|no (optional)
```

3. Validation rules:
   - If `mail_type=post`, do not block on `template_variant` or `training_type`; keep provided values if present.
   - If fields are missing, ask one consolidated follow-up listing all missing fields at once.
   - If user writes `skip` for optional fields, treat as empty.
4. Perform brief web research about the company:
   - official website
   - detect relevant industry tags only
   - avoid speculation
   - infer industry tags/keywords (e.g. cement, mining, wastewater, gas, UT, FARO, regulation)
5. Build draft from templates in `templates/training-email-templates.md`:
   - select `pre_*` or `post_*` template by language/variant
   - for `intro_1day`, keep Day 1 only in pre-training templates
   - apply hyperlink placeholders from `config/training-links.json`
   - auto-build `INDUSTRY_TRAINING_BLOCK` from `config/industry-training-links.json`
   - include only industry courses relevant to company research
   - include only useful links that are common for all users or relevant to the detected industry
   - allow manual override with `industry_course_ids` when user wants exact selection
   - include certification/simulator blocks only when explicitly requested
   - do not insert company research sentences into the email body
6. Show output for review:
   - `Subject: ...`
   - full body
7. Ask for explicit approval phrase: `confirm draft`
8. Only after approval, call:

```bash
python3 scripts/mail_workflow.py create-draft --payload-file "<generated_json_payload_path>"
```

9. Report success by returning the created Gmail `draft_id`.

## Hard Rules

- Never auto-send emails.
- Never call Gmail draft creation before explicit approval.
- If data is missing, ask a focused follow-up.
- Keep writing style aligned with Flyability training tone.
- Use plain-text body formatting suitable for Gmail drafts.
