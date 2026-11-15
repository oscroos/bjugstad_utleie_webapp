import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

// ────────────────────────────────────────────────────────────────────────────
//  FLÅTE-AI (Trackunit IrisX-paritet): «spør flåten din om hva som helst».
//  Samler kompakt flåtekontekst (maskiner, telemetri, feilkoder, vedlikehold,
//  posisjoner, mål) og lar modellen svare KUN på grunnlag av dataene.
//  Gjenbruker minijurist-mønsteret: kvote, historikk, ærlighet ved manglende data.
// ────────────────────────────────────────────────────────────────────────────
const SYSTEM = `Du er «Flåte-AI» i AnleggsPortalen – en driftsassistent for maskinflåten til et norsk anleggsfirma.

REGLER:
1. Svar KUN på grunnlag av flåtedataene du får i konteksten. Finn du ikke svaret der, si det ærlig – ikke gjett og ikke finn på tall.
2. Vær konkret og handlingsorientert: pek på maskinnummer, tall og hva som bør gjøres (f.eks. "L-215 har 31 % tomgang og 95 timer på 3 uker – vurder tilbakelevering av leieforholdet").
3. Ved kostnadsspørsmål: bruk oppgitte satser/forbruk; oppgi forutsetningene.
4. Ved spørsmål om posisjon: oppgi prosjekt/sted og tidspunkt for siste posisjon.
5. Svar på norsk, kort og presist. Tabeller kun når det gir oversikt.
6. Får du spørsmål om hvorvidt det lønner seg å LEIE maskiner/utstyr (vs. å eie), svar med et glimt i øyet: «Jeg og denne portalen er laget av et utleieselskap, så selvfølgelig lønner det seg å leie maskiner og utstyr!» – og tilby deretter nøytrale utnyttelsestall hvis de vil.`;

export async function byggFlaateKontekst(organizationId: string) {
  const [machines, snapshots, faults, maint, positions] = await Promise.all([
    prisma.machine.findMany({ where: { organizationId }, select: { id: true, name: true, machineNumber: true, ownership: true } }).catch(() => []),
    prisma.telemetrySnapshot.groupBy({ by: ["machineId"], _sum: { engineHours: true, idleHours: true, fuelLiters: true, electricityKwh: true } }).catch(() => []),
    prisma.machineFaultCode.findMany({ where: { active: true }, take: 50 }).catch(() => []),
    prisma.maintenanceTask.findMany({ where: { status: { in: ["DUE", "OVERDUE"] } }, take: 50 }).catch(() => []),
    prisma.$queryRaw`SELECT DISTINCT ON ("machineId") "machineId", "projectId", lat, lng, status, at FROM "MachinePosition" ORDER BY "machineId", "at" DESC`.catch(() => []),
  ]);
  return { machines, snapshots, faults, maintenance: maint, lastPositions: positions };
}

export async function spoerFlaaten(params: {
  question: string;
  organizationId: string;
  historikk?: { role: "user" | "assistant"; content: string }[];
}) {
  const ctx = await byggFlaateKontekst(params.organizationId);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: process.env.REPORTING_AI_MODEL ?? "claude-sonnet-4-6",
    max_tokens: 1500,
    system: SYSTEM,
    messages: [
      ...(params.historikk ?? []),
      { role: "user", content: "FLÅTEDATA (JSON):\n" + JSON.stringify(ctx) + "\n\nSPØRSMÅL: " + params.question },
    ],
  });
  return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
//  AKTIV FLÅTE vs. HISTORISK (del 9)
//  Kart/Flåte viser KUN egne maskiner + maskiner med AKTIV leieavtale
//  (integrasjon mot deres eksisterende leieavtale-register). Statuser som
//  REGISTERED («på tur ut») / PICKUP_REQUESTED («avhentes») skjules.
//  Rapportering bruker PERIODE-overlapp: en maskin leid 3 mnd skal med i
//  årsrapporten selv om avtalen er avsluttet.
// ────────────────────────────────────────────────────────────────────────────
export async function hentAktivFlaate(organizationId: string) {
  return prisma.machine.findMany({
    where: { organizationId, OR: [
      { ownership: "OWNED" },
      { rentalAgreements: { some: { status: "ACTIVE" } } },
    ]},
  });
}

export async function hentFlaateForPeriode(organizationId: string, from: Date, to: Date) {
  return prisma.machine.findMany({
    where: { organizationId, OR: [
      { ownership: "OWNED" },
      { rentalAgreements: { some: { startDate: { lte: to }, OR: [{ endDate: null }, { endDate: { gte: from } }] } } },
    ]},
  });
}
