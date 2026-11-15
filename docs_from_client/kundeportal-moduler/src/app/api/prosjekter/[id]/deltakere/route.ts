import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectAccess } from "@/lib/prosjekter/queries";

type Params = { params: Promise<{ id: string }> };

// GET /api/prosjekter/:id/deltakere?ledige=1
// Uten parameter: deltakere på prosjektet.
// Med ?ledige=1: brukere i egen org som IKKE er deltakere ennå (for velger).
export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const { id } = await params;
  const access = await assertProjectAccess(id, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const ledige = new URL(req.url).searchParams.get("ledige");

  if (ledige) {
    const existing = await prisma.projectParticipant.findMany({
      where: { projectId: id },
      select: { userId: true },
    });
    const excludeIds = existing.map((p) => p.userId);
    const users = await prisma.user.findMany({
      where: {
        organizationId: session.user.organizationId,
        id: { notIn: excludeIds },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ users });
  }

  const participants = await prisma.projectParticipant.findMany({
    where: { projectId: id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ participants });
}

// POST /api/prosjekter/:id/deltakere  → legg til deltaker fra egen org
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const { id } = await params;
  const access = await assertProjectAccess(id, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const body = await req.json();
  const { userId, role } = body ?? {};
  if (!userId) return NextResponse.json({ error: "Mangler bruker." }, { status: 400 });

  // Sikre at brukeren tilhører egen organisasjon
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: session.user.organizationId },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: "Bruker finnes ikke i din organisasjon." },
      { status: 400 }
    );
  }

  const participant = await prisma.projectParticipant.upsert({
    where: { projectId_userId: { projectId: id, userId } },
    update: { role: role ?? "MEMBER" },
    create: { projectId: id, userId, role: role ?? "MEMBER" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json({ participant }, { status: 201 });
}

// DELETE /api/prosjekter/:id/deltakere?userId=...
export async function DELETE(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const { id } = await params;
  const access = await assertProjectAccess(id, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Mangler userId." }, { status: 400 });

  await prisma.projectParticipant.delete({
    where: { projectId_userId: { projectId: id, userId } },
  });
  return NextResponse.json({ ok: true });
}
