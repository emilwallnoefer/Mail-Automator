import { describe, expect, it } from "vitest";
import { CHANGE_OPTIONS, type MailLanguage } from "./change-options";
import {
  BASELINE_PRE_CHANGE_IDS,
  DISCIPLINE_LABEL,
  DISCIPLINE_PRE_CHANGE_IDS,
  LAUSANNE_SITE_OPTIONS,
  TRAINING_DISCIPLINES,
  buildAgendaBlock,
  defaultPreChangeIds,
  facilityPrepBlock,
  flightSiteLine,
  type PreAgendaInput,
  type TrainingDiscipline,
} from "./training-disciplines";

const LANGS: MailLanguage[] = ["en", "de", "fr"];

function agenda(input: Partial<PreAgendaInput> = {}): string {
  return buildAgendaBlock({ language: "en", ...input });
}

describe("catalog invariants", () => {
  it("labels every discipline in every language", () => {
    for (const discipline of TRAINING_DISCIPLINES) {
      for (const lang of LANGS) {
        expect(DISCIPLINE_LABEL[discipline][lang]?.trim(), `${discipline}/${lang}`).toBeTruthy();
      }
    }
  });

  it("gives every discipline the same number of bullets in all three languages", () => {
    // A translation dropped on the floor would silently shorten one language's
    // agenda; rendering each language is the only way to compare them.
    for (const discipline of TRAINING_DISCIPLINES) {
      const counts = LANGS.map(
        (language) => agenda({ language, day1_disciplines: [discipline] }).split("\n").length,
      );
      expect(new Set(counts).size, discipline).toBe(1);
    }
  });

  it("points every pre-reading default at an id that exists in the change catalog", () => {
    const known = new Set(CHANGE_OPTIONS.map((o) => o.id));
    for (const id of BASELINE_PRE_CHANGE_IDS) expect(known.has(id), id).toBe(true);
    for (const [discipline, ids] of Object.entries(DISCIPLINE_PRE_CHANGE_IDS)) {
      for (const id of ids) expect(known.has(id), `${discipline} → ${id}`).toBe(true);
    }
  });

  it("offers a site option for every Lausanne site, with no duplicates", () => {
    const ids = LAUSANNE_SITE_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("buildAgendaBlock", () => {
  it("renders a heading, a day title and bullets", () => {
    expect(agenda({ day1_disciplines: ["intro"] })).toBe(
      [
        "Agenda:",
        "Day 1 - Intro",
        "* Safety, limits, and best practices",
        "* Elios 3 setup (payloads, batteries, RC, cockpit checks)",
        "* Core flight exercises (LOS/FPV, stability, ATTI recovery)",
        "* Intro to the data workflow in Inspector",
      ].join("\n"),
    );
  });

  it("translates the heading and the day word", () => {
    expect(agenda({ language: "de", day1_disciplines: ["intro"] }).startsWith("Agenda:\nTag 1 - Einführung")).toBe(
      true,
    );
    expect(agenda({ language: "fr", day1_disciplines: ["intro"] }).startsWith("Programme :\nJour 1 - Intro")).toBe(
      true,
    );
  });

  it("emits a bare day title when no discipline is picked for that day", () => {
    expect(agenda({ day_count: 2, day1_disciplines: ["ut"] })).toContain("\nDay 2");
    expect(agenda()).toBe("Agenda:\nDay 1");
  });

  it("joins several disciplines of one day with a slash, in the order given", () => {
    const block = agenda({ day1_disciplines: ["tether", "intro"] });
    expect(block.split("\n")[1]).toBe("Day 1 - Tether / Intro");
  });

  it("renders as many days as day_count, clamped to 1–3", () => {
    // Days are separated by a blank line; the trailing one is trimmed off.
    const three = agenda({ day_count: 3 });
    expect(three.split("\n")).toEqual(["Agenda:", "Day 1", "", "Day 2", "", "Day 3"]);
    expect(agenda({ day_count: 0 as unknown as 1 })).toBe("Agenda:\nDay 1");
    expect(agenda({ day_count: 9 as unknown as 3 })).toBe(three);
    // Disciplines picked for a day beyond the count are simply not rendered.
    expect(agenda({ day_count: 1, day2_disciplines: ["ut"] })).toBe("Agenda:\nDay 1");
  });

  it("ignores a discipline that is not in the catalog", () => {
    const block = agenda({ day1_disciplines: ["intro", "kite_flying" as TrainingDiscipline] });
    expect(block.split("\n")[1]).toBe("Day 1 - Intro");
  });

  it("collapses AIIM parts 1 and 2 into one block when they share a day", () => {
    const sameDay = agenda({ day1_disciplines: ["aiim_1", "aiim_2"] });
    expect(sameDay.split("\n")[1]).toBe("Day 1 - AIIM");
    expect(sameDay).toContain("* Practice flight (AIIM scenario)");
    // The combined block is the original, unsplit agenda — not the two halves.
    expect(sameDay).not.toContain("advanced AIIM scenario");
    expect(sameDay).toContain("* Mission planning and risk mitigation");
    expect(sameDay).toContain("* Data download and reporting in Inspector");
  });

  it("keeps the AIIM parts split when they land on different days", () => {
    const split = agenda({ day_count: 2, day1_disciplines: ["aiim_1"], day2_disciplines: ["aiim_2"] });
    expect(split).toContain("Day 1 - AIIM Part 1");
    expect(split).toContain("Day 2 - AIIM Part 2");
    expect(split).toContain("* Practice flight (advanced AIIM scenario)");
  });

  it("puts the collapsed AIIM block in the slot of whichever part came first", () => {
    const block = agenda({ day1_disciplines: ["ut", "aiim_2", "aiim_1"] });
    expect(block.split("\n")[1]).toBe("Day 1 - UT / AIIM");
  });

  it("weaves the day's site into the practical-flight bullet only", () => {
    const block = agenda({ day1_disciplines: ["intro"], day1_site: "montetan" });
    expect(block).toContain("* Core flight exercises in Montétan in Lausanne (LOS/FPV");
    expect(block).toContain("* Safety, limits, and best practices");
    expect(block).not.toContain("Safety, limits, and best practices in");
  });

  it("uses the French preposition and place name", () => {
    const block = agenda({ language: "fr", day1_disciplines: ["intro"], day1_site: "tridel" });
    expect(block).toContain("Exercices de vol de base à Tridel (Lausanne) (LOS/FPV");
  });

  it("uses each day's own site", () => {
    const block = agenda({
      day_count: 2,
      day1_disciplines: ["intro"],
      day2_disciplines: ["ut"],
      day1_site: "bunker",
      day2_site: "tank_bern",
    });
    expect(block).toContain("Core flight exercises in Bunker in Lausanne");
    expect(block).toContain("Practice flight with the UT payload in Bern");
  });

  it("never leaks the {SITE_CLAUSE} placeholder, with or without a site", () => {
    for (const lang of LANGS) {
      for (const discipline of TRAINING_DISCIPLINES) {
        expect(agenda({ language: lang, day1_disciplines: [discipline] })).not.toContain("{SITE_CLAUSE}");
        expect(
          agenda({ language: lang, day1_disciplines: [discipline], day1_site: "tridel" }),
        ).not.toContain("{SITE_CLAUSE}");
      }
      expect(agenda({ language: lang, day1_disciplines: ["aiim_1", "aiim_2"], day1_site: "tridel" })).not.toContain(
        "{SITE_CLAUSE}",
      );
    }
  });

  it("has no trailing blank line between the last bullet and the end", () => {
    const block = agenda({ day_count: 2, day1_disciplines: ["intro"], day2_disciplines: ["ut"] });
    expect(block.endsWith("Inspector")).toBe(true);
    expect(block).toContain("\n\nDay 2 - UT");
  });
});

describe("flightSiteLine", () => {
  const lausanne = (extra: Partial<PreAgendaInput>): string =>
    flightSiteLine({ language: "en", template_variant: "lausanne", ...extra });

  it("is empty for anything but the Lausanne template", () => {
    expect(flightSiteLine({ language: "en", day1_site: "tank_bern" })).toBe("");
    expect(flightSiteLine({ language: "en", template_variant: "abroad", day1_site: "tank_bern" })).toBe("");
  });

  it("is empty when no selected site needs gear", () => {
    expect(lausanne({})).toBe("");
    expect(lausanne({ day1_site: "tridel" })).toBe("");
    expect(lausanne({ day1_site: "montetan" })).toBe("");
  });

  it("states the gear inline for a single day", () => {
    expect(lausanne({ day1_site: "tank_bern" })).toBe("Please bring: safety shoes, vest, helmet.");
    expect(lausanne({ language: "fr", day1_site: "aigle_bridge" })).toBe(
      "Merci d'apporter : casque, chaussures de sécurité.",
    );
  });

  it("lists one bullet per gear-requiring day when the training runs longer", () => {
    expect(
      lausanne({ day_count: 3, day1_site: "tridel", day2_site: "tank_bern", day3_site: "aigle_bridge" }),
    ).toBe(
      ["Please bring:", "* Day 2 (Bern): safety shoes, vest, helmet", "* Day 3 (Aigle): helmet, safety shoes"].join(
        "\n",
      ),
    );
  });

  it("ignores sites picked for days beyond the day count", () => {
    expect(lausanne({ day_count: 1, day2_site: "tank_bern" })).toBe("");
  });
});

describe("facilityPrepBlock", () => {
  const abroad = (extra: Partial<PreAgendaInput>, singular = false): string =>
    facilityPrepBlock({ language: "en", template_variant: "abroad", ...extra }, singular);

  it("is empty for anything but the abroad template", () => {
    expect(facilityPrepBlock({ language: "en" })).toBe("");
    expect(facilityPrepBlock({ language: "en", template_variant: "lausanne" })).toBe("");
  });

  it("asks for a simple flying area on a one-day training", () => {
    const block = abroad({ day_count: 1 });
    expect(block.split("\n")[0]).toBe("Before the training, please have ready:");
    expect(block).toContain("* A room or area for theory and data processing");
    expect(block).toContain("* A simple, accessible area");
    expect(block).not.toContain("representative");
  });

  it("asks for a representative asset from two days on", () => {
    for (const day_count of [2, 3] as const) {
      expect(abroad({ day_count })).toContain("* Access to an asset representative of where you will use");
    }
  });

  it("switches German and French to the singular address for one named recipient", () => {
    expect(abroad({ language: "de" }, true)).toContain("Bitte stelle vor dem Training bereit:");
    expect(abroad({ language: "de" }, false)).toContain("Bitte stellt vor dem Training bereit:");
    expect(abroad({ language: "de", day_count: 2 }, true)).toContain("deinem realen Einsatz");
    expect(abroad({ language: "de", day_count: 2 }, false)).toContain("eurem realen Einsatz");
    expect(abroad({ language: "fr", day_count: 2 }, true)).toContain("tu utiliseras le drone");
    expect(abroad({ language: "fr", day_count: 2 }, false)).toContain("vous utiliserez le drone");
  });

  it("has no plural/singular split in English", () => {
    expect(abroad({ day_count: 2 }, true)).toBe(abroad({ day_count: 2 }, false));
  });
});

describe("defaultPreChangeIds", () => {
  const ids = (extra: Partial<PreAgendaInput>) => defaultPreChangeIds({ language: "en", ...extra });

  it("always offers the baseline, even with nothing selected", () => {
    expect(ids({})).toEqual(BASELINE_PRE_CHANGE_IDS);
  });

  it("adds each discipline's pre-reading after the baseline", () => {
    expect(ids({ day1_disciplines: ["tether"] })).toEqual([...BASELINE_PRE_CHANGE_IDS, "useful_tether"]);
  });

  it("de-duplicates across days and against the baseline", () => {
    const result = ids({
      day_count: 2,
      day1_disciplines: ["intro", "faro_connect"],
      day2_disciplines: ["surveying", "faro_connect"],
    });
    expect(new Set(result).size).toBe(result.length);
    // `intro` maps to material_intro, which is already in the baseline.
    expect(result.filter((id) => id === "material_intro").length).toBe(1);
    // surveying and faro_connect share useful_faro_deck.
    expect(result.filter((id) => id === "useful_faro_deck").length).toBe(1);
  });

  it("collects disciplines in the canonical catalog order, not the order picked", () => {
    const result = ids({ day_count: 2, day1_disciplines: ["gas_sensor"], day2_disciplines: ["ut"] });
    expect(result).toEqual([
      ...BASELINE_PRE_CHANGE_IDS,
      "useful_intro_ut",
      "useful_ut_advanced",
      "useful_ut_probe",
      "useful_gas_sensor",
    ]);
  });

  it("ignores days beyond the day count", () => {
    expect(ids({ day_count: 1, day2_disciplines: ["ut"] })).toEqual(BASELINE_PRE_CHANGE_IDS);
  });

  it("maps both AIIM parts to the same deck", () => {
    expect(ids({ day1_disciplines: ["aiim_1", "aiim_2"] })).toEqual([
      ...BASELINE_PRE_CHANGE_IDS,
      "material_aiim",
    ]);
  });
});
