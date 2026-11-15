import { prisma } from "@/lib/prisma";

// Ditio Core-paritet: timer fra innsjekk i felt – fakturagrunnlag uten tasting.
export async function genererTimerFraInnsjekk(projectId: string, dato: Date) {
  const dagStart = new Date(dato); dagStart.setHours(0, 0, 0, 0);
  const dagSlutt = new Date(dagStart.getTime() + 86_400_000);
  const checkins = await prisma.crewCheckin.findMany({
    where: { projectId, checkinAt: { gte: dagStart, lt: dagSlutt }, checkoutAt: { not: null } },
  });
  let created = 0;
  for (const c of checkins) {
    const hours = (c.checkoutAt!.getTime() - c.checkinAt.getTime()) / 3600_000;
    if (hours <= 0 || hours > 16) continue; // rimelighetskontroll
    await prisma.timeEntry.create({
      data: {
        projectId, userId: c.userId,
        activity: "Feltarbeid (auto fra innsjekk)",
        hours: Math.round(hours * 4) / 4, // kvarter
        date: dagStart, source: "AUTO",
      },
    });
    created++;
  }
  return { created };
}

export async function timeoversikt(projectId: string, from: Date, to: Date) {
  const entries = await prisma.timeEntry.findMany({
    where: { projectId, date: { gte: from, lte: to } },
    orderBy: { date: "desc" },
  });
  const perUser: Record<string, number> = {};
  entries.forEach((e) => { perUser[e.userId] = (perUser[e.userId] ?? 0) + e.hours; });
  return { entries, perUser, totalHours: entries.reduce((a, e) => a + e.hours, 0) };
}

// ── Del 8: overtid + lønnseksport (Ditio Core-paritet) ──────────────────────
const NORMALTID_PER_DAG = 9; // aml. §10-4 alminnelig arbeidstid + spisepause-praksis; juster

export function beregnOvertid(hours: number): { normal: number; overtime: number } {
  const overtime = Math.max(0, hours - NORMALTID_PER_DAG);
  return { normal: hours - overtime, overtime };
}

/** CSV-eksport av godkjente timer til lønn (Visma/Tripletex-vennlig format).
 *  ERP-API-integrasjon er AP-10 i integrator-spec. */
export async function eksporterTimerCsv(projectId: string, from: Date, to: Date) {
  const entries = await prisma.timeEntry.findMany({
    where: { projectId, date: { gte: from, lte: to }, approved: true },
    orderBy: [{ userId: "asc" }, { date: "asc" }],
  });
  const header = "ansattId;dato;prosjekt;aktivitet;timer;overtid;kilde";
  const rows = entries.map((e) => {
    const { normal, overtime } = beregnOvertid(e.hours);
    return [e.userId, e.date.toISOString().slice(0, 10), projectId, e.activity, normal.toFixed(2), overtime.toFixed(2), e.source].join(";");
  });
  return [header, ...rows].join("\n");
}
