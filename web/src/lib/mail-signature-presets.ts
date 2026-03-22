/** Preset options in Settings (users can pick “Custom name…” for any other name). */
export const MAIL_SIGNATURE_NAME_PRESETS = ["Emil Wallnöfer"] as const;

export const MAIL_SIGNATURE_DEFAULT_NAME = MAIL_SIGNATURE_NAME_PRESETS[0];

export const MAIL_SIGNATURE_CUSTOM_VALUE = "__custom__";

export function isPresetSignatureName(name: string): boolean {
  return (MAIL_SIGNATURE_NAME_PRESETS as readonly string[]).includes(name);
}
