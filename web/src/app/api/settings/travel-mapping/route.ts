import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type TravelMapping = {
  clientColumn: string;
  locationColumn: string;
  responsibleColumn: string;
};

function normalizeColumnLetter(value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text) return "";
  if (!/^[A-Z]+$/.test(text)) return "";
  return text;
}

function readMappingFromUserMetadata(rawMetadata: unknown): TravelMapping {
  if (!rawMetadata || typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) {
    return { clientColumn: "", locationColumn: "", responsibleColumn: "" };
  }
  const metadata = rawMetadata as Record<string, unknown>;
  const mappingRaw = metadata.travel_sheet_mapping;
  if (!mappingRaw || typeof mappingRaw !== "object" || Array.isArray(mappingRaw)) {
    return { clientColumn: "", locationColumn: "", responsibleColumn: "" };
  }
  const mapping = mappingRaw as Record<string, unknown>;
  return {
    clientColumn: normalizeColumnLetter(mapping.clientColumn),
    locationColumn: normalizeColumnLetter(mapping.locationColumn),
    responsibleColumn: normalizeColumnLetter(mapping.responsibleColumn),
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(readMappingFromUserMetadata(user.user_metadata));
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = (await request.json()) as Partial<TravelMapping>;
  const nextMapping: TravelMapping = {
    clientColumn: normalizeColumnLetter(payload.clientColumn),
    locationColumn: normalizeColumnLetter(payload.locationColumn),
    responsibleColumn: normalizeColumnLetter(payload.responsibleColumn),
  };

  if (!nextMapping.clientColumn || !nextMapping.locationColumn || !nextMapping.responsibleColumn) {
    return NextResponse.json(
      { error: "All mapping fields are required and must be valid column letters (A, B, AA...)." },
      { status: 400 },
    );
  }

  const previousMetadata =
    user.user_metadata && typeof user.user_metadata === "object" && !Array.isArray(user.user_metadata)
      ? (user.user_metadata as Record<string, unknown>)
      : {};
  const previousMapping =
    previousMetadata.travel_sheet_mapping &&
    typeof previousMetadata.travel_sheet_mapping === "object" &&
    !Array.isArray(previousMetadata.travel_sheet_mapping)
      ? (previousMetadata.travel_sheet_mapping as Record<string, unknown>)
      : {};

  const mergedMetadata = {
    ...previousMetadata,
    travel_sheet_mapping: {
      ...previousMapping,
      clientColumn: nextMapping.clientColumn,
      locationColumn: nextMapping.locationColumn,
      responsibleColumn: nextMapping.responsibleColumn,
    },
  };

  const { error } = await supabase.auth.updateUser({ data: mergedMetadata });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, ...nextMapping });
}
