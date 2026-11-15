import { prisma } from "@/lib/prisma";
import { evaluerKontraktsmaal } from "@/lib/flate/kpi";

// Compliance-oversikt på tvers av alle prosjekter: det daglig leder åpner.
// Rød/gul/grønn per prosjekt basert på: forfalte rapporter, krav som forfaller
// ≤7 dager, KPI-brudd, varslingspliktige HMS-hendelser, masseplan-overskridelse.
export interface ProsjektStatus {
  projectId: string;
  projectNumber: string;
  name: string;
  level: "RED" | "YELLOW" | "GREEN";
  issues: string[];
}

export async function complianceOversikt(organizationId: string): Promise<{
  projects: ProsjektStatus[];
  totals: { red: number; yellow: number; green: number };
}> {
  const projects = await prisma.project.findMany({
    where: { organizationId, status: { in: ["PLANNING", "ACTIVE"] } },
    select: { id: true, projectNumber: true, name: true },
  });

  const naa = new Date();
  const soon = new Date(naa.getTime() + 7 * 86_400_000);
  const result: ProsjektStatus[] = [];

  for (const p of projects) {
    const issues: string[] = [];
    let level: ProsjektStatus["level"] = "GREEN";
    const bump = (l: "RED" | "YELLOW") => {
      if (l === "RED") level = "RED";
      else if (level === "GREEN") level = "YELLOW";
    };

    const [overdue, dueSoon, lostTime, kpis, massTypes] = await Promise.all([
      prisma.report.count({ where: { requirement: { projectId: p.id }, status: "OVERDUE" } }),
      prisma.reportingRequirement.count({ where: { projectId: p.id, status: "ACTIVE", nextDueDate: { gte: naa, lte: soon } } }),
      prisma.ruhReport.count({ where: { projectId: p.id, severity: "INJURY_LOST_TIME", status: { not: "CLOSED" } } }),
      evaluerKontraktsmaal(p.id, organizationId),
      prisma.projectMassType.findMany({ where: { projectId: p.id }, include: { massType: true } }),
    ]);

    if (overdue > 0) { issues.push(`${overdue} forfalt(e) rapport(er)`); bump("RED"); }
    if (dueSoon > 0) { issues.push(`${dueSoon} krav forfaller ≤7 dager`); bump("YELLOW"); }
    if (lostTime > 0) { issues.push(`${lostTime} åpen varslingspliktig HMS-hendelse`); bump("RED"); }
    const breach = kpis.filter((k) => k.status === "BREACH");
    const warn = kpis.filter((k) => k.status === "WARNING");
    if (breach.length) { issues.push(`Kontraktsmål brutt: ${breach.map((b) => b.label).join(", ")}`); bump("RED"); }
    if (warn.length) { issues.push(`${warn.length} kontraktsmål nær grensen`); bump("YELLOW"); }

    // Masseplan: registrert UT > planlagt UT per type?
    for (const mt of massTypes) {
      const regOut = await prisma.massMovement.aggregate({
        where: { projectId: p.id, direction: "OUT", massTypeId: mt.massTypeId },
        _sum: { volumeM3: true },
      });
      if (mt.plannedOut > 0 && (regOut._sum.volumeM3 ?? 0) > mt.plannedOut) {
        issues.push(`Masse UT over plan: ${mt.massType.name}`);
        bump("YELLOW");
      }
    }

    result.push({ projectId: p.id, projectNumber: p.projectNumber, name: p.name, level, issues });
  }

  const totals = {
    red: result.filter((r) => r.level === "RED").length,
    yellow: result.filter((r) => r.level === "YELLOW").length,
    green: result.filter((r) => r.level === "GREEN").length,
  };
  return { projects: result.sort((a, b) => (a.level === "RED" ? -1 : b.level === "RED" ? 1 : a.level === "YELLOW" ? -1 : 1)), totals };
}
