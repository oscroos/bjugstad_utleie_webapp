export type ContractTypeValue = "NS_8405" | "NS_8406" | "NS_8407" | "NS_8417" | "OTHER";
export type ClientTypeValue = "PUBLIC" | "PRIVATE";
export type ProjectStatusValue = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
export type KpiMetricValue =
  | "MAX_CO2_KG"
  | "MAX_IDLE_PCT"
  | "MIN_ELECTRIC_PCT"
  | "MIN_HVO_PCT"
  | "MAX_DIESEL_LITERS"
  | "MIN_MASS_REUSE_PCT"
  | "CUSTOM";

export type ProjectDeviationLevel = "GREEN" | "YELLOW" | "RED";
export type ProjectKpiStatus = "OK" | "WARNING" | "BREACH" | "DATA_MISSING";

export type ProjectKpiInput = {
  id: string;
  metric: KpiMetricValue;
  label: string;
  targetValue: number;
  currentValue: number | null;
  unit: string;
  contractRef: string | null;
};

export type EvaluatedProjectKpi = ProjectKpiInput & {
  status: ProjectKpiStatus;
  statusLabel: string;
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatusValue, string> = {
  PLANNING: "Planlegging",
  ACTIVE: "Aktiv",
  ON_HOLD: "På vent",
  COMPLETED: "Ferdigstilt",
  ARCHIVED: "Arkivert",
};

export const CONTRACT_TYPE_LABELS: Record<ContractTypeValue, string> = {
  NS_8405: "NS 8405",
  NS_8406: "NS 8406",
  NS_8407: "NS 8407",
  NS_8417: "NS 8417",
  OTHER: "Annet",
};

export const CLIENT_TYPE_LABELS: Record<ClientTypeValue, string> = {
  PUBLIC: "Offentlig",
  PRIVATE: "Privat",
};

export const KPI_METRIC_OPTIONS: Array<{
  value: KpiMetricValue;
  label: string;
  defaultUnit: string;
  direction: "MAX" | "MIN";
}> = [
  { value: "MAX_CO2_KG", label: "Maks CO2", defaultUnit: "kg", direction: "MAX" },
  { value: "MAX_IDLE_PCT", label: "Maks tomgang", defaultUnit: "%", direction: "MAX" },
  { value: "MIN_ELECTRIC_PCT", label: "Min elektrisk andel", defaultUnit: "%", direction: "MIN" },
  { value: "MIN_HVO_PCT", label: "Min HVO-andel", defaultUnit: "%", direction: "MIN" },
  { value: "MAX_DIESEL_LITERS", label: "Maks diesel", defaultUnit: "liter", direction: "MAX" },
  { value: "MIN_MASS_REUSE_PCT", label: "Min massegjenbruk", defaultUnit: "%", direction: "MIN" },
  { value: "CUSTOM", label: "Egendefinert", defaultUnit: "", direction: "MAX" },
];

export const KPI_METRIC_LABELS = Object.fromEntries(
  KPI_METRIC_OPTIONS.map((option) => [option.value, option.label]),
) as Record<KpiMetricValue, string>;

export function evaluateProjectKpi(kpi: ProjectKpiInput): EvaluatedProjectKpi {
  if (kpi.currentValue === null || !Number.isFinite(kpi.currentValue)) {
    return { ...kpi, status: "DATA_MISSING", statusLabel: "Mangler data" };
  }

  const direction = KPI_METRIC_OPTIONS.find((option) => option.value === kpi.metric)?.direction ?? "MAX";
  const target = Number(kpi.targetValue);
  const current = Number(kpi.currentValue);

  if (!Number.isFinite(target) || !Number.isFinite(current)) {
    return { ...kpi, status: "DATA_MISSING", statusLabel: "Mangler data" };
  }

  if (direction === "MIN") {
    if (target <= 0) {
      return current >= target
        ? { ...kpi, status: "OK", statusLabel: "OK" }
        : { ...kpi, status: "BREACH", statusLabel: "Brudd" };
    }

    if (current >= target) return { ...kpi, status: "OK", statusLabel: "OK" };
    if (current >= target * 0.8) {
      return { ...kpi, status: "WARNING", statusLabel: "Nær grense" };
    }
    return { ...kpi, status: "BREACH", statusLabel: "Brudd" };
  }

  if (target <= 0) {
    return current <= target
      ? { ...kpi, status: "OK", statusLabel: "OK" }
      : { ...kpi, status: "BREACH", statusLabel: "Brudd" };
  }

  const ratio = current / target;
  if (ratio > 1) return { ...kpi, status: "BREACH", statusLabel: "Brudd" };
  if (ratio >= 0.9) return { ...kpi, status: "WARNING", statusLabel: "Nær grense" };
  return { ...kpi, status: "OK", statusLabel: "OK" };
}

export function summarizeProjectDeviations(kpis: EvaluatedProjectKpi[]): {
  level: ProjectDeviationLevel;
  label: string;
  issues: string[];
} {
  const breaches = kpis.filter((kpi) => kpi.status === "BREACH");
  const warnings = kpis.filter((kpi) => kpi.status === "WARNING");
  const missing = kpis.filter((kpi) => kpi.status === "DATA_MISSING");
  const issues: string[] = [];

  if (breaches.length) {
    issues.push(`Kontraktsmål brutt: ${breaches.map((kpi) => kpi.label).join(", ")}`);
  }
  if (warnings.length) {
    issues.push(`Kontraktsmål nær grense: ${warnings.map((kpi) => kpi.label).join(", ")}`);
  }
  if (missing.length) {
    issues.push(`Mangler måledata for ${missing.length} kontraktsmål`);
  }

  if (breaches.length) return { level: "RED", label: "Avvik", issues };
  if (warnings.length || missing.length) return { level: "YELLOW", label: "Oppfølging", issues };
  return { level: "GREEN", label: "OK", issues: [] };
}
