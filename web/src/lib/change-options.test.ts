import { describe, expect, it } from "vitest";
import industryLinks from "@/mail-config/industry-training-links.json";
import {
  CHANGE_OPTIONS,
  DEFAULT_INCLUDED_CHANGE_IDS,
  OTHER_TRAININGS_DISPLAY_ORDER,
  RESOURCE_SECTION_LABELS,
  RESOURCE_SECTION_OMIT_EMAIL_SUBHEADING,
  RESOURCE_SECTION_ORDER,
  THINKIFIC_ONLINE_COURSES_ORDER,
  getChangeOptionLabelDesc,
  getOnlineCoursesOptionsInOrder,
  getOtherTrainingsOptionsInOrder,
  getThinkificOnlineCoursesInOrder,
  resourceSectionEmailIntro,
  resourceSectionLabel,
  type ChangeOption,
  type MailLanguage,
} from "./change-options";

const LANGS: MailLanguage[] = ["en", "de", "fr"];

const option = (id: string): ChangeOption => {
  const found = CHANGE_OPTIONS.find((o) => o.id === id);
  if (!found) throw new Error(`no such option: ${id}`);
  return found;
};

describe("the catalog", () => {
  it("has no duplicate ids — ids key the selection state and the mail renderer", () => {
    const ids = CHANGE_OPTIONS.map((o) => o.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it("gives every option all three languages for both label and description", () => {
    for (const o of CHANGE_OPTIONS) {
      for (const field of ["label_en", "label_de", "label_fr", "desc_en", "desc_de", "desc_fr"] as const) {
        expect(o[field]?.trim(), `${o.id}.${field}`).toBeTruthy();
      }
    }
  });

  it("gives every option a way to resolve a URL: a link_key or a url", () => {
    for (const o of CHANGE_OPTIONS) {
      expect(Boolean(o.link_key) || Boolean(o.url), o.id).toBe(true);
    }
  });

  it("uses only known categories, and pairs each with its expected shape", () => {
    for (const o of CHANGE_OPTIONS) {
      expect(["training_material", "useful_link", "thinkific"]).toContain(o.category);
      // Training material is the main block; only suggested links are grouped.
      if (o.category === "training_material") expect(o.resourceSection, o.id).toBeUndefined();
      else expect(RESOURCE_SECTION_ORDER, o.id).toContain(o.resourceSection!);
      if (o.category === "thinkific") expect(o.course_id, o.id).toBeTruthy();
    }
  });

  it("defaults to checked only for the core training material and two staples", () => {
    expect(DEFAULT_INCLUDED_CHANGE_IDS).toEqual([
      "material_intro",
      "material_aiim",
      "material_method_statement",
      "material_risk_assessment",
      "material_sop",
      "useful_knowledge_base",
      "useful_inspector",
    ]);
    // The derived list must agree with the flag it is derived from.
    for (const o of CHANGE_OPTIONS) {
      expect(DEFAULT_INCLUDED_CHANGE_IDS.includes(o.id), o.id).toBe(o.default_checked);
    }
  });
});

describe("Thinkific options built from industry-training-links.json", () => {
  const courses = industryLinks.courses;

  it("creates one option per course, id-prefixed so it cannot collide with a useful_link", () => {
    const thinkific = CHANGE_OPTIONS.filter((o) => o.category === "thinkific");
    expect(thinkific.length).toBe(courses.length);
    for (const course of courses) {
      const built = option(`thinkific_${course.id}`);
      expect(built.course_id).toBe(course.id);
      expect(built.url).toBe(course.url);
      expect(built.label_en).toBe(course.label_en);
      expect(built.resourceSection).toBe("online_courses");
      expect(built.default_checked).toBe(false);
    }
  });

  it("writes a bespoke description for every course in the JSON", () => {
    // The generic fallback is a safety net; a course shipping with it means the
    // description table was not updated alongside the catalog.
    const generic = "Academy course covering additional industry or payload context";
    for (const course of courses) {
      expect(option(`thinkific_${course.id}`).desc_en.startsWith(generic), course.id).toBe(false);
    }
  });
});

describe("display order lists", () => {
  it("lists every 'other trainings' option exactly once", () => {
    const inSection = CHANGE_OPTIONS.filter((o) => o.resourceSection === "other_trainings").map((o) => o.id);
    expect([...OTHER_TRAININGS_DISPLAY_ORDER].sort()).toEqual([...inSection].sort());
  });

  it("lists every 'online courses' option exactly once", () => {
    // A course missing from this list is invisible in the composer and the mail.
    const inSection = CHANGE_OPTIONS.filter((o) => o.resourceSection === "online_courses").map((o) => o.id);
    expect([...THINKIFIC_ONLINE_COURSES_ORDER].sort()).toEqual([...inSection].sort());
  });

  it("resolves in list order and drops ids the catalog does not know", () => {
    const resolved = getOtherTrainingsOptionsInOrder();
    expect(resolved.map((o) => o.id)).toEqual(OTHER_TRAININGS_DISPLAY_ORDER);

    const partial = getOtherTrainingsOptionsInOrder([option("useful_faro_deck"), option("useful_intro_ut")]);
    expect(partial.map((o) => o.id)).toEqual(["useful_intro_ut", "useful_faro_deck"]);
    expect(getOtherTrainingsOptionsInOrder([])).toEqual([]);
  });

  it("concatenates both lists for the combined legacy ordering", () => {
    expect(getOnlineCoursesOptionsInOrder().map((o) => o.id)).toEqual([
      ...getOtherTrainingsOptionsInOrder().map((o) => o.id),
      ...getThinkificOnlineCoursesInOrder().map((o) => o.id),
    ]);
  });
});

describe("localisation helpers", () => {
  it("picks the language's label and description, defaulting to English", () => {
    const o = option("material_intro");
    expect(getChangeOptionLabelDesc(o, "de").label).toBe(o.label_de);
    expect(getChangeOptionLabelDesc(o, "fr").desc).toBe(o.desc_fr);
    expect(getChangeOptionLabelDesc(o, "en")).toEqual({ label: o.label_en, desc: o.desc_en });
    // Anything unexpected falls back to English rather than rendering undefined.
    expect(getChangeOptionLabelDesc(o, "it" as MailLanguage).label).toBe(o.label_en);
  });

  it("labels every section in every language, distinctly", () => {
    for (const section of RESOURCE_SECTION_ORDER) {
      const labels = LANGS.map((lang) => resourceSectionLabel(section, lang));
      for (const label of labels) expect(label.trim(), section).toBeTruthy();
      expect(resourceSectionLabel(section, "de")).toBe(RESOURCE_SECTION_LABELS[section].de);
    }
    const english = RESOURCE_SECTION_ORDER.map((s) => resourceSectionLabel(s, "en"));
    expect(new Set(english).size).toBe(english.length);
  });

  it("returns an email intro only for the sections that define one", () => {
    expect(resourceSectionEmailIntro("videos", "fr")).toContain("Vidéos");
    expect(resourceSectionEmailIntro("videos", "en")).toBe(resourceSectionEmailIntro("videos", "en"));
    for (const section of RESOURCE_SECTION_ORDER) {
      if (section === "videos") continue;
      expect(resourceSectionEmailIntro(section, "en"), section).toBeUndefined();
    }
  });

  it("suppresses the email sub-heading only where the block title already says it", () => {
    expect(RESOURCE_SECTION_OMIT_EMAIL_SUBHEADING.has("other_useful_links")).toBe(true);
    expect(RESOURCE_SECTION_OMIT_EMAIL_SUBHEADING.has("videos")).toBe(false);
  });
});
