"use client";

import { Button } from "@/components/ui";

type SecuritySectionProps = {
  confirmText: string;
  setConfirmText: (value: string) => void;
  deleting: boolean;
  onDelete: () => void;
};

export function SecuritySection({ confirmText, setConfirmText, deleting, onDelete }: SecuritySectionProps) {
  return (
    <div className="mt-5">
      <div className="rounded-xl border border-rose-400/35 bg-rose-950/25 p-4">
        <p className="text-sm font-medium text-danger">Delete account</p>
        <p className="mt-1 text-xs text-danger/80">
          This permanently removes your account and all app access for this login.
        </p>
        <div className="mt-2">
          <input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder='Type "DELETE" to confirm'
            className="w-full rounded-lg border border-rose-200/35 bg-glass/10 px-3 py-2 text-sm"
          />
        </div>
        <Button variant="danger" size="sm" className="mt-3" onClick={onDelete} disabled={deleting}>
          {deleting ? "Deleting account…" : "Delete account"}
        </Button>
      </div>
    </div>
  );
}
