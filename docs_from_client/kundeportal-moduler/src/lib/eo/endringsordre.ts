import { prisma } from "@/lib/prisma";

// Felt oppretter «mulig endring» → kontor vurderer → CHANGE (felt varsles,
// EO-nr settes) eller NO_CHANGE m/årsak (felt varsles, arkiveres). Varsel til
// byggherre + periodiske oppdateringer. Minijurist-kobling: «uten ugrunnet
// opphold» + tidsnære oppdateringer (HR-2019-1225-A).
async function varsle(userId: string, title: string, body: string, refId: string) {
  await prisma.notification.create({ data: { userId, title, body, kind: "EO", refType: "ChangeOrder", refId } });
}

export async function vurderMuligEndring(eoId: string, params: {
  decision: "CHANGE" | "NO_CHANGE"; reason?: string; reviewerId: string;
}) {
  const eo = await prisma.changeOrder.findUniqueOrThrow({ where: { id: eoId } });
  if (eo.status !== "POSSIBLE") throw new Error("Kan bare vurdere mulige endringer.");
  if (params.decision === "NO_CHANGE" && !params.reason?.trim()) throw new Error("Årsak er påkrevd ved «ingen endring».");
  if (params.decision === "CHANGE") {
    const count = await prisma.changeOrder.count({ where: { projectId: eo.projectId, status: { in: ["CHANGE", "COMPLETED"] } } });
    const updated = await prisma.changeOrder.update({ where: { id: eoId }, data: { status: "CHANGE", eoNumber: "EO-" + String(count + 1).padStart(2, "0") } });
    await varsle(eo.createdById, "Endring bekreftet", `«${eo.title}» er vurdert som reell endring (${updated.eoNumber}).`, eoId);
    return updated;
  }
  const updated = await prisma.changeOrder.update({ where: { id: eoId }, data: { status: "NO_CHANGE", noChangeReason: params.reason!.trim() } });
  await varsle(eo.createdById, "Ingen endring", `«${eo.title}»: ${params.reason!.trim()}`, eoId);
  return updated;
}

/** Periodiske oppdateringer til byggherre. Kjøres i daglig cron. */
export async function sendPlanlagteOppdateringer(naa = new Date()) {
  const erFredag = naa.getDay() === 5;
  const dag = naa.getDay();
  let sisteArbeidsdag = false;
  if (dag >= 1 && dag <= 5) {
    const hopp = dag === 5 ? 3 : 1; // fredag → mandag
    sisteArbeidsdag = new Date(naa.getTime() + hopp * 86_400_000).getMonth() !== naa.getMonth();
  }
  const due = await prisma.changeOrder.findMany({
    where: { status: "CHANGE", clientResponse: { not: "NOT_NOTIFIED" }, OR: [
      ...(erFredag ? [{ updateInterval: "WEEKLY_FRIDAY" as const }] : []),
      ...(sisteArbeidsdag ? [{ updateInterval: "LAST_WORKDAY_MONTH" as const }] : []),
    ]},
    include: { entries: { where: { at: { gt: new Date(naa.getTime() - 32 * 86_400_000) } } } },
  });
  // E-post til byggherre m/logg-sammendrag og bilder = integrasjonspunkt.
  for (const eo of due) {
    await prisma.changeOrder.update({ where: { id: eo.id }, data: { lastUpdateSentAt: naa } });
  }
  return { sent: due.length };
}
