import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectRole, audit } from "@/lib/sikkerhet/guard";

// GET /api/miljo/forbruk?projectId=...
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });

  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "VIEWER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const usages = await prisma.fuelUsage.findMany({
    where: { projectId },
    orderBy: { periodStart: "desc" },
    take: 200,
  });
  return NextResponse.json({ usages });
}

// POST /api/miljo/forbruk
// Body: { projectId, machineName, machineId?, ownership, subcontractorOrgId?,
//         fuelType, amount, periodStart, periodEnd }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });

  const body = await req.json();
  const { projectId, machineName, fuelType, amount, periodStart, periodEnd } = body ?? {};
  if (!projectId || !machineName?.trim() || !fuelType || amount == null || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "projectId, maskin, drivstofftype, mengde og periode er påkrevd." },
      { status: 400 }
    );
  }
  if (Number(amount) <= 0) {
    return NextResponse.json({ error: "Mengde må være positiv." }, { status: 400 });
  }

  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "MEMBER");
  if (!access) return NextResponse.json({ error: "Ikke funnet eller manglende rolle." }, { status: 404 });

  const usage = await prisma.fuelUsage.create({
    data: {
      projectId,
      machineId: body.machineId ?? null,
      machineName: machineName.trim(),
      ownership: body.ownership ?? "OWNED",
      subcontractorOrgId: body.subcontractorOrgId ?? null,
      fuelType,
      amount: Number(amount),
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      source: "MANUAL",
      createdById: session.user.id,
    },
  });

  await audit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "fuel.register",
    entityType: "FuelUsage",
    entityId: usage.id,
    metadata: { projectId, fuelType, amount: Number(amount) },
  });

  return NextResponse.json({ usage }, { status: 201 });
}
