"use client";

import { useRef } from "react";
import { Button } from "@/components/ui";

type TimeDataSectionProps = {
  importing: boolean;
  exporting: boolean;
  onImportFile: (file: File) => void;
  onExport: () => void;
};

export function TimeDataSection({ importing, exporting, onImportFile, onExport }: TimeDataSectionProps) {
  const importFileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="mt-5">
      <p className="text-sm text-ink-4">
        One-time import: upload your previous <code className="rounded bg-glass/10 px-1">hourlogger-data.json</code> file to
        migrate old tracking history into this account. You can also export your current data.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="glass-quiet"
          size="sm"
          onClick={() => {
            importFileRef.current?.click();
          }}
          disabled={importing}
        >
          {importing ? "Importing…" : "Upload old time tracking data"}
        </Button>
        <Button variant="glass-quiet" size="sm" onClick={onExport} disabled={exporting}>
          {exporting ? "Exporting…" : "Export time tracking data"}
        </Button>
      </div>
      <input
        ref={importFileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImportFile(file);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
