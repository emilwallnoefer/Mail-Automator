"use client";

export function WeekStepper({
  onPrev,
  onToday,
  onNext,
  todayLabel = "This week",
}: {
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
  todayLabel?: string;
}) {
  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-white/15 bg-white/5 text-xs">
      <button
        type="button"
        onClick={onPrev}
        title="Previous week"
        aria-label="Previous week"
        className="px-2.5 py-1.5 text-slate-200 transition hover:bg-white/10"
      >
        <span aria-hidden>&larr;</span>
      </button>
      <button
        type="button"
        onClick={onToday}
        className="border-x border-white/10 px-3 py-1.5 text-slate-200 transition hover:bg-white/10"
      >
        {todayLabel}
      </button>
      <button
        type="button"
        onClick={onNext}
        title="Next week"
        aria-label="Next week"
        className="px-2.5 py-1.5 text-slate-200 transition hover:bg-white/10"
      >
        <span aria-hidden>&rarr;</span>
      </button>
    </div>
  );
}
