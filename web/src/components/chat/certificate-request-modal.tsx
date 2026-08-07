"use client";

import { m } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import {
  MAX_FIELD_LEN,
  MAX_PARTICIPANTS,
  TRAINING_LOCATIONS,
  TRAINING_PROGRAMMES,
  type CertificateParticipant,
  type CertificateRequestInput,
  type TrainingLocation,
  type TrainingProgramme,
} from "@/lib/certificate-request";
import { shortNameFromEmail } from "@/lib/chat";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { CertificateIcon, SpinnerIcon, TrashIcon, XMarkIcon } from "./icons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LABEL_CLASS = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-4";

type ParticipantDraft = CertificateParticipant & { key: string };

function newParticipant(): ParticipantDraft {
  const key =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `p-${Math.random().toString(36).slice(2, 10)}`;
  return { key, name: "", email: "" };
}

/**
 * The structured certificate-request form, opened from the "Certificate"
 * button in the chat composer.
 *
 * The trainer is shown read-only: the server derives it from the session, so
 * a request always names whoever actually sent it. Everything else is user
 * input and is re-validated on the route — the checks here exist to give
 * immediate feedback, not to be the gate.
 */
export function CertificateRequestModal({
  currentUserEmail,
  submitting,
  onSubmit,
  onClose,
}: {
  currentUserEmail: string | null;
  submitting: boolean;
  onSubmit: (input: CertificateRequestInput) => void;
  onClose: () => void;
}) {
  const [customerAccount, setCustomerAccount] = useState("");
  const [trainingDate, setTrainingDate] = useState("");
  const [programme, setProgramme] = useState<TrainingProgramme>("intro");
  const [location, setLocation] = useState<TrainingLocation>("flya_hq");
  const [participants, setParticipants] = useState<ParticipantDraft[]>([newParticipant()]);
  const [attempted, setAttempted] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  const trainerName = currentUserEmail ? shortNameFromEmail(currentUserEmail) : "You";

  const problems = useMemo(() => {
    const list: string[] = [];
    if (!customerAccount.trim()) list.push("Customer account name is required.");
    if (!trainingDate) list.push("Training date is required.");
    const filled = participants.filter((p) => p.name.trim() || p.email.trim());
    if (filled.length === 0) list.push("Add at least one participant.");
    if (filled.some((p) => !p.name.trim())) list.push("Every participant needs a name.");
    if (filled.some((p) => !EMAIL_RE.test(p.email.trim()))) {
      list.push("Every participant needs a valid email address.");
    }
    return list;
  }, [customerAccount, trainingDate, participants]);

  const updateParticipant = (key: string, patch: Partial<CertificateParticipant>) => {
    setParticipants((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  };

  const handleSubmit = () => {
    setAttempted(true);
    if (problems.length > 0 || submitting) return;
    onSubmit({
      customerAccount: customerAccount.trim(),
      trainingDate,
      programme,
      location,
      participants: participants
        .filter((p) => p.name.trim() || p.email.trim())
        .map((p) => ({ name: p.name.trim(), email: p.email.trim().toLowerCase() })),
    });
  };

  return (
    <>
      <m.div
        key="certificate-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[140] bg-overlay/60 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden
      />
      <m.div
        key="certificate-modal"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Certificate request"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
        // Escape is handled centrally in `useChat`, which knows the modal
        // outranks the panel and the message editor.
        className="fixed left-1/2 top-1/2 z-[141] flex max-h-[min(88dvh,760px)] w-[min(94vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-glass/12 bg-panel shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)]"
      >
        <header className="flex items-center gap-2.5 border-b border-glass/10 bg-gradient-to-b from-white/[0.06] to-transparent px-5 py-3.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-400/15 ring-1 ring-inset ring-sky-300/30">
            <CertificateIcon className="h-4 w-4 text-sky-200" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-ink">Certificate request</h2>
            <p className="mt-0.5 text-[11px] text-ink-4">
              Sends a compact summary to the admins and posts it in the chat.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="group grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-glass/10 bg-glass/5 text-ink-3 transition hover:border-glass/20 hover:bg-glass/10 hover:text-ink"
          >
            <XMarkIcon className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-90" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="cert-customer">
              Customer account name
            </label>
            <Input
              id="cert-customer"
              value={customerAccount}
              maxLength={MAX_FIELD_LEN}
              onChange={(e) => setCustomerAccount(e.target.value)}
              placeholder="e.g. Acme Aviation"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS} htmlFor="cert-date">
                Training date
              </label>
              <Input
                id="cert-date"
                type="date"
                value={trainingDate}
                onChange={(e) => setTrainingDate(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="cert-programme">
                Training programme
              </label>
              <Select
                id="cert-programme"
                value={programme}
                onChange={(e) => setProgramme(e.target.value as TrainingProgramme)}
              >
                {TRAINING_PROGRAMMES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <span className={LABEL_CLASS}>Training location</span>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-glass/[0.04] p-1 ring-1 ring-inset ring-glass/5">
              {TRAINING_LOCATIONS.map((l) => {
                const active = location === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setLocation(l.id)}
                    className={`rounded-lg px-2 py-2 text-xs font-medium transition ${
                      active
                        ? "bg-sky-400/20 text-sky-100 shadow-[0_1px_0_rgba(255,255,255,0.06)]"
                        : "text-ink-4 hover:bg-glass/[0.06] hover:text-ink-2"
                    }`}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className={LABEL_CLASS}>Trainer</span>
            <div className="flex items-center gap-2 rounded-lg border border-glass/10 bg-glass/[0.04] px-3 py-2 text-sm text-ink-2">
              <span className="truncate">{trainerName}</span>
              {currentUserEmail ? (
                <span className="truncate text-xs text-ink-4">{currentUserEmail}</span>
              ) : null}
              <span className="ml-auto shrink-0 text-[10.5px] uppercase tracking-wide text-ink-5">
                you
              </span>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className={`${LABEL_CLASS} mb-0`}>Participants</span>
              <span className="text-[11px] text-ink-5">
                {participants.length}/{MAX_PARTICIPANTS}
              </span>
            </div>
            <div className="space-y-2">
              {participants.map((p, i) => (
                <div key={p.key} className="flex items-center gap-2">
                  <Input
                    value={p.name}
                    maxLength={MAX_FIELD_LEN}
                    onChange={(e) => updateParticipant(p.key, { name: e.target.value })}
                    placeholder="Full name"
                    aria-label={`Participant ${i + 1} name`}
                    className="flex-1"
                  />
                  <Input
                    type="email"
                    value={p.email}
                    maxLength={MAX_FIELD_LEN}
                    onChange={(e) => updateParticipant(p.key, { email: e.target.value })}
                    placeholder="email@company.com"
                    aria-label={`Participant ${i + 1} email`}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setParticipants((prev) =>
                        prev.length === 1
                          ? [newParticipant()]
                          : prev.filter((row) => row.key !== p.key),
                      )
                    }
                    aria-label={`Remove participant ${i + 1}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-glass/10 bg-glass/5 text-ink-4 transition hover:border-rose-300/40 hover:bg-rose-500/15 hover:text-danger"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={participants.length >= MAX_PARTICIPANTS}
              onClick={() => setParticipants((prev) => [...prev, newParticipant()])}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-glass/12 bg-glass/5 px-2.5 py-1.5 text-[11px] font-medium text-ink-3 transition hover:border-glass/20 hover:bg-glass/10 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Add participant
            </button>
          </div>

          {attempted && problems.length > 0 ? (
            <ul
              role="alert"
              className="space-y-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-danger"
            >
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-glass/10 bg-overlay/60 px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5"
          >
            {submitting ? (
              <>
                <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                Sending…
              </>
            ) : (
              "Send request"
            )}
          </Button>
        </footer>
      </m.div>
    </>
  );
}
