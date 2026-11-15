import { NextResponse } from "next/server";
import { requireProjectRole, writeAuditLog } from "@/lib/access";
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
      select: { id: true },
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

    const zones: ProjectZone[] = saved.map((zone) => {
      const geometry = zone.geometry as { coordinates: Array<Array<[number, number]>> };
      const ring = geometry.coordinates[0] ?? [];
      return {
        id: zone.id,
        name: zone.name,
        color: zone.color,
        coordinates: ring.slice(0, -1),
      };
    });

    await writeAuditLog({
      customerId: access.project.customerId,
      userId: access.session.user.id,
      action: "project.zones.updated",
      entityType: "project",
      entityId: projectId,
      metadata: { zoneCount: zones.length },
    });

    return NextResponse.json({ zones });
  } catch (error) {
    console.error(`Failed to save zones for project ${projectId}`, error);
    return NextResponse.json({ error: "Kunne ikke lagre anleggssoner" }, { status: 500 });
  }
}
