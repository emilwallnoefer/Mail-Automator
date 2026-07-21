// @vitest-environment jsdom
/**
 * Regression test for the "save → unsave → save" flicker.
 *
 * A save is optimistic, and a debounced background reconcile refetches the
 * authoritative week afterwards. The bug: `runReconcile` only checks for
 * in-flight writes *before* starting, so a save landing while the reconcile's
 * own GET is in flight got overwritten by server state that predated it — the
 * value visibly reverted, then reappeared on the next reconcile.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimeTracker } from "./use-time-tracker";
import { getMonday, toDateKey, type DayData, type WeekResponse } from "./types";

vi.mock("@/lib/ui-sounds", () => ({
  playUiSound: () => {},
  stopUiSound: () => {},
}));

const WEEK_START = toDateKey(getMonday());

function day(date: string, overrides: Partial<DayData> = {}): DayData {
  return {
    date,
    start_time: "",
    stop_time: "",
    net_mins: 0,
    holiday: false,
    public_holiday: false,
    sick_leave: false,
    comp_mins: 0,
    comp_note: "",
    breaks: [],
    ...overrides,
  };
}

function weekWith(days: DayData[]): WeekResponse {
  return {
    week_start: WEEK_START,
    week_end: WEEK_START,
    target_mins: 504,
    week_hours_mins: days.reduce((sum, d) => sum + d.net_mins, 0),
    overtime_bank_mins: 0,
    days,
    includes_travel: false,
  };
}

/** The week as the server currently has it; tests mutate this to model writes. */
let serverDays: DayData[];
/** Resolvers for GETs we want to hold open mid-flight. */
let pendingGets: Array<() => void>;
let holdGets = false;

beforeEach(() => {
  serverDays = [day(WEEK_START), day(addDaysKey(WEEK_START, 1))];
  pendingGets = [];
  holdGets = false;

  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    void input;
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as {
        action: string;
        day?: { work_date: string; start_time: string; stop_time: string; net_mins: number };
      };
      if (body.action === "save_day" && body.day) {
        const saved = body.day;
        serverDays = serverDays.map((d) =>
          d.date === saved.work_date
            ? { ...d, start_time: saved.start_time, stop_time: saved.stop_time, net_mins: saved.net_mins }
            : d,
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }
    // GET week
    const snapshot = weekWith(serverDays.map((d) => ({ ...d })));
    const respond = () => new Response(JSON.stringify(snapshot), { status: 200 });
    if (!holdGets) return Promise.resolve(respond());
    return new Promise<Response>((resolve) => {
      pendingGets.push(() => resolve(respond()));
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function addDaysKey(key: string, delta: number) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d + delta);
  return toDateKey(date);
}

async function saveDay(
  result: { current: ReturnType<typeof useTimeTracker> },
  date: string,
  start: string,
  stop: string,
) {
  act(() => {
    result.current.handleEditDay(date);
  });
  await waitFor(() => expect(result.current.selectedDate).toBe(date));
  act(() => {
    result.current.setFormStart(start);
    result.current.setFormStop(stop);
  });
  await waitFor(() => expect(result.current.formStart).toBe(start));
  act(() => {
    result.current.handleSaveDay();
  });
}

function netFor(state: ReturnType<typeof useTimeTracker>, date: string) {
  return state.data?.days.find((d) => d.date === date)?.net_mins ?? null;
}

describe("time tracker save reconcile", () => {
  it("keeps a save that lands while the reconcile GET is in flight", async () => {
    const dayA = WEEK_START;
    const dayB = addDaysKey(WEEK_START, 1);

    const { result } = renderHook(() =>
      useTimeTracker({ initialWeek: weekWith(serverDays.map((d) => ({ ...d }))) }),
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());

    // 1. Save day A and let its reconcile run to completion.
    await saveDay(result, dayA, "09:00", "17:00");
    await waitFor(() => expect(netFor(result.current, dayA)).toBe(480));

    // 2. Hold the next GET open so the reconcile is mid-flight.
    holdGets = true;
    await new Promise((r) => setTimeout(r, 900)); // let the 700ms debounce fire
    await waitFor(() => expect(pendingGets.length).toBeGreaterThan(0));

    // 3. Save day B *while* that GET is still in flight. The captured server
    //    snapshot therefore predates B.
    await saveDay(result, dayB, "08:00", "12:00");
    await waitFor(() => expect(netFor(result.current, dayB)).toBe(240));

    // 4. Let the stale reconcile response land.
    holdGets = false;
    act(() => {
      pendingGets.forEach((resolve) => resolve());
      pendingGets = [];
    });

    // B must not be wiped by the reconcile that predates it.
    await new Promise((r) => setTimeout(r, 50));
    expect(netFor(result.current, dayB)).toBe(240);
    expect(netFor(result.current, dayA)).toBe(480);
  }, 20000);
});
