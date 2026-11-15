import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectAccess } from "@/lib/prosjekter/queries";

// GET /api/massehandtering?projectId=...  → masseflyttinger + oppsummering
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });
  const access = await assertProjectAccess(projectId, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const movements = await prisma.massMovement.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  // Oppsummering pr klassifisering
  const summary = movements.reduce<Record<string, number>>((acc, m) => {
    const k = m.classification;
    acc[k] = (acc[k] ?? 0) + (m.volumeM3 ?? 0);
    return acc;
  }, {});

  return NextResponse.json({ movements, summary });
}

// POST /api/massehandtering  → ny masseflytting
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const body = await req.json();
  const { projectId, massType } = body ?? {};
  if (!projectId || !massType?.trim()) {
    return NextResponse.json({ error: "projectId og massetype er påkrevd." }, { status: 400 });
  }
  const access = await assertProjectAccess(projectId, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const movement = await prisma.massMovement.create({
    data: {
      projectId,
      direction: body.direction === "IN" ? "IN" : "OUT", // to knapper: INN / UT
      massTypeId: body.massTypeId ?? null,               // fra prosjektets valgte typer
      unit: body.unit === "tonn" ? "tonn" : "m3",
      massType: massType.trim(),
      classification: body.classification ?? "UNKNOWN",
      volumeM3: body.volumeM3 != null ? Number(body.volumeM3) : null,
      originLocation: body.originLocation ?? null,
      destinationName: body.destinationName ?? null,
      destinationOrgId: body.destinationOrgId ?? null,
      transporter: body.transporter ?? null,
      analysisRef: body.analysisRef ?? null,
      receiptDocId: body.receiptDocId ?? null,
      declarationRef: body.declarationRef ?? null,
      status: body.status ?? "PLANNED",
      movedAt: body.movedAt ? new Date(body.movedAt) : null,
      notes: body.notes ?? null,
      createdById: session.user.id,
    },
  });
  return NextResponse.json({ movement }, { status: 201 });
}

// PATCH /api/massehandtering  → oppdater status/felt
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const body = await req.json();
  const { id } = body ?? {};
  if (!id) return NextResponse.json({ error: "Mangler id." }, { status: 400 });

  const existing = await prisma.massMovement.findUnique({
    where: { id },
    select: { project: { select: { organizationId: true } } },
  });
  if (existing?.project.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  }

  const movement = await prisma.massMovement.update({
    where: { id },
    data: {
      classification: body.classification,
      status: body.status,
      volumeM3: body.volumeM3 != null ? Number(body.volumeM3) : undefined,
      destinationName: body.destinationName,
      transporter: body.transporter,
      declarationRef: body.declarationRef,
      movedAt: body.movedAt ? new Date(body.movedAt) : undefined,
      notes: body.notes,
    },
  });
  return NextResponse.json({ movement });
}
