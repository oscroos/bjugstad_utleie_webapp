import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectRole, audit } from "@/lib/sikkerhet/guard";

// Arbeidsordre mot kontraktsposter, med avviksfanging (Ditio Core-paritet)
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });
  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "VIEWER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  const orders = await prisma.workOrder.findMany({ where: { projectId }, orderBy: { status: "asc" } });
  return NextResponse.json({ orders });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  if (!b.projectId || !b.title?.trim()) return NextResponse.json({ error: "projectId og tittel er påkrevd." }, { status: 400 });
  const access = await requireProjectRole(b.projectId, session.user.id, session.user.organizationId, "MEMBER");
  if (!access) return NextResponse.json({ error: "Manglende rolle." }, { status: 403 });
  const order = await prisma.workOrder.create({
    data: {
      projectId: b.projectId, title: b.title.trim(),
      contractItemRef: b.contractItemRef ?? null,
      estimateQty: b.estimateQty != null ? Number(b.estimateQty) : null,
      estimateUnit: b.estimateUnit ?? null,
    },
  });
  return NextResponse.json({ order }, { status: 201 });
}

// PATCH: fremdrift – flagger avvik automatisk når progresjon > estimat
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "Mangler id." }, { status: 400 });
  const existing = await prisma.workOrder.findUnique({ where: { id: b.id }, select: { projectId: true, estimateQty: true } });
  if (!existing) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  const access = await requireProjectRole(existing.projectId, session.user.id, session.user.organizationId, "MEMBER");
  if (!access) return NextResponse.json({ error: "Manglende rolle." }, { status: 403 });

  const progressQty = b.progressQty != null ? Number(b.progressQty) : undefined;
  const deviation = progressQty != null && existing.estimateQty != null && progressQty > existing.estimateQty
    ? `Fremdrift ${progressQty} over estimat ${existing.estimateQty} – varsle byggherre/juster kontraktspost`
    : undefined;
  const order = await prisma.workOrder.update({
    where: { id: b.id },
    data: { progressQty, status: b.status, deviationNote: deviation },
  });
  await audit({ organizationId: session.user.organizationId, userId: session.user.id, action: "workorder.progress", entityType: "WorkOrder", entityId: order.id });
  return NextResponse.json({ order, deviation: deviation ?? null });
}
