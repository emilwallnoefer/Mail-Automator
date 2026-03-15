import { MailInput, renderMail } from "@/lib/mail-engine";
import { enrichWithAutoResearch } from "@/lib/company-research";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as MailInput;

    const requiredBase: Array<keyof MailInput> = ["mail_type", "language", "recipient_name"];
    const requiredPost: Array<keyof MailInput> = ["company_name", "use_case"];
    const requiredPreBase: Array<keyof MailInput> = ["template_variant", "training_type", "date"];
    const requiredPre: Array<keyof MailInput> =
      payload.template_variant === "abroad" ? [...requiredPreBase, "location"] : requiredPreBase;
    const required = payload.mail_type === "pre" ? [...requiredBase, ...requiredPre] : [...requiredBase, ...requiredPost];

    const missing = required.filter((field) => !payload[field]);
    if (missing.length) {
      return NextResponse.json({ error: `Missing fields: ${missing.join(", ")}` }, { status: 400 });
    }

    const enrichedPayload = await enrichWithAutoResearch(payload);
    const result = renderMail(enrichedPayload);
    return NextResponse.json({
      ...result,
      selected_change_ids: enrichedPayload.included_change_ids ?? [],
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
