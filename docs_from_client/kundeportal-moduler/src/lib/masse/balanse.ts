import { prisma } from "@/lib/prisma";

// Massebalanse på tvers av prosjekter/steder/hele org (Fremby-paritet).
// Kilder: MassMovement (portal/app) + LoadTicket (digitale lasslister).
export async function masseBalanse(organizationId: string, groupBy: "project" | "city" | "org") {
  const projects = await prisma.project.findMany({
    where: { organizationId },
    select: { id: true, projectNumber: true, name: true, city: true },
  });
  const pMap = new Map(projects.map((p) => [p.id, p]));
  const ids = projects.map((p) => p.id);

  const [movements, tickets] = await Promise.all([
    prisma.massMovement.findMany({
      where: { projectId: { in: ids } },
      select: { projectId: true, direction: true, volumeM3: true, massType: true },
    }),
    prisma.loadTicket.findMany({
      where: { projectId: { in: ids } },
      select: { projectId: true, direction: true, weightTonnes: true, volumeM3: true },
    }),
  ]);

  const key = (pid: string) => {
    const p = pMap.get(pid);
    if (!p) return "ukjent";
    return groupBy === "org" ? "Hele selskapet" : groupBy === "city" ? (p.city ?? "ukjent") : `${p.projectNumber} ${p.name}`;
  };

  const acc: Record<string, { inM3: number; outM3: number; inTonnes: number; outTonnes: number }> = {};
  const add = (k: string, dir: string, m3: number, t: number) => {
    acc[k] ??= { inM3: 0, outM3: 0, inTonnes: 0, outTonnes: 0 };
    if (dir === "IN") { acc[k].inM3 += m3; acc[k].inTonnes += t; }
    else { acc[k].outM3 += m3; acc[k].outTonnes += t; }
  };
  movements.forEach((m) => add(key(m.projectId), m.direction as string, m.volumeM3 ?? 0, 0));
  tickets.forEach((t) => add(key(t.projectId), t.direction as string, t.volumeM3 ?? 0, t.weightTonnes));

  return Object.entries(acc).map(([group, v]) => ({
    group, ...v, netM3: v.inM3 - v.outM3, netTonnes: v.inTonnes - v.outTonnes,
  }));
}
