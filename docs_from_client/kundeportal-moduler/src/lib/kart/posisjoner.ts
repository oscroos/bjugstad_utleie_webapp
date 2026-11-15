import { prisma } from "@/lib/prisma";

// Samlet kartbilde for et prosjekt: «single pane view» (MachineMax-paritet).
// Maskiner m/siste posisjon+status, småutstyr (tags), mannskap innsjekket,
// soner og ukvitterte hendelser.
export async function hentKartData(projectId: string) {
  const [positions, tags, crew, zones, events, maintenance] = await Promise.all([
    // siste posisjon per maskin (Postgres DISTINCT ON via raw eller gruppering)
    prisma.$queryRaw`
      SELECT DISTINCT ON ("machineId") *
      FROM "MachinePosition"
      WHERE "projectId" = ${projectId}
      ORDER BY "machineId", "at" DESC`,
    prisma.assetTag.findMany({ where: { projectId } }),
    prisma.crewCheckin.findMany({
      where: { projectId, checkoutAt: null },
      select: { userId: true, checkinAt: true, lat: true, lng: true, source: true },
    }),
    prisma.siteZone.findMany({ where: { projectId } }),
    prisma.zoneEvent.findMany({
      where: { projectId, acknowledged: false },
      orderBy: { at: "desc" },
      take: 50,
    }),
    prisma.maintenanceTask.findMany({
      where: { status: { in: ["DUE", "OVERDUE"] } },
      take: 100,
    }),
  ]);
  return { positions, tags, crew, zones, events, maintenance };
}
