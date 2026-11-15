import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectAccess } from "@/lib/prosjekter/queries";

// GET /api/rapportering/krav?projectId=...  → krav gruppert på kilde
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });

  const access = await assertProjectAccess(projectId, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const requirements = await prisma.reportingRequirement.findMany({
    where: { projectId, status: { not: "DISMISSED" } },
    include: { dataFields: true },
    orderBy: [{ source: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    LAW: requirements.filter((r) => r.source === "LAW"),
    NS_STANDARD: requirements.filter((r) => r.source === "NS_STANDARD"),
    CONTRACT: requirements.filter((r) => r.source === "CONTRACT"),
  });
}

// POST /api/rapportering/krav  → manuelt opprettet krav
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const body = await req.json();
  const { projectId, source, title } = body ?? {};
  if (!projectId || !source || !title?.trim()) {
    return NextResponse.json(
      { error: "projectId, kilde og tittel er påkrevd." },
      { status: 400 }
    );
  }

  const access = await assertProjectAccess(projectId, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const requirement = await prisma.reportingRequirement.create({
    data: {
      projectId,
      source,
      title: title.trim(),
      description: body.description ?? null,
      legalReference: body.legalReference ?? null,
      interval: body.interval ?? "MONTHLY",
      intervalDetail: body.intervalDetail ?? null,
      recipientInstance: body.recipientInstance ?? null,
      recipientName: body.recipientName ?? null,
      recipientEmail: body.recipientEmail ?? null,
      origin: "MANUAL",
      status: "ACTIVE",
      dataFields: {
        create: (body.dataFields ?? []).map(
          (f: { label: string; sourceType: string; availableInPortal?: boolean; required?: boolean; sourceRef?: string; note?: string }) => ({
            label: f.label,
            sourceType: f.sourceType,
            sourceRef: f.sourceRef ?? null,
            availableInPortal: f.availableInPortal ?? false,
            required: f.required ?? true,
            note: f.note ?? null,
          })
        ),
      },
    },
    include: { dataFields: true },
  });

  return NextResponse.json({ requirement }, { status: 201 });
}

// PATCH /api/rapportering/krav  → bekreft/avvis/rediger krav (f.eks. AI-forslag)
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const body = await req.json();
  const { id } = body ?? {};
  if (!id) return NextResponse.json({ error: "Mangler id." }, { status: 400 });

  // Verifiser at kravet tilhører et prosjekt organisasjonen eier
  const existing = await prisma.reportingRequirement.findUnique({
    where: { id },
    select: { project: { select: { organizationId: true } } },
  });
  if (existing?.project.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  }

  const requirement = await prisma.reportingRequirement.update({
    where: { id },
    data: {
      status: body.status, // PROPOSED → ACTIVE / DISMISSED
      title: body.title,
      description: body.description,
      legalReference: body.legalReference,
      interval: body.interval,
      intervalDetail: body.intervalDetail,
      recipientInstance: body.recipientInstance,
      recipientName: body.recipientName,
      recipientEmail: body.recipientEmail,
    },
    include: { dataFields: true },
  });
  return NextResponse.json({ requirement });
}
