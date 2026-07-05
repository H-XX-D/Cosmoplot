import { NextRequest, NextResponse } from "next/server";
import { intakeLead, leadInputSchema } from "@/lib/business/lead-intake";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = leadInputSchema.parse(body);
    const record = await intakeLead(input, {
      referrer: request.headers.get("referer") ?? "",
      userAgent: request.headers.get("user-agent") ?? "",
      ipHint: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "",
    });
    return NextResponse.json({ ok: true, id: record.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lead intake failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
