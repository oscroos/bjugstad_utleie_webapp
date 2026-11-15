import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectRole, audit } from "@/lib/sikkerhet/guard";

// GET /api/hms/ruh?projectId=...&from=...&to=...
// Returnerer RUH-liste + statistikk (mater SHA-rapportens datafelt automatisk).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const projectId = p.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });

  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "VIEWER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const where = {
    projectId,
    ...(p.get("from") || p.get("to")
      ? { occurredAt: { ...(p.get("from") ? { gte: new Date(p.get("from") as string) } : {}), ...(p.get("to") ? { lte: new Date(p.get("to") as string) } : {}) } }
      : {}),
  };

  const reports = await prisma.ruhReport.findMany({ where, orderBy: { occurredAt: "desc" }, take: 200 });

  const stats = {
    total: reports.length,
    open: reports.filter((r) => r.status !== "CLOSED").length,
    bySeverity: reports.reduce<Record<string, number>>((a, r) => {
      a[r.severity] = (a[r.severity] ?? 0) + 1; return a;
    }, {}),
    lostTimeInjuries: reports.filter((r) => r.severity === "INJURY_LOST_TIME").length,
  };

  return NextResponse.json({ reports, stats });
}

// POST /api/hms/ruh
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });

  const body = await req.json();
  const { projectId, severity, title, occurredAt } = body ?? {};
  if (!projectId || !severity || !title?.trim() || !occurredAt) {
    return NextResponse.json({ error: "projectId, alvorlighet, tittel og tidspunkt er påkrevd." }, { status: 400 });
  }

  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "MEMBER");
  if (!access) return NextResponse.json({ error: "Ikke funnet eller manglende rolle." }, { status: 404 });

  const report = await prisma.ruhReport.create({
    data: {
      projectId,
      severity,
      title: title.trim(),
      description: body.description ?? null,
      location: body.location ?? null,
      occurredAt: new Date(occurredAt),
      correctiveAction: body.correctiveAction ?? null,
      reportedById: session.user.id,
    },
  });

  await audit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "ruh.create",
    entityType: "RuhReport",
    entityId: report.id,
    metadata: { projectId, severity },
  });

  // Varslingspliktig hendelse → flagg i responsen slik at UI kan minne om
  // umiddelbar varsling til Arbeidstilsynet og byggherre.
  const notifiable = severity === "INJURY_LOST_TIME";
  return NextResponse.json({ report, notifiable }, { status: 201 });
}

// PATCH /api/hms/ruh  → statusendring/tiltak
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const body = await req.json();
  const { id } = body ?? {};
  if (!id) return NextResponse.json({ error: "Mangler id." }, { status: 400 });

  const existing = await prisma.ruhReport.findUnique({
    where: { id },
    select: { projectId: true, project: { select: { organizationId: true } } },
  });
  if (existing?.project.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  }
  const access = await requireProjectRole(existing.projectId, session.user.id, session.user.organizationId, "MEMBER");
  if (!access) return NextResponse.json({ error: "Manglende rolle." }, { status: 403 });

  const report = await prisma.ruhReport.update({
    where: { id },
    data: { status: body.status, correctiveAction: body.correctiveAction },
  });
  return NextResponse.json({ report });
}
