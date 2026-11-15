import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProjectDetail, assertProjectAccess } from "@/lib/prosjekter/queries";

type Params = { params: Promise<{ id: string }> };

// GET /api/prosjekter/:id
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const { id } = await params;
  const project = await getProjectDetail(id, session.user.organizationId);
  if (!project) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  return NextResponse.json({ project });
}

// PATCH /api/prosjekter/:id  → oppdater felt
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const { id } = await params;
  const access = await assertProjectAccess(id, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const body = await req.json();
  const project = await prisma.project.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description,
      addressLine: body.addressLine,
      postalCode: body.postalCode,
      city: body.city,
      clientName: body.clientName,
      clientContactName: body.clientContactName,
      clientContactEmail: body.clientContactEmail,
      clientContactPhone: body.clientContactPhone,
      status: body.status,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    },
  });
  return NextResponse.json({ project });
}

// DELETE /api/prosjekter/:id  → arkiver (myk sletting)
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const { id } = await params;
  const access = await assertProjectAccess(id, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  await prisma.project.update({ where: { id }, data: { status: "ARCHIVED" } });
  return NextResponse.json({ ok: true });
}
