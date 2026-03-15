import { DEFAULT_INCLUDED_CHANGE_IDS } from "@/lib/change-options";
import industryLinks from "@/mail-config/industry-training-links.json";
import { MailInput } from "@/lib/mail-engine";

type Course = {
  id: string;
  keywords: string[];
};

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWebContext(companyName: string, useCase: string) {
  const query = `${companyName} ${useCase}`.trim();
  if (!query) return "";

  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mail-Automator/1.0",
      },
      cache: "no-store",
    });
    if (!response.ok) return "";
    const html = await response.text();
    return stripHtml(html).slice(0, 4000);
  } catch {
    return "";
  } finally {
    clearTimeout(timeoutId);
  }
}

function countKeywordHits(source: string, keywords: string[]) {
  if (!source) return 0;
  let count = 0;
  for (const kw of keywords) {
    const needle = kw.toLowerCase().trim();
    if (!needle) continue;
    if (source.includes(needle)) count += 1;
  }
  return count;
}

export async function enrichWithAutoResearch(input: MailInput): Promise<MailInput> {
  if (input.mail_type !== "post") return input;
  if (input.included_change_ids && input.included_change_ids.length > 0) return input;

  const webContext = await fetchWebContext(input.company_name, input.use_case ?? "");
  const primarySource = `${input.company_name} ${input.use_case ?? ""}`.toLowerCase();
  const webSource = webContext.toLowerCase();

  const included = new Set(DEFAULT_INCLUDED_CHANGE_IDS);

  if (/\b(intro|basic|one day|1day)\b/.test(primarySource)) included.delete("material_aiim");
  if (/\b(aiim|advanced|complex inspection|inspection methodology)\b/.test(primarySource)) included.add("material_aiim");

  if (/\b(point cloud|bim|survey|surveying|scan to bim|faro)\b/.test(`${primarySource} ${webSource}`)) {
    included.add("useful_nubigon");
    included.add("thinkific_faro_connect");
  }

  if (/\b(ut|ultrasonic|thickness|ndt|corrosion)\b/.test(`${primarySource} ${webSource}`)) {
    included.add("useful_intro_ut");
    included.add("thinkific_elios3_ut");
  }

  const courses = ((industryLinks.courses as Course[]) ?? []).filter((course) => course.id && course.keywords?.length);
  for (const course of courses) {
    const strongHits = countKeywordHits(primarySource, course.keywords);
    const weakHits = countKeywordHits(webSource, course.keywords);

    // Strong signal from user input always counts.
    // Weak web signal needs at least 2 keyword matches to avoid false positives.
    if (strongHits >= 1 || weakHits >= 2) {
      included.add(`thinkific_${course.id}`);
    }
  }

  return {
    ...input,
    company_research_text: webContext,
    included_change_ids: [...included],
  };
}

