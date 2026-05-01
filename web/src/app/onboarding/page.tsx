import { CHANGE_OPTIONS, RESOURCE_SECTION_ORDER, resourceSectionLabel } from "@/lib/change-options";
import trainingLinks from "@/mail-config/training-links.json";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { OnboardingWorkspace } from "@/components/onboarding-workspace";
import { redirect } from "next/navigation";

type OnboardingItem = {
  id: string;
  title: string;
  description: string;
  url: string;
  estimatedMinutes: number;
};

type OnboardingSection = {
  id: string;
  title: string;
  items: OnboardingItem[];
};

function resolveOnboardingUrl(linkKey?: string, directUrl?: string) {
  if (directUrl && directUrl.trim()) return directUrl.trim();
  if (!linkKey) return "";
  const links = trainingLinks as Record<string, string>;
  return links[linkKey] ?? "";
}

/** Curated from https://www.flyability.com/resources (Case studies filter). */
const CASE_STUDIES: OnboardingItem[] = [
  {
    id: "case_study_shell_canusa_offshore",
    title: "CAN-USA and Shell redefine offshore inspections with the Elios 3 UT",
    description:
      "Maritime and oil & gas: offshore inspections with localized UT and LiDAR, tether power, and Inspector workflows — complementary to rope access.",
    url: "https://www.flyability.com/casestudies/offshore-inspections-at-shell-with-elios-3-ndt-drone",
    estimatedMinutes: 20,
  },
  {
    id: "case_study_gold_mine_stope",
    title: "125% more data in gold mine stope surveys with the Elios 3",
    description:
      "Mining: narrow stope scanning with the surveying payload — higher coverage vs. handheld methods in minutes, with visual + LiDAR in Inspector.",
    url: "https://www.flyability.com/casestudies/gold-mine-drone-survey",
    estimatedMinutes: 18,
  },
  {
    id: "case_study_niagara_sewer",
    title: "Surveying 450 meters of damaged sewers in one day at Niagara Falls",
    description:
      "Wastewater / sewer: engineering-grade visual and LiDAR for relining design without confined-space entry — NASSCO-aligned deliverables.",
    url: "https://www.flyability.com/casestudies/sewer-relining-survey",
    estimatedMinutes: 18,
  },
  {
    id: "case_study_indoor_waterpark",
    title: "Inspecting indoor waterparks with the Elios 3",
    description:
      "Infrastructure / facilities: overhead structure and MEP inspection without scaffolding — POIs localized in 3D for maintenance tracking.",
    url: "https://www.flyability.com/casestudies/drone-indoor-waterpark-inspection",
    estimatedMinutes: 18,
  },
  {
    id: "case_study_powerplant_shutdown",
    title: "Drone inspection cuts 300+ hours of work in an emergency power plant shutdown",
    description:
      "Power generation: furnace / coal burner assessment during outage — remote visual inspection to scope only what truly needs teardown.",
    url: "https://www.flyability.com/casestudies/drone-inspection-emergency-powerplant-shutdown",
    estimatedMinutes: 18,
  },
  {
    id: "case_study_forestry_scan",
    title: "10-minute forestry scans with the Elios 3 drone",
    description:
      "Forestry / surveying: plantation plots scanned above and below canopy with the surveying payload — minutes vs. hours of handheld work.",
    url: "https://www.flyability.com/casestudies/drone-forestry-scan",
    estimatedMinutes: 12,
  },
];

function estimateTrainingMinutes(id: string): number {
  const estimates: Record<string, number> = {
    material_intro: 90,
    material_aiim: 150,
    material_method_statement: 45,
    material_risk_assessment: 60,
    material_sop: 45,

    useful_intro_ut: 90,
    useful_ut_advanced: 120,
    useful_ut_probe: 60,
    useful_faro_deck: 75,
    useful_water_wastewater_deck: 90,
    useful_cement_deck: 90,

    useful_faro_online: 180,
    thinkific_regulation: 150,
    thinkific_gas_sensor: 120,
    thinkific_cement: 120,
    thinkific_mining: 120,
    thinkific_wastewater: 120,
    thinkific_faro_connect: 180,
    useful_wastewater_course: 180,
    useful_academy_hub: 30,

    useful_gas_sensor: 25,
    useful_rad_video: 25,
    useful_battery: 20,
    useful_tether: 20,
    useful_tent: 10,
  };
  return estimates[id] ?? 60;
}

function buildSectionItems(): OnboardingSection[] {
  const excludedIds = new Set(["useful_youtube", "useful_academy_hub"]);
  const allowedSections = new Set(["other_trainings", "online_courses", "videos"]);

  const materialItems: OnboardingItem[] = CHANGE_OPTIONS.filter((option) => option.category === "training_material")
    .filter((option) => !excludedIds.has(option.id))
    .map((option) => ({
      id: option.id,
      title: option.label_en,
      description: option.desc_en,
      url: resolveOnboardingUrl(option.link_key, option.url),
      estimatedMinutes: estimateTrainingMinutes(option.id),
    }))
    .filter((item) => item.url);

  const usefulSections = RESOURCE_SECTION_ORDER.map((sectionId) => {
    const items = CHANGE_OPTIONS.filter(
      (option) =>
        option.category !== "training_material" &&
        !excludedIds.has(option.id) &&
        option.resourceSection != null &&
        allowedSections.has(option.resourceSection) &&
        option.resourceSection === sectionId &&
        resolveOnboardingUrl(option.link_key, option.url),
    ).map((option) => ({
      id: option.id,
      title: option.label_en,
      description: option.desc_en,
      url: resolveOnboardingUrl(option.link_key, option.url),
      estimatedMinutes: estimateTrainingMinutes(option.id),
    }));

    return {
      title: resourceSectionLabel(sectionId, "en"),
      items,
    };
  }).filter((section) => section.items.length > 0);

  return [
    { id: "training-slide-decks", title: "Training slide decks", items: materialItems },
    { id: "case-studies", title: "Case studies", items: CASE_STUDIES },
    ...usefulSections.map((section) => ({
      id: section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      title: section.title,
      items: section.items,
    })),
  ];
}

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const sections = buildSectionItems();

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 aurora-bg" />
      <section className="page-shell relative z-[1]">
        <div className="glass-card sticky top-3 z-[90] !overflow-visible p-2.5 md:p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] uppercase tracking-[0.16em] text-cyan-200/70">Pilot Resources</p>
              <h1 className="text-sm font-semibold md:text-base">Onboarding</h1>
            </div>
            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/8 px-3 py-1.5 text-xs transition hover:bg-white/12"
            >
              Back to workspace
            </a>
          </div>
        </div>
        <OnboardingWorkspace email={user.email ?? "pilot"} sections={sections} />
      </section>
    </main>
  );
}
