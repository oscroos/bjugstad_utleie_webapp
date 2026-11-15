import { prisma } from "@/lib/prisma";

// ────────────────────────────────────────────────────────────────────────────
//  CO2-/MILJØREGNSKAP – beregningsmotor
//
//  Dimensjoner som støttes (ditt krav):
//    • sted            – prosjektets by/adresse (grupperer prosjekter per sted)
//    • prosjekt        – ett prosjekt
//    • ue              – kun UE-maskiner
//    • leide maskiner  – kun RENTED
//    • egne maskiner   – kun OWNED
//    • egne + leide    – OWNED + RENTED
//    • alle            – OWNED + RENTED + SUBCONTRACTOR
//
//  Kilder: FuelUsage (maskinforbruk) + MassMovement (transport, via km/turer).
//  Utslippsfaktorer fra EmissionFactor-tabellen (seedes under).
// ────────────────────────────────────────────────────────────────────────────

export type OwnershipScope =
  | "OWNED"            // egne
  | "RENTED"           // leide
  | "SUBCONTRACTOR"    // UE
  | "OWNED_RENTED"     // egne + leide
  | "ALL";             // egne + leide + UE

const SCOPE_TO_OWNERSHIPS: Record<OwnershipScope, string[]> = {
  OWNED: ["OWNED"],
  RENTED: ["RENTED"],
  SUBCONTRACTOR: ["SUBCONTRACTOR"],
  OWNED_RENTED: ["OWNED", "RENTED"],
  ALL: ["OWNED", "RENTED", "SUBCONTRACTOR"],
};

// Standardfaktorer (kg CO2e per enhet) – brukes hvis EmissionFactor-tabellen
// er tom. Kilder: DFØ/Miljødirektoratet-typiske verdier; VERIFISER mot
// gjeldende offisielle faktorer før regnskapet brukes i anbud/rapportering.
export const DEFAULT_FACTORS: Record<string, { unit: string; kg: number }> = {
  DIESEL: { unit: "liter", kg: 2.66 },  // anleggsdiesel inkl. WTT ~3.2; ren forbrenning 2.66
  HVO: { unit: "liter", kg: 0.35 },
  ELECTRIC: { unit: "kWh", kg: 0.019 }, // norsk strømmiks (lokasjonsbasert)
  BIOGAS: { unit: "kg", kg: 0.30 },
  PETROL: { unit: "liter", kg: 2.32 },
  HYDROGEN: { unit: "kg", kg: 0.0 },    // grønn H2; grå har høyere – juster ved behov
};

export interface Co2Filter {
  organizationId: string;
  projectId?: string;      // ett prosjekt
  city?: string;           // sted (alle prosjekter i by)
  scope: OwnershipScope;
  from?: Date;
  to?: Date;
}

export interface Co2Line {
  key: string;             // maskin/kategori
  ownership: string;
  fuelType: string;
  amount: number;
  unit: string;
  kgCo2e: number;
}

export interface Co2Result {
  totalKgCo2e: number;
  byOwnership: Record<string, number>; // OWNED/RENTED/SUBCONTRACTOR → kg
  byFuelType: Record<string, number>;
  byProject: Record<string, number>;   // prosjektnr → kg (relevant ved sted/org-nivå)
  transportKgCo2e: number;             // andel fra massetransport
  lines: Co2Line[];
  factorsUsed: Record<string, number>;
}

async function hentFaktorer(): Promise<Record<string, { unit: string; kg: number }>> {
  const rows = await prisma.emissionFactor.findMany();
  if (rows.length === 0) return DEFAULT_FACTORS;
  const map: Record<string, { unit: string; kg: number }> = { ...DEFAULT_FACTORS };
  rows.forEach((r) => { map[r.fuelType] = { unit: r.unit, kg: r.kgCo2ePerUnit }; });
  return map;
}

/** Hovedberegning. Aggregerer FuelUsage + transport fra MassMovement. */
export async function beregnCo2(filter: Co2Filter): Promise<Co2Result> {
  const faktorer = await hentFaktorer();
  const ownerships = SCOPE_TO_OWNERSHIPS[filter.scope];

  // Finn prosjektene i scope (ett, per sted, eller alle i org)
  const projects = await prisma.project.findMany({
    where: {
      organizationId: filter.organizationId,
      ...(filter.projectId ? { id: filter.projectId } : {}),
      ...(filter.city ? { city: { equals: filter.city, mode: "insensitive" } } : {}),
    },
    select: { id: true, projectNumber: true, city: true },
  });
  const projectIds = projects.map((p) => p.id);
  const projNr = Object.fromEntries(projects.map((p) => [p.id, p.projectNumber]));

  const periode = {
    ...(filter.from ? { gte: filter.from } : {}),
    ...(filter.to ? { lte: filter.to } : {}),
  };

  // 1) Maskinforbruk
  const usages = await prisma.fuelUsage.findMany({
    where: {
      projectId: { in: projectIds },
      ownership: { in: ownerships as never },
      ...(filter.from || filter.to ? { periodStart: periode } : {}),
    },
  });

  const lines: Co2Line[] = [];
  const byOwnership: Record<string, number> = {};
  const byFuelType: Record<string, number> = {};
  const byProject: Record<string, number> = {};
  let total = 0;

  for (const u of usages) {
    const f = faktorer[u.fuelType] ?? { unit: "?", kg: 0 };
    const kg = u.amount * f.kg;
    total += kg;
    byOwnership[u.ownership] = (byOwnership[u.ownership] ?? 0) + kg;
    byFuelType[u.fuelType] = (byFuelType[u.fuelType] ?? 0) + kg;
    const nr = projNr[u.projectId] ?? u.projectId;
    byProject[nr] = (byProject[nr] ?? 0) + kg;
    lines.push({
      key: u.machineName,
      ownership: u.ownership,
      fuelType: u.fuelType,
      amount: u.amount,
      unit: f.unit,
      kgCo2e: kg,
    });
  }

  // 2) Massetransport (km × turer × forbruk). Antatt 0.35 l diesel/km for
  //    lastebil med henger – overstyr med reelle tall når dere har dem.
  const LITER_PER_KM = 0.35;
  let transportKg = 0;
  // UE-transport regnes som SUBCONTRACTOR; egen transport som OWNED.
  const movements = await prisma.massMovement.findMany({
    where: {
      projectId: { in: projectIds },
      transportKm: { not: null },
      ...(filter.from || filter.to ? { createdAt: periode } : {}),
    },
    select: {
      projectId: true, transportKm: true, roundTrips: true,
      transportFuel: true, destinationOrgId: true, massType: true,
    },
  });
  for (const m of movements) {
    const ownership = m.destinationOrgId ? "SUBCONTRACTOR" : "OWNED";
    if (!ownerships.includes(ownership)) continue;
    const fuel = (m.transportFuel ?? "DIESEL") as string;
    const f = faktorer[fuel] ?? faktorer.DIESEL;
    const liter = (m.transportKm ?? 0) * (m.roundTrips ?? 1) * LITER_PER_KM;
    const kg = liter * f.kg;
    transportKg += kg;
    total += kg;
    byOwnership[ownership] = (byOwnership[ownership] ?? 0) + kg;
    byFuelType[fuel] = (byFuelType[fuel] ?? 0) + kg;
    const nr = projNr[m.projectId] ?? m.projectId;
    byProject[nr] = (byProject[nr] ?? 0) + kg;
    lines.push({
      key: "Massetransport (" + m.massType + ")",
      ownership,
      fuelType: fuel,
      amount: liter,
      unit: "liter",
      kgCo2e: kg,
    });
  }

  return {
    totalKgCo2e: total,
    byOwnership,
    byFuelType,
    byProject,
    transportKgCo2e: transportKg,
    lines: lines.sort((a, b) => b.kgCo2e - a.kgCo2e),
    factorsUsed: Object.fromEntries(Object.entries(faktorer).map(([k, v]) => [k, v.kg])),
  };
}
