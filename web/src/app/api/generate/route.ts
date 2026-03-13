import { MailInput, renderMail } from "@/lib/mail-engine";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as MailInput;

    const requiredBase: Array<keyof MailInput> = ["mail_type", "language", "recipient_name"];
    const requiredPost: Array<keyof MailInput> = ["company_name"];
    const requiredPre: Array<keyof MailInput> = ["template_variant", "training_type", "date", "location"];
    const required = payload.mail_type === "pre" ? [...requiredBase, ...requiredPre] : [...requiredBase, ...requiredPost];

    const missing = required.filter((field) => !payload[field]);
    if (missing.length) {
      return NextResponse.json({ error: `Missing fields: ${missing.join(", ")}` }, { status: 400 });
    }

    const result = renderMail(payload);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
