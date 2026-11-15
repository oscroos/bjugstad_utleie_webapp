import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectRole, audit } from "@/lib/sikkerhet/guard";
import { evaluerKontraktsmaal } from "@/lib/flate/kpi";

// GET /api/kontraktsmaal?projectId=... → mål med live-status
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });
  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "VIEWER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const kpis = await evaluerKontraktsmaal(projectId, session.user.organizationId);
  return NextResponse.json({ kpis });
}

// POST /api/kontraktsmaal – opprett mål (prosjektleder)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  const { projectId, metric, label, targetValue, unit } = b ?? {};
  if (!projectId || !metric || !label?.trim() || targetValue == null || !unit) {
    return NextResponse.json({ error: "projectId, metric, label, targetValue og unit er påkrevd." }, { status: 400 });
  }
  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "PROJECT_MANAGER");
  if (!access) return NextResponse.json({ error: "Krever prosjektleder." }, { status: 403 });

  const kpi = await prisma.contractKpi.create({
    data: { projectId, metric, label: label.trim(), targetValue: Number(targetValue), unit, contractRef: b.contractRef ?? null },
  });
  await audit({ organizationId: session.user.organizationId, userId: session.user.id, action: "kpi.create", entityType: "ContractKpi", entityId: kpi.id, metadata: { projectId, metric } });
  return NextResponse.json({ kpi }, { status: 201 });
}
