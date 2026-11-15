import { prisma } from "@/lib/prisma";

// ────────────────────────────────────────────────────────────────────────────
//  MASKINTELEMETRI – connector-lag (Fremby-paritet)
//  Én normalisert modell uansett merke. Hver leverandør får en connector som
//  implementerer TelemetryConnector; synk-cronen kaller alle aktive lenker.
// ────────────────────────────────────────────────────────────────────────────

export interface NormalizedSnapshot {
  externalId: string;
  periodStart: Date;
  periodEnd: Date;
  engineHours?: number;
  idleHours?: number;
  fuelLiters?: number;
  energyKwh?: number;
  distanceKm?: number;
  payloadTonnes?: number;
  raw?: unknown;
}

export interface TelemetryConnector {
  provider: string;
  fetchSnapshots(externalId: string, credentialRef: string | null, from: Date, to: Date): Promise<NormalizedSnapshot[]>;
}

// INTEGRASJONSPUNKTER: én connector per leverandør-API. Strukturen er lik for
// alle – autentiser, hent periode-data, map til NormalizedSnapshot.
// Dokumentasjon: Volvo CE Connect API, Cat VisionLink API, Komatsu Komtrax,
// Scania FMS, Trackunit Iris API (aggregator som dekker mange merker – start
// der for bredest dekning raskest).
const connectors: Record<string, TelemetryConnector> = {
  TRACKUNIT: {
    provider: "TRACKUNIT",
    async fetchSnapshots(_externalId, _cred, _from, _to) {
      // TODO: GET https://iris.trackunit.com/... med API-nøkkel fra secret-store
      return [];
    },
  },
  VOLVO_CE: {
    provider: "VOLVO_CE",
    async fetchSnapshots() { /* TODO: Volvo Connect / CareTrack API */ return []; },
  },
  CAT: {
    provider: "CAT",
    async fetchSnapshots() { /* TODO: Cat VisionLink API */ return []; },
  },
  KOMATSU: {
    provider: "KOMATSU",
    async fetchSnapshots() { /* TODO: Komtrax API */ return []; },
  },
  SCANIA: {
    provider: "SCANIA",
    async fetchSnapshots() { /* TODO: Scania FMS API */ return []; },
  },
};

export function getConnector(provider: string): TelemetryConnector | null {
  return connectors[provider] ?? null;
}

/** Kjøres av cron: henter og lagrer snapshots for alle aktive lenker. */
export async function synkAlleMaskiner(from: Date, to: Date) {
  const links = await prisma.machineTelemetryLink.findMany({ where: { active: true } });
  let stored = 0;
  for (const link of links) {
    const c = getConnector(link.provider);
    if (!c) continue;
    const snaps = await c.fetchSnapshots(link.externalId, link.credentialRef, from, to);
    for (const s of snaps) {
      // Prosjektallokering: aktiv utleieavtale i perioden (fallback: null).
      const projectId = await finnProsjektForMaskin(link.machineId, s.periodStart);
      await prisma.telemetrySnapshot.upsert({
        where: { machineId_periodStart_provider: { machineId: link.machineId, periodStart: s.periodStart, provider: link.provider } },
        update: {},
        create: {
          machineId: link.machineId,
          projectId,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          engineHours: s.engineHours ?? null,
          idleHours: s.idleHours ?? null,
          fuelLiters: s.fuelLiters ?? null,
          energyKwh: s.energyKwh ?? null,
          distanceKm: s.distanceKm ?? null,
          payloadTonnes: s.payloadTonnes ?? null,
          provider: link.provider,
          raw: (s.raw ?? undefined) as never,
        },
      });
      stored++;
    }
    await prisma.machineTelemetryLink.update({ where: { id: link.id }, data: { lastSyncAt: new Date() } });
  }
  return { links: links.length, stored };
}

async function finnProsjektForMaskin(machineId: string, at: Date): Promise<string | null> {
  // INTEGRASJONSPUNKT mot deres utleiemodul:
  //   const avtale = await prisma.rentalAgreement.findFirst({
  //     where: { machineId, startDate: { lte: at }, OR: [{ endDate: null }, { endDate: { gte: at } }] },
  //     select: { projectId: true },
  //   });
  //   return avtale?.projectId ?? null;
  return null;
}

// ── Analyser ────────────────────────────────────────────────────────────────

const IDLE_LITER_PER_TIME = 4;     // typisk tomgangsforbruk gravemaskin (l/t) – juster
const DIESEL_PRIS = 18;            // NOK/l – hent fra MachineCostProfile ved behov

export async function beregnTomgang(projectId: string | null, orgProjectIds: string[]) {
  const snaps = await prisma.telemetrySnapshot.findMany({
    where: { projectId: projectId ? projectId : { in: orgProjectIds } },
  });
  const engine = snaps.reduce((a, s) => a + (s.engineHours ?? 0), 0);
  const idle = snaps.reduce((a, s) => a + (s.idleHours ?? 0), 0);
  const idlePct = engine > 0 ? (idle / engine) * 100 : 0;
  const wastedLiters = idle * IDLE_LITER_PER_TIME;
  return {
    engineHours: engine,
    idleHours: idle,
    idlePct,
    wastedLiters,
    wastedNok: wastedLiters * DIESEL_PRIS,
    wastedKgCo2e: wastedLiters * 2.66,
  };
}

/** Elektrifiseringsgrad: andel av energibruk levert elektrisk (kWh-ekvivalent). */
export async function beregnElektrifiseringsgrad(projectId: string | null, orgProjectIds: string[]) {
  const snaps = await prisma.telemetrySnapshot.findMany({
    where: { projectId: projectId ? projectId : { in: orgProjectIds } },
  });
  const kwhEl = snaps.reduce((a, s) => a + (s.energyKwh ?? 0), 0);
  const kwhDiesel = snaps.reduce((a, s) => a + (s.fuelLiters ?? 0) * 9.96, 0); // ~9.96 kWh/l diesel
  const total = kwhEl + kwhDiesel;
  return { electricKwh: kwhEl, dieselKwhEquivalent: kwhDiesel, electricPct: total > 0 ? (kwhEl / total) * 100 : 0 };
}
