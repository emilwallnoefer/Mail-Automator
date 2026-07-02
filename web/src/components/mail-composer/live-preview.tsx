"use client";

import { Button } from "@/components/ui";
import type { GenerateResponse } from "./types";

function renderNeonWriteText(text: string) {
  return text.split("").map((char, index) => (
    <span key={`${index}-${char === "\n" ? "nl" : char}`} className="write-char-neon">
      {char}
    </span>
  ));
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

/** Right-hand preview card: types out the generated subject/body with the neon write effect. */
export function LivePreview({
  result,
  animatedSubject,
  animatedBody,
}: {
  result: GenerateResponse | null;
  animatedSubject: string;
  animatedBody: string;
}) {
  return (
    <div className="glass-card hourlogger-surface min-w-0 w-full self-stretch rounded-2xl p-4 md:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold md:text-xl">Live Preview</h2>
        {result && (
          <Button
            variant="glass-quiet"
            size="xs"
            className="px-3"
            onClick={() => {
              void copyText(`Subject: ${result.subject}\n\n${result.body}`);
            }}
          >
            Copy plain text
          </Button>
        )}
      </div>
      {!result ? (
        <p className="mt-4 text-sm text-ink-2/75">Generated text appears here in real time.</p>
      ) : (
        <div className="mt-4">
          <div className="rounded-lg border border-glass/15 bg-panel/40 p-3">
            <div className="relative whitespace-pre-wrap text-xs leading-6">
              <p className="pointer-events-none absolute right-0 top-0 max-w-[55%] text-right text-accent-soft/95">
                {renderNeonWriteText(animatedSubject)}
              </p>
              <pre className="whitespace-pre-wrap text-xs leading-6">{renderNeonWriteText(animatedBody)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
