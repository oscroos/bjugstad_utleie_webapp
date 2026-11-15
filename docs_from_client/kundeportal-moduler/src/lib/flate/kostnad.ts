import { prisma } from "@/lib/prisma";

// Automatisk kostnadsfordeling maskin → prosjekt (Fremby-paritet):
// timer × (finans + service) × (1 + påslag) + drivstoff × literpris + kWh × pris.
export interface MaskinKostnad {
  machineId: string;
  hours: number;
  fuelLiters: number;
  energyKwh: number;
  costNok: number;
}

export async function allokerKostnader(projectId: string, from?: Date, to?: Date) {
  const snaps = await prisma.telemetrySnapshot.findMany({
    where: {
      projectId,
      ...(from || to ? { periodStart: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
  });

  const perMaskin = new Map<string, { hours: number; fuel: number; kwh: number }>();
  for (const s of snaps) {
    const m = perMaskin.get(s.machineId) ?? { hours: 0, fuel: 0, kwh: 0 };
    m.hours += s.engineHours ?? 0;
    m.fuel += s.fuelLiters ?? 0;
    m.kwh += s.energyKwh ?? 0;
    perMaskin.set(s.machineId, m);
  }

  const machineIds = [...perMaskin.keys()];
  const profiles = await prisma.machineCostProfile.findMany({ where: { machineId: { in: machineIds } } });
  const profMap = new Map(profiles.map((p) => [p.machineId, p]));

  const result: MaskinKostnad[] = [];
  let total = 0;
  for (const [machineId, m] of perMaskin) {
    const p = profMap.get(machineId);
    const timekost = p ? (p.financeCostPerHour + p.serviceCostPerHour) * (1 + p.internalMarkupPct / 100) : 0;
    const cost = m.hours * timekost + m.fuel * (p?.fuelPricePerLiter ?? 0) + m.kwh * (p?.energyPricePerKwh ?? 0);
    total += cost;
    result.push({ machineId, hours: m.hours, fuelLiters: m.fuel, energyKwh: m.kwh, costNok: cost });
  }
  return { machines: result.sort((a, b) => b.costNok - a.costNok), totalNok: total };
}
