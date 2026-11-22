import { NextResponse } from "next/server";
import { requireProjectRole, writeAuditLog } from "@/lib/access";
import { removeProjectParticipant, setProjectLead } from "@/lib/project-access";

type RouteContext = {
  params: Promise<{ projectId: string; userId: string }>;
};

async function requireAccessManager(projectId: string) {
  const access = await requireProjectRole(projectId, "VIEWER");
  if (!access) return { response: NextResponse.json({ error: "Ikke funnet" }, { status: 404 }) };
  if (access.role !== "OWNER") {
    return {
      response: NextResponse.json({ error: "Bare prosjektleder kan endre tilganger" }, { status: 403 }),
    };
  }
  return { access };
}

// Hands the project lead role to the user. The only role change supported here.
export async function PATCH(request: Request, { params }: RouteContext) {
  const { projectId, userId } = await params;
  const guard = await requireAccessManager(projectId);
  if (!guard.access) return guard.response;
  const { access } = guard;

  let body: { role?: unknown };
  try {
    body = (await request.json()) as { role?: unknown };
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }
  if (body?.role !== "OWNER") {
    return NextResponse.json({ error: "Ugyldig rolle" }, { status: 400 });
  }

  try {
    const result = await setProjectLead(access.project, userId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    await writeAuditLog({
      customerId: access.project.customerId,
      userId: access.session.user.id,
      project: access.project,
      action: "project.lead.changed",
      entityType: "Project",
      entityId: projectId,
      changes: [
        {
          label: "Prosjektleder",
          from: result.previousLeadNames?.join(", ") || null,
          to: result.userName ?? "Ukjent bruker",
        },
      ],
      metadata: { leadUserId: userId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`Failed to change lead for project ${projectId}`, error);
    return NextResponse.json({ error: "Kunne ikke endre prosjektleder" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { projectId, userId } = await params;
  const guard = await requireAccessManager(projectId);
  if (!guard.access) return guard.response;
  const { access } = guard;

  try {
    const result = await removeProjectParticipant(access.project, userId, access.session.user.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    await writeAuditLog({
      customerId: access.project.customerId,
      userId: access.session.user.id,
      project: access.project,
      action: "project.participant.removed",
      entityType: "Project",
      entityId: projectId,
      changes: [
        {
          label: result.removedRole === "OWNER" ? "Prosjektleder" : "Deltaker",
          from: result.userName ?? "Ukjent bruker",
          to: null,
        },
      ],
      metadata: { participantUserId: userId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`Failed to remove participant from project ${projectId}`, error);
    return NextResponse.json({ error: "Kunne ikke fjerne deltaker" }, { status: 500 });
  }
}
