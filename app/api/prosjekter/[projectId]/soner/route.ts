import { NextResponse } from "next/server";
import { requireProjectRole, writeAuditLog } from "@/lib/access";
import { diffZones, type AuditZone } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeProjectZones, zoneToGeometry, type ProjectZone } from "@/lib/projects";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

// Replaces the project's full zone list. Existing ids are updated in place so
// that zone ids stay stable for anything that references them later.
export async function PUT(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const access = await requireProjectRole(projectId, "PROJECT_MANAGER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  let body: { zones?: unknown };
  try {
    body = (await request.json()) as { zones?: unknown };
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const normalized = normalizeProjectZones(body.zones);
  if (normalized.error) return NextResponse.json({ error: normalized.error }, { status: 400 });

  try {
    const existing = await prisma.projectZone.findMany({
      where: { projectId },
      select: { id: true, name: true, color: true, geometry: true },
    });
    const existingIds = new Set(existing.map((zone) => zone.id));
    const incomingIds = new Set(
      normalized.values.map((zone) => zone.id).filter((id): id is string => Boolean(id)),
    );

    await prisma.$transaction([
      prisma.projectZone.deleteMany({
        where: { projectId, id: { notIn: [...incomingIds] } },
      }),
      ...normalized.values.map((zone, index) => {
        const data = {
          name: zone.name,
          color: zone.color,
          sortOrder: index,
          geometry: zoneToGeometry(zone.coordinates),
        };
        return zone.id && existingIds.has(zone.id)
          ? prisma.projectZone.update({ where: { id: zone.id }, data })
          : prisma.projectZone.create({ data: { ...data, projectId } });
      }),
    ]);

    const saved = await prisma.projectZone.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    const zones: ProjectZone[] = saved.map(toZone);
    const changes = diffZones(existing.map(toZone), zones);

    // A save that changed nothing is not an activity.
    if (changes.length > 0) {
      await writeAuditLog({
        customerId: access.project.customerId,
        userId: access.session.user.id,
        project: access.project,
        action: "project.zones.updated",
        entityType: "Project",
        entityId: projectId,
        changes,
        metadata: { zoneCount: zones.length },
      });
    }

    return NextResponse.json({ zones });
  } catch (error) {
    console.error(`Failed to save zones for project ${projectId}`, error);
    return NextResponse.json({ error: "Kunne ikke lagre anleggssoner" }, { status: 500 });
  }
}

// Stored geometry is a closed GeoJSON ring; the UI and the log use the open ring.
function toZone(zone: { id: string; name: string; color: string; geometry: unknown }): AuditZone {
  const geometry = zone.geometry as { coordinates?: Array<Array<[number, number]>> } | null;
  const ring = geometry?.coordinates?.[0] ?? [];
  return { id: zone.id, name: zone.name, color: zone.color, coordinates: ring.slice(0, -1) };
}
