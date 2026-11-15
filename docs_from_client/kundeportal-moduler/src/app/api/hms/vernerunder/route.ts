import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectRole, audit } from "@/lib/sikkerhet/guard";

// GET /api/hms/vernerunder?projectId=...
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });

  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "VIEWER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const rounds = await prisma.safetyRound.findMany({
    where: { projectId },
    orderBy: { performedAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ rounds, count: rounds.length });
}

// POST /api/hms/vernerunder
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });

  const body = await req.json();
  const { projectId, performedAt, participants } = body ?? {};
  if (!projectId || !performedAt || !participants?.trim()) {
    return NextResponse.json({ error: "projectId, dato og deltakere er påkrevd." }, { status: 400 });
  }

  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "MEMBER");
  if (!access) return NextResponse.json({ error: "Ikke funnet eller manglende rolle." }, { status: 404 });

  const round = await prisma.safetyRound.create({
    data: {
      projectId,
      performedAt: new Date(performedAt),
      participants: participants.trim(),
      findingsCount: Number(body.findingsCount ?? 0),
      notes: body.notes ?? null,
      createdById: session.user.id,
    },
  });

  await audit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "safetyround.create",
    entityType: "SafetyRound",
    entityId: round.id,
    metadata: { projectId },
  });

  return NextResponse.json({ round }, { status: 201 });
}
