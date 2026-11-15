import { prisma } from "@/lib/prisma";
import { beregnCo2 } from "@/lib/miljo/co2";
import { beregnTomgang, beregnElektrifiseringsgrad } from "@/lib/flate/telemetri";

// Datadrevne kontraktsmål (Fremby-paritet): status beregnes live fra
// telemetri, lasslister og CO2-regnskapet.
export interface KpiStatus {
  id: string;
  label: string;
  metric: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  status: "OK" | "WARNING" | "BREACH";
  contractRef: string | null;
}

export async function evaluerKontraktsmaal(projectId: string, organizationId: string): Promise<KpiStatus[]> {
  const kpis = await prisma.contractKpi.findMany({ where: { projectId } });
  if (kpis.length === 0) return [];

  const [co2, idle, el] = await Promise.all([
    beregnCo2({ organizationId, projectId, scope: "ALL" }),
    beregnTomgang(projectId, []),
    beregnElektrifiseringsgrad(projectId, []),
  ]);
  const dieselLiters = await prisma.fuelUsage.aggregate({
    where: { projectId, fuelType: "DIESEL" }, _sum: { amount: true },
  });

  return kpis.map((k) => {
    let current = 0;
    let isMax = true; // true: lavere er bedre (maks-krav)
    switch (k.metric) {
      case "MAX_CO2_KG": current = co2.totalKgCo2e; break;
      case "MAX_IDLE_PCT": current = idle.idlePct; break;
      case "MIN_ELECTRIC_PCT": current = el.electricPct; isMax = false; break;
      case "MAX_DIESEL_LITERS": current = dieselLiters._sum.amount ?? 0; break;
      default: current = 0;
    }
    const ratio = k.targetValue > 0 ? current / k.targetValue : 0;
    const status: KpiStatus["status"] = isMax
      ? ratio > 1 ? "BREACH" : ratio >= 0.9 ? "WARNING" : "OK"
      : current >= k.targetValue ? "OK" : current >= k.targetValue * 0.8 ? "WARNING" : "BREACH";
    return {
      id: k.id, label: k.label, metric: k.metric, targetValue: k.targetValue,
      currentValue: Math.round(current * 10) / 10, unit: k.unit, status, contractRef: k.contractRef,
    };
  });
}
