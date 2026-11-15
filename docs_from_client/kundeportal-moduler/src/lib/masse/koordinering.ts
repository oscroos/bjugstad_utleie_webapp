import { prisma } from "@/lib/prisma";

// Massekoordinering: gjenstående plan INN/UT per massetype per prosjekt.
// Overskudd (UT igjen) matches mot behov (INN igjen) hos andre prosjekter.
export async function beregnKoordinering(organizationId: string) {
  const prosjekter = await prisma.project.findMany({
    where: { organizationId, status: "ACTIVE" },
    include: { massTypes: { include: { massType: true } }, massMovements: true },
  });
  const rows: { projectId: string; projectLabel: string; massTypeId: string; massType: string; utIgjen: number; innIgjen: number }[] = [];
  for (const pr of prosjekter) {
    for (const mt of pr.massTypes) {
      const reg = (dir: string) => pr.massMovements.filter((m) => m.massTypeId === mt.massTypeId && m.direction === dir).reduce((a, m) => a + m.quantity, 0);
      rows.push({
        projectId: pr.id, projectLabel: pr.projectNumber + " " + pr.name,
        massTypeId: mt.massTypeId, massType: mt.massType.name,
        utIgjen: Math.max(0, (mt.plannedOut ?? 0) - reg("OUT")),
        innIgjen: Math.max(0, (mt.plannedIn ?? 0) - reg("IN")),
      });
    }
  }
  const matches: { massType: string; fra: string; til: string; volum: number }[] = [];
  for (const a of rows.filter((r) => r.utIgjen > 0)) {
    for (const b of rows.filter((r) => r.innIgjen > 0 && r.massTypeId === a.massTypeId && r.projectId !== a.projectId)) {
      matches.push({ massType: a.massType, fra: a.projectLabel, til: b.projectLabel, volum: Math.min(a.utIgjen, b.innIgjen) });
    }
  }
  return { rows, matches: matches.sort((x, y) => y.volum - x.volum) };
}
