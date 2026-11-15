import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectAccess } from "@/lib/prosjekter/queries";

type Params = { params: Promise<{ id: string }> };

// POST /api/prosjekter/:id/underentreprenorer  → legg til UE
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const { id } = await params;
  const access = await assertProjectAccess(id, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const body = await req.json();
  const { subcontractorOrgId } = body ?? {};
  if (!subcontractorOrgId) {
    return NextResponse.json({ error: "Mangler organisasjon." }, { status: 400 });
  }
  if (subcontractorOrgId === session.user.organizationId) {
    return NextResponse.json(
      { error: "Kan ikke legge til egen organisasjon som UE." },
      { status: 400 }
    );
  }

  try {
    const sub = await prisma.projectSubcontractor.create({
      data: {
        projectId: id,
        subcontractorOrgId,
        scopeOfWork: body.scopeOfWork ?? null,
        contactName: body.contactName ?? null,
        contactEmail: body.contactEmail ?? null,
      },
      include: { subcontractorOrg: { select: { id: true, name: true, orgNumber: true } } },
    });
    return NextResponse.json({ subcontractor: sub }, { status: 201 });
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "UE er allerede lagt til." }, { status: 409 });
    }
    throw err;
  }
}

// DELETE /api/prosjekter/:id/underentreprenorer?subId=...  → fjern UE
export async function DELETE(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const { id } = await params;
  const access = await assertProjectAccess(id, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const subId = new URL(req.url).searchParams.get("subId");
  if (!subId) return NextResponse.json({ error: "Mangler subId." }, { status: 400 });

  await prisma.projectSubcontractor.delete({ where: { id: subId } });
  return NextResponse.json({ ok: true });
}
