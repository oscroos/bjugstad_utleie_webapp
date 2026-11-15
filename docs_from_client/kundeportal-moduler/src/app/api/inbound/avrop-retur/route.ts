import { NextResponse } from "next/server";
import { mottaAvropRetur } from "@/lib/avrop/avrop";

// Webhook fra Bjugstad-registeret: utleier har priset og signert avropet.
export async function POST(req: Request) {
  if (req.headers.get("x-ingest-secret") !== process.env.AVROP_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const b = await req.json();
  if (!b.portalCallOffId || !Array.isArray(b.lines)) return NextResponse.json({ error: "Ugyldig payload." }, { status: 400 });
  const avrop = await mottaAvropRetur(b);
  return NextResponse.json({ ok: true, status: avrop.status });
}
