import { prisma } from "@/lib/prisma";
import type { ProjectAnalysisContext, MachineContext } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────────
//  KONTEKST-BYGGER for AI-analysen.
//
//  Her kobles rapporteringsmodulen mot resten av portalen. Tre INTEGRASJONS-
//  PUNKTER er markert med TODO – bytt ut med deres faktiske spørringer mot
//  maskin-/utleie- og dokumentmodulen. Alt annet fungerer som det står.
// ────────────────────────────────────────────────────────────────────────────

export async function hentProsjektKontekst(
  projectId: string
): Promise<ProjectAnalysisContext> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      projectNumber: true,
      name: true,
      city: true,
      clientName: true,
      nsStandards: { select: { standardNo: true, title: true, clause: true } },
      contractDocuments: { select: { documentId: true, fileName: true } },
    },
  });

  // Nye interne datakilder: HMS- og miljømodulen. Når disse har data, skal AI
  // markere tilhørende rapportfelt som availableInPortal=true med sourceRef.
  const [ruhCount, roundCount, fuelCount] = await Promise.all([
    prisma.ruhReport.count({ where: { projectId } }),
    prisma.safetyRound.count({ where: { projectId } }),
    prisma.fuelUsage.count({ where: { projectId } }),
  ]);
  const internalSources: string[] = [];
  if (ruhCount > 0) internalSources.push("hms.ruh (antall RUH per periode og alvorlighet)");
  if (roundCount > 0) internalSources.push("hms.vernerunder (antall og dato for vernerunder)");
  if (fuelCount > 0) internalSources.push("miljo.forbruk (drivstoff/energi per maskin, CO2e-beregning)");

  // ── INTEGRASJONSPUNKT 1: maskiner på prosjektet ───────────────────────────
  // Erstatt med spørring mot maskin-/utleiemodulen. availableFields skal liste
  // feltene dere FAKTISK har data på, slik at AI vet hva som kan hentes auto.
  const machines: MachineContext[] = await hentMaskinerForProsjekt(projectId);

  // ── INTEGRASJONSPUNKT 2: dokumenttekst ────────────────────────────────────
  // Trekk ut tekst fra hvert dratt-inn dokument (PDF/Word) via deres
  // dokumentmodul / tekst-ekstraksjon.
  const contractDocuments = await Promise.all(
    project.contractDocuments.map(async (d) => ({
      fileName: d.fileName ?? d.documentId,
      text: await hentDokumentTekst(d.documentId),
    }))
  );

  return {
    project: {
      projectNumber: project.projectNumber,
      name: project.name,
      city: project.city,
      clientName: project.clientName,
    },
    machines,
    nsStandards: project.nsStandards,
    contractDocuments,
    internalSources,
  };
}

// ── Stubbete integrasjonsfunksjoner (bytt ut med reell kobling) ─────────────

async function hentMaskinerForProsjekt(projectId: string): Promise<MachineContext[]> {
  // TODO: koble mot maskin-/utleiemodulen. Eksempel på hvordan resultatet skal se ut:
  //
  //   const machines = await prisma.machine.findMany({
  //     where: { rentalAgreements: { some: { projectId } } },
  //     select: { id: true, name: true, type: true, operatingHours: true, lastServiceDate: true },
  //   });
  //   return machines.map((m) => ({
  //     id: m.id,
  //     name: m.name,
  //     type: m.type,
  //     availableFields: [
  //       m.operatingHours != null ? "operatingHours" : null,
  //       m.lastServiceDate != null ? "lastServiceDate" : null,
  //     ].filter(Boolean) as string[],
  //   }));
  void projectId;
  return [];
}

async function hentDokumentTekst(documentId: string): Promise<string> {
  // TODO: hent lagret/uttrukket tekst fra dokumentmodulen (PDF/Word → tekst).
  // Returner tom streng hvis tekst ikke er tilgjengelig ennå.
  void documentId;
  return "";
}
