import { prisma } from "@/lib/prisma";
import { pointInPolygon } from "@/lib/kart/soner";

// Ditio Flow-paritet: automatisk lasstelling. En syklus = maskin innom
// LOAD-sone og deretter DUMP-sone. Genererer HaulCycle; bekreftede sykluser
// kan konverteres til LoadTicket (auto-masseregistrering uten tasting).
type Pt = [number, number];

export async function detekterSykluser(projectId: string, machineId: string) {
  const [zones, positions] = await Promise.all([
    prisma.siteZone.findMany({ where: { projectId, type: { in: ["LOAD", "DUMP"] } } }),
    prisma.machinePosition.findMany({
      where: { projectId, machineId, at: { gte: new Date(Date.now() - 24 * 3600_000) } },
      orderBy: { at: "asc" },
    }),
  ]);
  const load = zones.filter((z) => z.type === "LOAD");
  const dump = zones.filter((z) => z.type === "DUMP");
  let pending: { at: Date; zoneId: string } | null = null;
  let created = 0;

  for (const pos of positions) {
    const p: Pt = [pos.lat, pos.lng];
    const inLoad = load.find((z) => pointInPolygon(p, z.polygon as unknown as Pt[]));
    const inDump = dump.find((z) => pointInPolygon(p, z.polygon as unknown as Pt[]));
    if (inLoad) pending = { at: pos.at, zoneId: inLoad.id };
    else if (inDump && pending) {
      await prisma.haulCycle.create({
        data: {
          projectId, machineId,
          startedAt: pending.at, endedAt: pos.at,
          loadZoneId: pending.zoneId, dumpZoneId: inDump.id,
        },
      });
      created++;
      pending = null;
    }
  }
  return { created };
}

/** Konverterer bekreftede sykluser til lasslister (LoadTicket). */
export async function bekreftSomLass(haulId: string, params: {
  massTypeId: string; weightTonnes: number; userId: string;
}) {
  const haul = await prisma.haulCycle.findUniqueOrThrow({ where: { id: haulId } });
  const ticket = await prisma.loadTicket.create({
    data: {
      projectId: haul.projectId,
      direction: "OUT",
      massTypeId: params.massTypeId,
      weightTonnes: params.weightTonnes,
      distanceKm: haul.distanceKm,
      weighedAt: haul.endedAt ?? haul.startedAt,
      source: "MANUAL",
      createdById: params.userId,
    },
  });
  await prisma.haulCycle.update({ where: { id: haulId }, data: { loadTicketId: ticket.id } });
  return ticket;
}
