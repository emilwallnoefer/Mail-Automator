"use client";

import {
  MAIL_SIGNATURE_CUSTOM_VALUE,
  MAIL_SIGNATURE_NAME_PRESETS,
} from "@/lib/mail-signature-presets";
import { Button, Input, Select } from "@/components/ui";

type MailSignatureSectionProps = {
  preset: string;
  custom: string;
  saving: boolean;
  onPresetChange: (value: string) => void;
  onCustomChange: (value: string) => void;
  onSave: () => void;
};

export function MailSignatureSection({
  preset,
  custom,
  saving,
  onPresetChange,
  onCustomChange,
  onSave,
}: MailSignatureSectionProps) {
  return (
    <div className="mt-5">
      <p className="text-sm text-ink-4">
        This name appears in the closing of generated training emails (e.g. &ldquo;Best regards, …&rdquo;).
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1">
          <span className="mb-1 block text-xs text-ink-2/90">Preset</span>
          <Select value={preset} onChange={(event) => onPresetChange(event.target.value)}>
            {MAIL_SIGNATURE_NAME_PRESETS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value={MAIL_SIGNATURE_CUSTOM_VALUE}>Custom name…</option>
          </Select>
        </label>
        {preset === MAIL_SIGNATURE_CUSTOM_VALUE ? (
          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-xs text-ink-2/90">Custom name</span>
            <Input
              value={custom}
              onChange={(event) => onCustomChange(event.target.value)}
              placeholder="Your name"
              maxLength={120}
            />
          </label>
        ) : null}
        <Button variant="accent" size="sm" disabled={saving} onClick={onSave}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
