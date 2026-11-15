import { NextResponse } from "next/server";
import { synkAlleMaskiner } from "@/lib/flate/telemetri";

// Kjøres hver natt (vercel.json):
//   { "crons": [{ "path": "/api/cron/telemetri", "schedule": "30 4 * * *" }] }
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 3600 * 1000);
  const result = await synkAlleMaskiner(from, to);
  return NextResponse.json(result);
}
