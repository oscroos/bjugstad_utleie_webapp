import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/sikkerhet/guard";

// ────────────────────────────────────────────────────────────────────────────
//  ADMIN-API – kun portaladministrator (leverandøren, dvs. dere)
//  Styrer det kundene får velge mellom: massetyper og egendefinerte
//  prosjektfelt. Kundene kan aldri endre katalogene, bare bruke dem.
//
//  GET  /api/admin/katalog                 → massetyper + feltdefinisjoner
//  POST /api/admin/katalog  {kind:"massType"|"fieldDef", ...}  → opprett
//  PATCH /api/admin/katalog {kind, id, active?...}             → endre/deaktiver
// ────────────────────────────────────────────────────────────────────────────

async function requirePortalAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  // ANTAKELSE: portaladmin flagges med isPortalAdmin på brukeren (se schema del 5).
  if (!session.user.isPortalAdmin) return null;
  return session;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  // Lesing er åpen for innloggede (kundene trenger katalogen ved prosjektoppstart)
  const [massTypes, fieldDefs] = await Promise.all([
    prisma.massTypeCatalog.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.projectFieldDefinition.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return NextResponse.json({ massTypes, fieldDefs });
}

export async function POST(req: Request) {
  const session = await requirePortalAdmin();
  if (!session) return NextResponse.json({ error: "Krever portaladministrator." }, { status: 403 });

  const body = await req.json();
  if (body.kind === "massType") {
    if (!body.name?.trim()) return NextResponse.json({ error: "Navn er påkrevd." }, { status: 400 });
    const mt = await prisma.massTypeCatalog.create({
      data: {
        name: body.name.trim(),
        unit: body.unit === "tonn" ? "tonn" : "m3",
        defaultClassification: body.defaultClassification ?? "UNKNOWN",
        sortOrder: Number(body.sortOrder ?? 0),
      },
    });
    await audit({ organizationId: "PORTAL", userId: session.user.id, action: "admin.massType.create", entityType: "MassTypeCatalog", entityId: mt.id, metadata: { name: mt.name } });
    return NextResponse.json({ massType: mt }, { status: 201 });
  }
  if (body.kind === "fieldDef") {
    if (!body.label?.trim()) return NextResponse.json({ error: "Etikett er påkrevd." }, { status: 400 });
    const fd = await prisma.projectFieldDefinition.create({
      data: {
        label: body.label.trim(),
        fieldType: body.fieldType ?? "TEXT",
        options: Array.isArray(body.options) ? body.options : [],
        required: Boolean(body.required),
        sortOrder: Number(body.sortOrder ?? 0),
      },
    });
    await audit({ organizationId: "PORTAL", userId: session.user.id, action: "admin.fieldDef.create", entityType: "ProjectFieldDefinition", entityId: fd.id, metadata: { label: fd.label } });
    return NextResponse.json({ fieldDef: fd }, { status: 201 });
  }
  return NextResponse.json({ error: "Ukjent kind." }, { status: 400 });
}

export async function PATCH(req: Request) {
  const session = await requirePortalAdmin();
  if (!session) return NextResponse.json({ error: "Krever portaladministrator." }, { status: 403 });

  const body = await req.json();
  if (!body.id || !body.kind) return NextResponse.json({ error: "Mangler kind/id." }, { status: 400 });

  if (body.kind === "massType") {
    const mt = await prisma.massTypeCatalog.update({
      where: { id: body.id },
      data: { name: body.name, unit: body.unit, active: body.active, sortOrder: body.sortOrder },
    });
    return NextResponse.json({ massType: mt });
  }
  if (body.kind === "fieldDef") {
    const fd = await prisma.projectFieldDefinition.update({
      where: { id: body.id },
      data: { label: body.label, fieldType: body.fieldType, options: body.options, required: body.required, active: body.active, sortOrder: body.sortOrder },
    });
    return NextResponse.json({ fieldDef: fd });
  }
  return NextResponse.json({ error: "Ukjent kind." }, { status: 400 });
}
