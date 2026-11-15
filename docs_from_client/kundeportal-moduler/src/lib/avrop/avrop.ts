import { prisma } from "@/lib/prisma";

// ────────────────────────────────────────────────────────────────────────────
//  AVROP-FLYT (AP-12)
//  1. Kunden fyller ut ønskede maskiner (beskrivelse/antall/periode/prosjekt)
//     og trykker «Send til utleier» → status SENT + push via API til
//     Bjugstad-registeret; avropet dukker opp i kundeoppfølgingsmodulen
//     (Blazor) hos utleier.
//  2. Utleier legger inn maskinnummer per linje; kontraktspriser hentes
//     automatisk fra utleiers prisregister; utleier signerer.
//  3. Retur via webhook → status PRICED_BY_LESSOR; kunden ser priser+maskiner.
//  4. Kunden signerer → status ACTIVE (aktive avrop) + bekreftelse pushes
//     tilbake til registeret. Signert PDF arkiveres i «Avropsdokumenter».
// ────────────────────────────────────────────────────────────────────────────
export async function sendAvropTilUtleier(callOffId: string) {
  const avrop = await prisma.callOff.findUniqueOrThrow({ where: { id: callOffId }, include: { lines: true } });
  if (avrop.status !== "DRAFT") throw new Error("Avropet er allerede sendt.");
  const year = new Date().getFullYear();
  const count = await prisma.callOff.count({ where: { organizationId: avrop.organizationId, number: { not: null } } });
  const number = `AVR-${year}-${String(count + 1).padStart(3, "0")}`;

  // Push til Bjugstad-registeret (utleiers API). Payload-kontrakt: se AP-12.
  const res = await fetch(process.env.BJUGSTAD_REGISTER_URL + "/api/avrop", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.BJUGSTAD_REGISTER_API_KEY ?? "" },
    body: JSON.stringify({
      portalCallOffId: avrop.id,
      number,
      frameAgreementRef: avrop.frameAgreementRef,
      lines: avrop.lines.map((l) => ({
        lineId: l.id, description: l.description, quantity: l.quantity,
        wantedFrom: l.wantedFrom, wantedTo: l.wantedTo, projectId: l.projectId,
      })),
    }),
  });
  if (!res.ok) throw new Error("Kunne ikke sende avropet til utleiers register (" + res.status + ").");
  const body = await res.json().catch(() => ({}));
  return prisma.callOff.update({
    where: { id: callOffId },
    data: { status: "SENT", sentAt: new Date(), number, externalRef: body.externalRef ?? null },
  });
}

/** Webhook-mottak: utleier har priset (fra kontraktsprisregisteret) og signert. */
export async function mottaAvropRetur(payload: {
  portalCallOffId: string;
  lines: { lineId: string; machineNumber: string; priceText: string }[];
  lessorSignedBy: string; lessorSignedAt: string;
}) {
  for (const l of payload.lines) {
    await prisma.callOffLine.update({ where: { id: l.lineId }, data: { machineNumber: l.machineNumber, priceText: l.priceText } });
  }
  return prisma.callOff.update({
    where: { id: payload.portalCallOffId },
    data: { status: "PRICED_BY_LESSOR", lessorSignedBy: payload.lessorSignedBy, lessorSignedAt: new Date(payload.lessorSignedAt) },
  });
}

export async function signerAvrop(callOffId: string, userId: string, userName: string) {
  const avrop = await prisma.callOff.findUniqueOrThrow({ where: { id: callOffId } });
  if (avrop.status !== "PRICED_BY_LESSOR") throw new Error("Avropet er ikke klart for signering.");
  const updated = await prisma.callOff.update({
    where: { id: callOffId },
    data: { status: "ACTIVE", customerSignedAt: new Date(), customerSignedBy: userName },
  });
  // Bekreft tilbake til utleiers register (fire-and-forget m/logging i prod)
  fetch(process.env.BJUGSTAD_REGISTER_URL + "/api/avrop/" + (avrop.externalRef ?? avrop.id) + "/kundesignatur", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.BJUGSTAD_REGISTER_API_KEY ?? "" },
    body: JSON.stringify({ customerSignedBy: userName, customerSignedAt: updated.customerSignedAt }),
  }).catch(() => {});
  return updated;
}
