"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button, Input } from "@/components/ui";
import type { TravelMapping } from "../types";

function normalizeColumnInput(value: string) {
  return value.toUpperCase().replace(/[^A-Z]/g, "");
}

type TravelMappingSectionProps = {
  mapping: TravelMapping;
  setMapping: Dispatch<SetStateAction<TravelMapping>>;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
};

const FIELDS: { key: keyof TravelMapping; label: string; placeholder: string }[] = [
  { key: "clientColumn", label: "Client column", placeholder: "P" },
  { key: "locationColumn", label: "Location column", placeholder: "Q" },
  { key: "responsibleColumn", label: "Responsible column", placeholder: "R" },
];

export function TravelMappingSection({ mapping, setMapping, saving, onSave, onReset }: TravelMappingSectionProps) {
  return (
    <div className="mt-5">
      <p className="text-sm text-ink-4">
        The travel sheet has one column group per person, so these are required to see travel info.
        Find your name in the header row of the Mission planning tab, then enter your name&apos;s column
        letter and the two to its right (Status/Location, Reporting to). Dates are read automatically.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-xs text-ink-2/90">{field.label}</span>
            <Input
              value={mapping[field.key]}
              onChange={(event) => {
                const value = normalizeColumnInput(event.target.value);
                setMapping((prev) => ({ ...prev, [field.key]: value }));
              }}
              placeholder={field.placeholder}
            />
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="glass-quiet" size="sm" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save travel mapping"}
        </Button>
        <Button variant="glass-quiet" size="sm" onClick={onReset} disabled={saving}>
          Reset to defaults
        </Button>
      </div>
      <p className="mt-2 text-xs text-ink-4">
        Reset clears your entire personal mapping (including hidden tab/range settings from older
        saves); travel info stays off until you save your columns again. It never changes the Google
        Sheet itself.
      </p>
    </div>
  );
}
