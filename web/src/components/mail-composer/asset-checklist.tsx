"use client";

import type { SyntheticEvent } from "react";
import {
  type ChangeOption,
  getChangeOptionLabelDesc,
  type MailLanguage,
  type ResourceSectionId,
  resourceSectionLabel,
} from "@/lib/change-options";

export type GroupedChangeOptions = {
  materials: ChangeOption[];
  usefulSections: Array<{ sectionId: ResourceSectionId; options: ChangeOption[] }>;
};

/** Accordion checklist of every mail asset, grouped by section. Shared by the guided form and the Brief-mode asset editor. */
export function AssetChecklist({
  grouped,
  selectedIds,
  lang,
  onToggle,
  onDetailsToggle,
}: {
  grouped: GroupedChangeOptions;
  selectedIds: string[];
  lang: MailLanguage;
  onToggle: (id: string, checked: boolean) => void;
  onDetailsToggle: (event: SyntheticEvent<HTMLDetailsElement>) => void;
}) {
  const renderOption = (option: ChangeOption) => {
    const checked = selectedIds.includes(option.id);
    const { label, desc } = getChangeOptionLabelDesc(option, lang);
    return (
      <label key={option.id} className="flex items-start gap-2 rounded-md border border-glass/10 bg-glass/5 p-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={checked}
          onChange={(e) => onToggle(option.id, e.target.checked)}
        />
        <span>
          <span className="block">{label}</span>
          <span className="text-xs text-ink-3/80">{desc}</span>
        </span>
      </label>
    );
  };

  return (
    <div className="space-y-2 text-sm">
      <details
        className="group rounded-lg border border-glass/15 bg-glass/5 [&_summary::-webkit-details-marker]:hidden"
        onToggle={onDetailsToggle}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-ink transition hover:bg-glass/10">
          <span>Training slide decks</span>
          <span className="shrink-0 text-xs text-ink-4 transition group-open:rotate-180">▼</span>
        </summary>
        <div className="max-h-64 space-y-2 overflow-auto border-t border-glass/10 p-3 pr-1">
          {grouped.materials.map(renderOption)}
        </div>
      </details>

      {grouped.usefulSections.map((section) => (
        <details
          key={section.sectionId}
          className="group rounded-lg border border-glass/15 bg-glass/5 [&_summary::-webkit-details-marker]:hidden"
          onToggle={onDetailsToggle}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-ink transition hover:bg-glass/10">
            <span>{resourceSectionLabel(section.sectionId, lang)}</span>
            <span className="shrink-0 text-xs text-ink-4 transition group-open:rotate-180">▼</span>
          </summary>
          <div className="max-h-64 space-y-2 overflow-auto border-t border-glass/10 p-3 pr-1">
            {section.options.map(renderOption)}
          </div>
        </details>
      ))}
    </div>
  );
}
