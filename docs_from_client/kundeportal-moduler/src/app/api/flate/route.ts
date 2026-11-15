import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { beregnTomgang, beregnElektrifiseringsgrad } from "@/lib/flate/telemetri";
import { allokerKostnader } from "@/lib/flate/kostnad";

// GET /api/flate?projectId=...&from=...&to=...
// Flåteoversikt fra telemetri: timer, tomgang (m/besparingspotensial),
// elektrifiseringsgrad og kostnadsfordeling per maskin. Uten projectId: org-nivå.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });

  const p = new URL(req.url).searchParams;
  const projectId = p.get("projectId");
  const projects = await prisma.project.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgIds = projects.map((x) => x.id);
  if (projectId && !orgIds.includes(projectId)) {
    return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  }

  const from = p.get("from") ? new Date(p.get("from") as string) : undefined;
  const to = p.get("to") ? new Date(p.get("to") as string) : undefined;

  const [tomgang, el, kostnad] = await Promise.all([
    beregnTomgang(projectId, orgIds),
    beregnElektrifiseringsgrad(projectId, orgIds),
    projectId ? allokerKostnader(projectId, from, to) : Promise.resolve(null),
  ]);

  const snaps = await prisma.telemetrySnapshot.groupBy({
    by: ["machineId"],
    where: { projectId: projectId ? projectId : { in: orgIds } },
    _sum: { engineHours: true, idleHours: true, fuelLiters: true, energyKwh: true, payloadTonnes: true },
  });

  return NextResponse.json({ machines: snaps, tomgang, elektrifisering: el, kostnad });
}
