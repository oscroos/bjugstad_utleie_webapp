import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectRole, audit } from "@/lib/sikkerhet/guard";

// GET /api/lasslister?projectId=...
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });
  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "VIEWER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const tickets = await prisma.loadTicket.findMany({
    where: { projectId },
    orderBy: { weighedAt: "desc" },
    take: 300,
  });
  const sumIn = tickets.filter((t) => t.direction === "IN").reduce((a, t) => a + t.weightTonnes, 0);
  const sumOut = tickets.filter((t) => t.direction === "OUT").reduce((a, t) => a + t.weightTonnes, 0);
  // EPD-utslipp (materialenes innebygde utslipp, A1–A3) – i tillegg til transport
  const epdKg = tickets.reduce((a, t) => a + (t.epdKgCo2ePerTonne ?? 0) * t.weightTonnes, 0);
  return NextResponse.json({ tickets, sumInTonnes: sumIn, sumOutTonnes: sumOut, epdKgCo2e: epdKg });
}

// POST /api/lasslister – manuell/app-registrering. Vektsystem-integrasjon
// (SCALE_API) kobles i egen inbound-rute/webhook når leverandør er valgt.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  const { projectId, direction, weightTonnes, weighedAt } = b ?? {};
  if (!projectId || !direction || !weightTonnes || !weighedAt) {
    return NextResponse.json({ error: "projectId, retning, vekt og tidspunkt er påkrevd." }, { status: 400 });
  }
  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "MEMBER");
  if (!access) return NextResponse.json({ error: "Ikke funnet eller manglende rolle." }, { status: 404 });

  const ticket = await prisma.loadTicket.create({
    data: {
      projectId,
      direction: direction === "IN" ? "IN" : "OUT",
      massTypeId: b.massTypeId ?? null,
      weightTonnes: Number(weightTonnes),
      volumeM3: b.volumeM3 != null ? Number(b.volumeM3) : null,
      originLocation: b.originLocation ?? null,
      destinationName: b.destinationName ?? null,
      vehicleReg: b.vehicleReg ?? null,
      transporterOrgId: b.transporterOrgId ?? null,
      distanceKm: b.distanceKm != null ? Number(b.distanceKm) : null,
      epdRef: b.epdRef ?? null,
      epdKgCo2ePerTonne: b.epdKgCo2ePerTonne != null ? Number(b.epdKgCo2ePerTonne) : null,
      weighedAt: new Date(weighedAt),
      source: b.source === "APP" ? "APP" : "MANUAL",
      appSyncId: b.appSyncId ?? null,
      receiptDocId: b.receiptDocId ?? null,
      createdById: session.user.id,
    },
  });
  await audit({ organizationId: session.user.organizationId, userId: session.user.id, action: "loadticket.create", entityType: "LoadTicket", entityId: ticket.id, metadata: { projectId, direction } });
  return NextResponse.json({ ticket }, { status: 201 });
}
