import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { beregnAssist } from "@/lib/flow/assist";

// GET /api/flow/assist?distanceKm=2.4&queueMin=6&maxSpeed=30
// Konsumeres av felt-appen i maskin/lastebil: ETA + anbefalt fart (just-in-time).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const result = beregnAssist({
    distanceKm: Number(p.get("distanceKm") ?? 0),
    queueAtTargetMin: Number(p.get("queueMin") ?? 0),
    maxSpeedKmh: Number(p.get("maxSpeed") ?? 30),
  });
  return NextResponse.json(result);
}
