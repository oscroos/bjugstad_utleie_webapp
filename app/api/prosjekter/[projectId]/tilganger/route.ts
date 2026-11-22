import { NextResponse } from "next/server";
import { requireProjectRole, writeAuditLog } from "@/lib/access";
import { addProjectParticipant, listParticipantCandidates, listProjectAccess } from "@/lib/project-access";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

// Everyone who can open the project may see who has access to it. Only the
// project lead, company admins and super admins (role OWNER) may change it.
export async function GET(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const access = await requireProjectRole(projectId, "VIEWER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const canManage = access.role === "OWNER";

  try {
    const [overview, candidates] = await Promise.all([
      listProjectAccess(access.project),
      canManage ? listParticipantCandidates(access.project) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      members: overview.members,
      hasLead: overview.hasLead,
      candidates,
      canManage,
      viewerId: access.session.user.id,
    });
  } catch (error) {
    console.error(`Failed to load access list for project ${projectId}`, error);
    return NextResponse.json({ error: "Kunne ikke hente brukertilganger" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const access = await requireProjectRole(projectId, "VIEWER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  if (access.role !== "OWNER") {
    return NextResponse.json({ error: "Bare prosjektleder kan legge til deltakere" }, { status: 403 });
  }

  let body: { userId?: unknown };
  try {
    body = (await request.json()) as { userId?: unknown };
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  if (!userId) return NextResponse.json({ error: "Velg en bruker" }, { status: 400 });

  try {
    const result = await addProjectParticipant(access.project, userId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    await writeAuditLog({
      customerId: access.project.customerId,
      userId: access.session.user.id,
      project: access.project,
      action: "project.participant.added",
      entityType: "Project",
      entityId: projectId,
      changes: [{ label: "Deltaker", from: null, to: result.userName ?? "Ukjent bruker" }],
      metadata: { participantUserId: userId },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error(`Failed to add participant to project ${projectId}`, error);
    return NextResponse.json({ error: "Kunne ikke legge til deltaker" }, { status: 500 });
  }
}
