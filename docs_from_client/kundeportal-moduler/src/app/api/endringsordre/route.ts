import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/sikkerhet/guard";
import { vurderMuligEndring } from "@/lib/eo/endringsordre";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });
  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "VIEWER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  const [active, arkivNo, arkivDone] = await Promise.all([
    prisma.changeOrder.findMany({ where: { projectId, status: { in: ["POSSIBLE", "CHANGE"] } }, include: { entries: true }, orderBy: { createdAt: "desc" } }),
    prisma.changeOrder.findMany({ where: { projectId, status: "NO_CHANGE" }, orderBy: { createdAt: "desc" } }),
    prisma.changeOrder.findMany({ where: { projectId, status: "COMPLETED" }, orderBy: { completedAt: "desc" } }),
  ]);
  return NextResponse.json({ active, arkivNo, arkivDone });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  if (!b.projectId || !b.title?.trim() || !b.description?.trim()) {
    return NextResponse.json({ error: "projectId, tittel og beskrivelse er påkrevd." }, { status: 400 });
  }
  const access = await requireProjectRole(b.projectId, session.user.id, session.user.organizationId, "MEMBER");
  if (!access) return NextResponse.json({ error: "Manglende rolle." }, { status: 403 });
  const eo = await prisma.changeOrder.create({
    data: {
      projectId: b.projectId, title: b.title.trim(), description: b.description.trim(),
      originRef: b.originRef?.trim() || null, photoDocIds: b.photoDocIds ?? [],
      createdById: session.user.id, createdInField: !!b.createdInField, status: "POSSIBLE",
    },
  });
  return NextResponse.json({ eo }, { status: 201 });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "Mangler id." }, { status: 400 });
  const eo = await prisma.changeOrder.findUnique({ where: { id: b.id } });
  if (!eo) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  const access = await requireProjectRole(eo.projectId, session.user.id, session.user.organizationId, "MEMBER");
  if (!access) return NextResponse.json({ error: "Manglende rolle." }, { status: 403 });

  if (b.action === "vurder") {
    const updated = await vurderMuligEndring(b.id, { decision: b.decision, reason: b.reason, reviewerId: session.user.id });
    return NextResponse.json({ eo: updated });
  }
  if (b.action === "varsleByggherre") {
    const updated = await prisma.changeOrder.update({ where: { id: b.id }, data: { notifiedClientAt: new Date(), clientResponse: "NOTIFIED_AWAITING" } });
    return NextResponse.json({ eo: updated });
  }
  if (b.action === "loggfor") {
    const entry = await prisma.changeOrderEntry.create({
      data: { changeOrderId: b.id, kind: b.kind, description: b.description?.trim() ?? "", quantity: b.quantity != null ? Number(b.quantity) : null, unit: b.unit ?? null, photoDocIds: b.photoDocIds ?? [], createdById: session.user.id },
    });
    return NextResponse.json({ entry }, { status: 201 });
  }
  const data: Record<string, unknown> = {};
  if (b.clientResponse) data.clientResponse = b.clientResponse;
  if (b.updateInterval) data.updateInterval = b.updateInterval;
  if (b.action === "ferdigstill") { data.status = "COMPLETED"; data.completedAt = new Date(); }
  const updated = await prisma.changeOrder.update({ where: { id: b.id }, data });
  return NextResponse.json({ eo: updated });
}
