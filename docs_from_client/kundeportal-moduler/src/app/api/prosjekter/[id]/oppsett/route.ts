import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectRole, audit } from "@/lib/sikkerhet/guard";

type Params = { params: Promise<{ id: string }> };

// ────────────────────────────────────────────────────────────────────────────
//  PROSJEKTOPPSETT (prosjektoppstart)
//  GET  → katalog + prosjektets valg (massetyper m/plan, feltverdier)
//  PUT  → lagre: utvidede felt, valgte massetyper med planlagt inn/ut,
//         egendefinerte feltverdier
//  Valgene her styrer hva som er valgbart i portal OG felt-app (config-API-et
//  leser ProjectMassType per prosjekt).
// ────────────────────────────────────────────────────────────────────────────

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const { id } = await params;
  const access = await requireProjectRole(id, session.user.id, session.user.organizationId, "VIEWER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const [project, catalog, fieldDefs] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        massTypes: { include: { massType: true } },
        fieldValues: { include: { definition: true } },
      },
    }),
    prisma.massTypeCatalog.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.projectFieldDefinition.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return NextResponse.json({ project, catalog, fieldDefs });
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const { id } = await params;
  const access = await requireProjectRole(id, session.user.id, session.user.organizationId, "PROJECT_MANAGER");
  if (!access) return NextResponse.json({ error: "Krever prosjektleder." }, { status: 403 });

  const body = await req.json();

  await prisma.$transaction(async (tx) => {
    // 1) Utvidede faste felt
    await tx.project.update({
      where: { id },
      data: {
        addressLine: body.addressLine,
        postalCode: body.postalCode,
        city: body.city,
        contractType: body.contractType ?? undefined,
        contractSizeNok: body.contractSizeNok != null ? Number(body.contractSizeNok) : undefined,
        clientType: body.clientType ?? undefined,     // PRIVATE | PUBLIC
        clientName: body.clientName,
        clientAddress: body.clientAddress,
        clientEmail: body.clientEmail,
        clientContactName: body.clientContactName,
        clientContactEmail: body.clientContactEmail,
      },
    });

    // 2) Massetyper med plan (erstatter helhetlig)
    if (Array.isArray(body.massTypes)) {
      await tx.projectMassType.deleteMany({ where: { projectId: id } });
      for (const mt of body.massTypes) {
        if (!mt.massTypeId) continue;
        await tx.projectMassType.create({
          data: {
            projectId: id,
            massTypeId: mt.massTypeId,
            plannedIn: Number(mt.plannedIn ?? 0),
            plannedOut: Number(mt.plannedOut ?? 0),
          },
        });
      }
    }

    // 3) Egendefinerte feltverdier (upsert per definisjon)
    if (Array.isArray(body.fieldValues)) {
      for (const fv of body.fieldValues) {
        if (!fv.definitionId) continue;
        await tx.projectFieldValue.upsert({
          where: { projectId_definitionId: { projectId: id, definitionId: fv.definitionId } },
          update: { value: String(fv.value ?? "") },
          create: { projectId: id, definitionId: fv.definitionId, value: String(fv.value ?? "") },
        });
      }
    }
  });

  await audit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "project.setup",
    entityType: "Project",
    entityId: id,
    metadata: { massTypes: (body.massTypes ?? []).length },
  });

  return NextResponse.json({ ok: true });
}
