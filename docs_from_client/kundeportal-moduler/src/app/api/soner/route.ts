import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectRole, audit } from "@/lib/sikkerhet/guard";

// POST /api/soner  { projectId, name, type, polygon, maxSpeedKmh?, workHoursFrom?, workHoursTo? }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  if (!b.projectId || !b.name?.trim() || !b.type || !Array.isArray(b.polygon) || b.polygon.length < 3) {
    return NextResponse.json({ error: "projectId, navn, type og polygon (≥3 punkter) er påkrevd." }, { status: 400 });
  }
  const access = await requireProjectRole(b.projectId, session.user.id, session.user.organizationId, "PROJECT_MANAGER");
  if (!access) return NextResponse.json({ error: "Krever prosjektleder." }, { status: 403 });
  const zone = await prisma.siteZone.create({
    data: {
      projectId: b.projectId, name: b.name.trim(), type: b.type,
      polygon: b.polygon, maxSpeedKmh: b.maxSpeedKmh ?? null,
      workHoursFrom: b.workHoursFrom ?? null, workHoursTo: b.workHoursTo ?? null,
    },
  });
  await audit({ organizationId: session.user.organizationId, userId: session.user.id, action: "zone.create", entityType: "SiteZone", entityId: zone.id, metadata: { type: b.type } });
  return NextResponse.json({ zone }, { status: 201 });
}

// PATCH /api/soner  { eventId } → kvitter hendelse
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const { eventId } = (await req.json()) ?? {};
  if (!eventId) return NextResponse.json({ error: "Mangler eventId." }, { status: 400 });
  const ev = await prisma.zoneEvent.findUnique({ where: { id: eventId } });
  if (!ev) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  const access = await requireProjectRole(ev.projectId, session.user.id, session.user.organizationId, "MEMBER");
  if (!access) return NextResponse.json({ error: "Manglende rolle." }, { status: 403 });
  await prisma.zoneEvent.update({ where: { id: eventId }, data: { acknowledged: true } });
  return NextResponse.json({ ok: true });
}
