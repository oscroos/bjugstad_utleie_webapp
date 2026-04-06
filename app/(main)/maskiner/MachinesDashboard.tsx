"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { LinearGradient } from "@visx/gradient";
import { GridColumns, GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear, scalePoint } from "@visx/scale";
import { AreaClosed, Bar, LinePath } from "@visx/shape";
import { useTooltip } from "@visx/tooltip";
import {
  IconAdjustmentsHorizontal,
  IconArrowUpRight,
  IconBolt,
  IconBulldozer,
  IconCalendarEvent,
  IconChartAreaLine,
  IconCheck,
  IconClockHour4,
  IconLeaf,
  IconMinus,
  IconPlus,
} from "@tabler/icons-react";
import { getOEMLogo } from "@/lib/get_OEM_logo";

type PeriodKey = "14d" | "30d" | "12w" | "12m";
type AggregationKey = "day" | "week" | "month";
type MetricKey = "usageHours" | "energyKwh" | "co2Kg";
type AnalysisKey = "usage" | "energy" | "co2" | "contribution";

type MachineDefinition = {
  id: string;
  name: string;
  oem: string;
  category: string;
  project: string;
  location: string;
  activeAgreementId?: string;
  customerName?: string;
  status: "I drift" | "Lader" | "Standby" | "Service";
  powertrain: "Elektrisk" | "Hybrid" | "Diesel";
  accent: string;
  lat: number;
  lng: number;
  lastReportedAt: string;
  baseDailyHours: number;
  energyPerHour: number;
  co2PerKwh: number;
  idleRatio: number;
  weightTonnes: number;
  seed: number;
};

type Bucket = {
  key: string;
  label: string;
  compactLabel: string;
  start: Date;
  end: Date;
  bucketDays: number;
};

type SeriesPoint = Bucket & {
  usageHours: number;
  idleHours: number;
  energyKwh: number;
  co2Kg: number;
  electrifiedEnergyKwh: number;
};

type FleetSummary = {
  totalUsageHours: number;
  totalIdleHours: number;
  totalEnergyKwh: number;
  totalCo2Kg: number;
  avgUsageHours: number;
  avgEnergyKwh: number;
  avgCo2Kg: number;
  idleShare: number;
  electrificationRate: number;
  avoidedCo2Kg: number;
  peakUsageLabel: string;
  peakUsageHours: number;
  peakEnergyLabel: string;
  peakEnergyKwh: number;
  peakCo2Label: string;
  peakCo2Kg: number;
};

type MachineRow = {
  machine: MachineDefinition;
  summary: FleetSummary;
};

type MetricCardData = {
  metricKey: MetricKey;
  title: string;
  subtitle: string;
  color: string;
  series: SeriesPoint[];
  summaryLabel: string;
  summaryValue: string;
  footnotes: Array<{ label: string; value: string }>;
};

type TrendTooltipData = {
  point: SeriesPoint;
  value: number;
  metricKey: MetricKey;
  color: string;
};

type ContributionBarDatum = {
  id: string;
  label: string;
  shortLabel: string;
  subLabel: string;
  value: number;
  color: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const REFERENCE_DATE = new Date("2026-04-06T12:00:00+02:00");
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const TREND_CHART_HEIGHT = 320;
const TOOLTIP_STYLE: React.CSSProperties = {
  border: "1px solid rgba(226, 232, 240, 0.95)",
  borderRadius: "16px",
  background: "rgba(255, 255, 255, 0.96)",
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.12)",
  color: "#0F172A",
  padding: "10px 12px",
  backdropFilter: "blur(10px)",
  pointerEvents: "none",
};
const OEM_COLORS: Record<string, string> = {
  hydrema: "#000000",
  cat: "#F59E0B",
  volvo: "#2563EB",
  hitachi: "#F97316",
  jcb: "#8B5CF6",
  default: "#3B82F6",
};

const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string; days: number; hint: string }> = [
  { key: "14d", label: "Siste 14 dager", days: 14, hint: "Kort sikt" },
  { key: "30d", label: "Siste 30 dager", days: 30, hint: "Måned" },
  { key: "12w", label: "Siste 12 uker", days: 84, hint: "Standard" },
  { key: "12m", label: "Siste 12 måneder", days: 365, hint: "År" },
];

const AGGREGATION_OPTIONS: Array<{ key: AggregationKey; label: string; unitLabel: string }> = [
  { key: "day", label: "Dag", unitLabel: "per dag" },
  { key: "week", label: "Uke", unitLabel: "per uke" },
  { key: "month", label: "Måned", unitLabel: "per måned" },
];

const ANALYSIS_OPTIONS: Array<{ key: AnalysisKey; label: string }> = [
  { key: "usage", label: "Driftstimer" },
  { key: "energy", label: "Energibruk" },
  { key: "co2", label: "CO2-utslipp" },
  { key: "contribution", label: "Maskinbidrag" },
];

const CONTRIBUTION_METRIC_OPTIONS: Array<{
  key: MetricKey;
  label: string;
  activeClass: string;
}> = [
  {
    key: "usageHours",
    label: "Drift",
    activeClass: "border-emerald-600 bg-emerald-600 text-white shadow-sm",
  },
  {
    key: "energyKwh",
    label: "Energi",
    activeClass: "border-sky-600 bg-sky-600 text-white shadow-sm",
  },
  {
    key: "co2Kg",
    label: "CO2",
    activeClass: "border-amber-500 bg-amber-500 text-white shadow-sm",
  },
];

const DUMMY_MACHINES: MachineDefinition[] = [
  {
    id: "2353",
    name: "Cat 320 NGH Z-Line",
    oem: "CAT",
    category: "07 - Hjulgravemaskin",
    project: "Bekkestua ombygging",
    location: "Bekkestua",
    activeAgreementId: "A-10452",
    customerName: "Bekkestua Entreprenør AS",
    status: "I drift",
    powertrain: "Diesel",
    accent: "#2563EB",
    lat: 59.9179,
    lng: 10.5864,
    lastReportedAt: "2026-04-06T08:40:00+02:00",
    baseDailyHours: 5.2,
    energyPerHour: 34,
    co2PerKwh: 0.77,
    idleRatio: 0.16,
    weightTonnes: 24.8,
    seed: 1,
  },
  {
    id: "E-118",
    name: "Volvo ECR25 Electric",
    oem: "Volvo",
    category: "Minigraver",
    project: "Sentrum gaterigg",
    location: "Oslo sentrum",
    activeAgreementId: "A-10489",
    customerName: "Oslo Drift og Miljø",
    status: "Lader",
    powertrain: "Elektrisk",
    accent: "#10B981",
    lat: 59.9138,
    lng: 10.7463,
    lastReportedAt: "2026-04-06T08:18:00+02:00",
    baseDailyHours: 4.1,
    energyPerHour: 18,
    co2PerKwh: 0.06,
    idleRatio: 0.08,
    weightTonnes: 2.7,
    seed: 2,
  },
  {
    id: "HG-472",
    name: "Hydrema MX20 Rail",
    oem: "Hydrema",
    category: "Jernbanegraver",
    project: "Drammen sporfornyelse",
    location: "Drammen",
    activeAgreementId: "A-10217",
    customerName: "Bane Nord Prosjekt",
    status: "Standby",
    powertrain: "Diesel",
    accent: "#F97316",
    lat: 59.7441,
    lng: 10.2048,
    lastReportedAt: "2026-04-06T07:52:00+02:00",
    baseDailyHours: 3.9,
    energyPerHour: 29,
    co2PerKwh: 0.79,
    idleRatio: 0.2,
    weightTonnes: 21.5,
    seed: 3,
  },
  {
    id: "950-HY",
    name: "CAT 950 GC Hybrid",
    oem: "CAT",
    category: "Hjullaster",
    project: "Gardermoen logistikk",
    location: "Gardermoen",
    activeAgreementId: "A-10511",
    customerName: "Gardermoen Logistikkpark",
    status: "I drift",
    powertrain: "Hybrid",
    accent: "#0EA5E9",
    lat: 60.1943,
    lng: 11.1013,
    lastReportedAt: "2026-04-06T08:33:00+02:00",
    baseDailyHours: 6.0,
    energyPerHour: 26,
    co2PerKwh: 0.34,
    idleRatio: 0.11,
    weightTonnes: 18.1,
    seed: 4,
  },
  {
    id: "L120E",
    name: "Volvo L120 Electric",
    oem: "Volvo",
    category: "Hjullaster",
    project: "Gjenvinningshub Alna",
    location: "Alna",
    activeAgreementId: "A-10544",
    customerName: "Alna Gjenvinning",
    status: "I drift",
    powertrain: "Elektrisk",
    accent: "#14B8A6",
    lat: 59.9297,
    lng: 10.8361,
    lastReportedAt: "2026-04-06T08:28:00+02:00",
    baseDailyHours: 5.0,
    energyPerHour: 21,
    co2PerKwh: 0.05,
    idleRatio: 0.06,
    weightTonnes: 20.4,
    seed: 5,
  },
  {
    id: "ZW-330",
    name: "Hitachi ZX300-7",
    oem: "Hitachi",
    category: "Beltegraver",
    project: "Ring 1 sikring",
    location: "Oslo vest",
    status: "Service",
    powertrain: "Diesel",
    accent: "#F59E0B",
    lat: 59.9275,
    lng: 10.6739,
    lastReportedAt: "2026-04-06T06:42:00+02:00",
    baseDailyHours: 4.7,
    energyPerHour: 33,
    co2PerKwh: 0.8,
    idleRatio: 0.19,
    weightTonnes: 30.2,
    seed: 6,
  },
  {
    id: "TM-204",
    name: "JCB Telemaster 525-60E",
    oem: "JCB",
    category: "Teleskoplaster",
    project: "Lillestrøm depot",
    location: "Lillestrøm",
    activeAgreementId: "A-10398",
    customerName: "Lillestrøm Bygglogistikk",
    status: "I drift",
    powertrain: "Elektrisk",
    accent: "#8B5CF6",
    lat: 59.9551,
    lng: 11.0497,
    lastReportedAt: "2026-04-06T08:36:00+02:00",
    baseDailyHours: 4.4,
    energyPerHour: 15,
    co2PerKwh: 0.05,
    idleRatio: 0.05,
    weightTonnes: 5.2,
    seed: 7,
  },
];

const DEFAULT_SELECTION = ["2353", "950-HY", "L120E", "TM-204"];
const DEFAULT_ANALYSES: AnalysisKey[] = ["usage", "energy", "co2", "contribution"];

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatHours(value: number) {
  return `${formatNumber(value, value >= 100 ? 0 : 1)} t`;
}

function formatEnergy(value: number) {
  if (value >= 1000) return `${formatNumber(value / 1000, 1)} MWh`;
  return `${formatNumber(value, 0)} kWh`;
}

function formatCo2(value: number) {
  if (value >= 1000) return `${formatNumber(value / 1000, 1)} t CO2`;
  return `${formatNumber(value, 0)} kg CO2`;
}

function formatPercent(value: number, decimals = 1) {
  return `${formatNumber(value * 100, decimals)} %`;
}

function buildChangeLabel(current: number, previous: number) {
  if (previous <= 0 && current <= 0) return "Ingen endring mot forrige periode";
  if (previous <= 0) return "Ny aktivitet i perioden";
  const delta = ((current - previous) / previous) * 100;
  const direction = delta >= 0 ? "opp" : "ned";
  return `${formatNumber(Math.abs(delta), 1)} % ${direction} mot forrige periode`;
}

function getWeekNumber(date: Date) {
  const utcDate = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);
}

function formatBucketLabel(start: Date, end: Date, aggregationKey: AggregationKey) {
  if (aggregationKey === "day") {
    return new Intl.DateTimeFormat("nb-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(start);
  }

  if (aggregationKey === "week") {
    const shortFormatter = new Intl.DateTimeFormat("nb-NO", {
      day: "2-digit",
      month: "short",
    });
    return `${shortFormatter.format(start)} - ${shortFormatter.format(end)}`;
  }

  return new Intl.DateTimeFormat("nb-NO", {
    month: "long",
    year: "numeric",
  }).format(start);
}

function formatBucketCompactLabel(start: Date, end: Date, aggregationKey: AggregationKey) {
  if (aggregationKey === "day") {
    return new Intl.DateTimeFormat("nb-NO", {
      day: "numeric",
      month: "short",
    }).format(start);
  }

  if (aggregationKey === "week") return `Uke ${getWeekNumber(start)}`;

  return new Intl.DateTimeFormat("nb-NO", {
    month: "short",
  }).format(end);
}

function buildBuckets(
  periodKey: PeriodKey,
  aggregationKey: AggregationKey,
  windowShift: number,
): Bucket[] {
  const periodConfig =
    PERIOD_OPTIONS.find((option) => option.key === periodKey) ??
    PERIOD_OPTIONS[2];
  const totalDays = periodConfig.days;
  const bucketDays =
    aggregationKey === "day" ? 1 : aggregationKey === "week" ? 7 : 30;
  const bucketCount = Math.max(1, Math.ceil(totalDays / bucketDays));
  const shiftedEnd = endOfDay(addDays(REFERENCE_DATE, -(windowShift * totalDays)));
  const windowStart = startOfDay(addDays(shiftedEnd, -(totalDays - 1)));
  const buckets: Bucket[] = [];

  for (let index = 0; index < bucketCount; index += 1) {
    const start = startOfDay(addDays(windowStart, index * bucketDays));
    if (start.getTime() > shiftedEnd.getTime()) break;
    const end = endOfDay(
      new Date(
        Math.min(
          addDays(start, bucketDays - 1).getTime(),
          shiftedEnd.getTime(),
        ),
      ),
    );

    buckets.push({
      key: `${periodKey}-${aggregationKey}-${windowShift}-${index}`,
      label: formatBucketLabel(start, end, aggregationKey),
      compactLabel: formatBucketCompactLabel(start, end, aggregationKey),
      start,
      end,
      bucketDays:
        Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1),
    });
  }

  return buckets;
}

function buildSeriesPoint(machine: MachineDefinition, bucket: Bucket): SeriesPoint {
  const timeIndex = Math.floor(bucket.start.getTime() / DAY_MS);
  const seasonalLift =
    0.85 +
    0.16 * Math.sin(timeIndex / 5 + machine.seed * 0.7) +
    0.09 * Math.cos(timeIndex / 13 + machine.seed * 0.35);
  const projectPulse =
    0.94 + 0.12 * Math.sin(timeIndex / 23 + machine.seed * 1.2);
  const statusFactor =
    machine.status === "I drift"
      ? 1.08
      : machine.status === "Lader"
        ? 0.76
        : machine.status === "Standby"
          ? 0.68
          : 0.44;
  const dutyFactor = clamp(
    seasonalLift * projectPulse * statusFactor,
    0.24,
    1.4,
  );
  const usageHours = machine.baseDailyHours * bucket.bucketDays * dutyFactor;
  const idleRatio = clamp(
    machine.idleRatio + 0.03 * Math.sin(timeIndex / 9 + machine.seed),
    0.04,
    0.35,
  );
  const idleHours = usageHours * idleRatio;
  const operatingHours = usageHours + idleHours;
  const energyMultiplier =
    machine.powertrain === "Elektrisk"
      ? 0.92
      : machine.powertrain === "Hybrid"
        ? 1.01
        : 1.11;
  const energyKwh = operatingHours * machine.energyPerHour * energyMultiplier;
  const co2Kg = energyKwh * machine.co2PerKwh;
  const electrificationFactor =
    machine.powertrain === "Elektrisk"
      ? 1
      : machine.powertrain === "Hybrid"
        ? 0.56
        : 0.05;

  return {
    ...bucket,
    usageHours,
    idleHours,
    energyKwh,
    co2Kg,
    electrifiedEnergyKwh: energyKwh * electrificationFactor,
  };
}

function buildMachineSeries(machine: MachineDefinition, buckets: Bucket[]) {
  return buckets.map((bucket) => buildSeriesPoint(machine, bucket));
}

function buildFleetSeries(machines: MachineDefinition[], buckets: Bucket[]) {
  return buckets.map((bucket) => {
    const totals = machines.reduce(
      (accumulator, machine) => {
        const point = buildSeriesPoint(machine, bucket);
        accumulator.usageHours += point.usageHours;
        accumulator.idleHours += point.idleHours;
        accumulator.energyKwh += point.energyKwh;
        accumulator.co2Kg += point.co2Kg;
        accumulator.electrifiedEnergyKwh += point.electrifiedEnergyKwh;
        return accumulator;
      },
      {
        usageHours: 0,
        idleHours: 0,
        energyKwh: 0,
        co2Kg: 0,
        electrifiedEnergyKwh: 0,
      },
    );

    return {
      ...bucket,
      ...totals,
    };
  });
}

function summarizeSeries(series: SeriesPoint[]): FleetSummary {
  const totals = series.reduce(
    (accumulator, point) => {
      accumulator.totalUsageHours += point.usageHours;
      accumulator.totalIdleHours += point.idleHours;
      accumulator.totalEnergyKwh += point.energyKwh;
      accumulator.totalCo2Kg += point.co2Kg;
      accumulator.totalElectrifiedEnergyKwh += point.electrifiedEnergyKwh;

      if (point.usageHours > accumulator.peakUsageHours) {
        accumulator.peakUsageHours = point.usageHours;
        accumulator.peakUsageLabel = point.compactLabel;
      }
      if (point.energyKwh > accumulator.peakEnergyKwh) {
        accumulator.peakEnergyKwh = point.energyKwh;
        accumulator.peakEnergyLabel = point.compactLabel;
      }
      if (point.co2Kg > accumulator.peakCo2Kg) {
        accumulator.peakCo2Kg = point.co2Kg;
        accumulator.peakCo2Label = point.compactLabel;
      }

      return accumulator;
    },
    {
      totalUsageHours: 0,
      totalIdleHours: 0,
      totalEnergyKwh: 0,
      totalCo2Kg: 0,
      totalElectrifiedEnergyKwh: 0,
      peakUsageHours: 0,
      peakUsageLabel: "-",
      peakEnergyKwh: 0,
      peakEnergyLabel: "-",
      peakCo2Kg: 0,
      peakCo2Label: "-",
    },
  );

  const pointCount = Math.max(series.length, 1);
  const dieselReferenceCo2 = totals.totalEnergyKwh * 0.78;

  return {
    totalUsageHours: totals.totalUsageHours,
    totalIdleHours: totals.totalIdleHours,
    totalEnergyKwh: totals.totalEnergyKwh,
    totalCo2Kg: totals.totalCo2Kg,
    avgUsageHours: totals.totalUsageHours / pointCount,
    avgEnergyKwh: totals.totalEnergyKwh / pointCount,
    avgCo2Kg: totals.totalCo2Kg / pointCount,
    idleShare:
      totals.totalUsageHours > 0
        ? totals.totalIdleHours / totals.totalUsageHours
        : 0,
    electrificationRate:
      totals.totalEnergyKwh > 0
        ? totals.totalElectrifiedEnergyKwh / totals.totalEnergyKwh
        : 0,
    avoidedCo2Kg: Math.max(dieselReferenceCo2 - totals.totalCo2Kg, 0),
    peakUsageLabel: totals.peakUsageLabel,
    peakUsageHours: totals.peakUsageHours,
    peakEnergyLabel: totals.peakEnergyLabel,
    peakEnergyKwh: totals.peakEnergyKwh,
    peakCo2Label: totals.peakCo2Label,
    peakCo2Kg: totals.peakCo2Kg,
  };
}

function buildMachineRows(machines: MachineDefinition[], buckets: Bucket[]): MachineRow[] {
  return machines.map((machine) => ({
    machine,
    summary: summarizeSeries(buildMachineSeries(machine, buckets)),
  }));
}

function formatAxisMetric(metricKey: MetricKey, value: number) {
  if (metricKey === "usageHours") {
    return `${formatNumber(value, value >= 10 ? 0 : 1)} t`;
  }
  if (metricKey === "energyKwh") {
    if (value >= 1000) return `${formatNumber(value / 1000, 1)} MWh`;
    return `${formatNumber(value, 0)} kWh`;
  }
  return `${formatNumber(value, value >= 100 ? 0 : 1)} kg`;
}

function getPointMetricValue(point: SeriesPoint, metricKey: MetricKey) {
  return point[metricKey];
}

function getSummaryMetricValue(summary: FleetSummary, metricKey: MetricKey) {
  if (metricKey === "usageHours") return summary.totalUsageHours;
  if (metricKey === "energyKwh") return summary.totalEnergyKwh;
  return summary.totalCo2Kg;
}

function formatMetricValue(metricKey: MetricKey, value: number) {
  if (metricKey === "usageHours") return formatHours(value);
  if (metricKey === "energyKwh") return formatEnergy(value);
  return formatCo2(value);
}

function truncateLabel(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function getRelativePointerPosition(
  event: React.PointerEvent<SVGElement>,
  container: HTMLDivElement | null,
) {
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function buildMetricCardData(
  metricKey: MetricKey,
  series: SeriesPoint[],
  summary: FleetSummary,
  previousSummary: FleetSummary,
  aggregationLabel: string,
): MetricCardData {
  if (metricKey === "usageHours") {
    return {
      metricKey,
      title: "Driftstimer",
      subtitle: `Driftstimer inkludert tomgang ${aggregationLabel}.`,
      color: "#10B981",
      series,
      summaryLabel: "Peak",
      summaryValue: `${formatHours(summary.peakUsageHours)} • ${summary.peakUsageLabel}`,
      footnotes: [
        { label: "Totalt", value: formatHours(summary.totalUsageHours) },
        { label: "Snitt", value: formatHours(summary.avgUsageHours) },
        { label: "Tomgangsandel", value: formatPercent(summary.idleShare, 0) },
      ],
    };
  }

  if (metricKey === "energyKwh") {
    return {
      metricKey,
      title: "Energiforbruk",
      subtitle: `Samlet energibruk ${aggregationLabel} for valgte maskiner.`,
      color: "#0EA5E9",
      series,
      summaryLabel: "Peak",
      summaryValue: `${formatEnergy(summary.peakEnergyKwh)} • ${summary.peakEnergyLabel}`,
      footnotes: [
        { label: "Totalt", value: formatEnergy(summary.totalEnergyKwh) },
        { label: "Snitt", value: formatEnergy(summary.avgEnergyKwh) },
        {
          label: "Mot forrige",
          value: buildChangeLabel(
            summary.totalEnergyKwh,
            previousSummary.totalEnergyKwh,
          ),
        },
      ],
    };
  }

  return {
    metricKey,
    title: "CO2-utslipp",
    subtitle: `Estimert klimabelastning ${aggregationLabel} basert på dummydata.`,
    color: "#F59E0B",
    series,
    summaryLabel: "Peak",
    summaryValue: `${formatCo2(summary.peakCo2Kg)} • ${summary.peakCo2Label}`,
    footnotes: [
      { label: "Totalt", value: formatCo2(summary.totalCo2Kg) },
      { label: "Snitt", value: formatCo2(summary.avgCo2Kg) },
      { label: "Unngått", value: formatCo2(summary.avoidedCo2Kg) },
    ],
  };
}

function ControlBlock({
  icon,
  label,
  helper,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  helper: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-white/60 bg-white/90 p-4 shadow-sm backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-slate-100 p-2">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SegmentedSelector<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={`cursor-pointer rounded-full px-3.5 py-2 text-sm font-semibold transition ${
              active
                ? "border border-slate-900 bg-slate-900 text-white shadow-sm"
                : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function MiniInsight({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold text-slate-700">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function MultiSelectPills<T extends string>({
  options,
  value,
  onToggle,
}: {
  options: Array<{ key: T; label: string }>;
  value: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = value.includes(option.key);
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onToggle(option.key)}
            className={`cursor-pointer rounded-full px-3.5 py-2 text-sm font-semibold transition ${
              active
                ? "border border-slate-900 bg-slate-900 text-white shadow-sm"
                : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  helper,
  accentClass,
  iconWrapClass,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  value: string;
  helper: string;
  accentClass: string;
  iconWrapClass: string;
}) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className={`h-1.5 ${accentClass}`} />
      <div className="space-y-2 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className={`shrink-0 rounded-2xl p-2 ${iconWrapClass}`}>{icon}</div>
          <p className="min-w-0 text-xs font-semibold uppercase leading-[1.25] tracking-[0.18em] text-slate-500">
            {label}
          </p>
        </div>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{helper}</p>
      </div>
    </section>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function StatusBadge({
  status,
  inverted = false,
}: {
  status: MachineDefinition["status"];
  inverted?: boolean;
}) {
  const tones = {
    "I drift": inverted
      ? "bg-emerald-400/20 text-emerald-100"
      : "bg-emerald-50 text-emerald-700",
    Lader: inverted
      ? "bg-blue-400/20 text-blue-100"
      : "bg-blue-50 text-blue-700",
    Standby: inverted
      ? "bg-amber-400/20 text-amber-100"
      : "bg-amber-50 text-amber-700",
    Service: inverted
      ? "bg-rose-400/20 text-rose-100"
      : "bg-rose-50 text-rose-700",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[status]}`}
    >
      {status}
    </span>
  );
}

function Tag({ label, inverted = false }: { label: string; inverted?: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        inverted ? "bg-white/12 text-slate-100" : "bg-slate-100 text-slate-600"
      }`}
    >
      {label}
    </span>
  );
}

function MachineRowOemLogo({
  oem,
  selected,
}: {
  oem: string;
  selected: boolean;
}) {
  const logoSrc = getOEMLogo(oem);

  return (
    <div
      className={`flex h-9 w-12 shrink-0 items-center justify-center rounded-xl border ${
        selected
          ? "border-slate-200 bg-white"
          : "border-slate-200 bg-white/80 grayscale-[0.2]"
      }`}
    >
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={`${oem} logo`}
          className="max-h-5 w-auto max-w-[2.2rem] object-contain"
        />
      ) : (
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {oem.slice(0, 3)}
        </span>
      )}
    </div>
  );
}

function MachineRowMetric({
  label,
  value,
  selected,
}: {
  label: string;
  value: string;
  selected: boolean;
}) {
  return (
    <div
      className={`flex h-[3.05rem] w-[7.4rem] shrink-0 flex-col justify-center rounded-xl px-2.5 py-1.5 ${
        selected
          ? "bg-slate-100 text-slate-700"
          : "bg-white/80 text-slate-500"
      }`}
    >
      <p className="text-[10px] uppercase tracking-[0.16em] opacity-70">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function SelectedMachinesMiniMap({
  machines,
  blurred = false,
}: {
  machines: MachineDefinition[];
  blurred?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const styleUrl = MAPTILER_KEY
      ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
      : "https://demotiles.maplibre.org/style.json";

    const viewportMachines = machines.length > 0 ? machines : DUMMY_MACHINES;
    const firstMachine = viewportMachines[0];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [firstMachine.lng, firstMachine.lat],
      zoom: viewportMachines.length > 1 ? 9.4 : 11.5,
      attributionControl: false,
      hash: false,
      pitchWithRotate: false,
      dragRotate: false,
    });
    mapRef.current = map;

    map.scrollZoom.disable();
    map.boxZoom.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disableRotation();

    const bounds = new maplibregl.LngLatBounds(
      [firstMachine.lng, firstMachine.lat],
      [firstMachine.lng, firstMachine.lat],
    );

    viewportMachines.forEach((machine) => {
      bounds.extend([machine.lng, machine.lat]);
    });

    const markers = machines.map((machine) => {
      const markerEl = document.createElement("div");
      const markerColor = getOemColor(machine.oem, machine.accent);
      Object.assign(markerEl.style, {
        width: "16px",
        height: "16px",
        borderRadius: "9999px",
        background: markerColor,
        border: "2px solid #F8FAFC",
        boxShadow: "0 3px 8px rgba(15, 23, 42, 0.15)",
      });

      const marker = new maplibregl.Marker({
        element: markerEl,
        anchor: "bottom",
      })
        .setLngLat([machine.lng, machine.lat])
        .addTo(map);

      const popupContent = buildDummyMiniPopupContent(machine);
      const popup = new maplibregl.Popup({
        offset: 12,
        closeButton: false,
        closeOnClick: false,
        className: "machine-popup",
        focusAfterOpen: false,
      });

      popup.setDOMContent(popupContent);
      marker.setPopup(popup);

      popupContent
        .querySelector<HTMLButtonElement>("[data-popup-close]")
        ?.addEventListener("click", () => popup.remove());

      return marker;
    });

    if (viewportMachines.length > 1) {
      map.fitBounds(bounds, {
        padding: { top: 56, right: 56, bottom: 56, left: 56 },
        maxZoom: 11.5,
        duration: 0,
      });
    }

    return () => {
      markers.forEach((marker) => marker.remove());
      map.remove();
      mapRef.current = null;
    };
  }, [machines]);

  const zoomIn = () => {
    mapRef.current?.zoomIn({ duration: 200 });
  };

  const zoomOut = () => {
    mapRef.current?.zoomOut({ duration: 200 });
  };

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className={`h-full w-full transition duration-300 ${
          blurred ? "scale-[1.01] blur-[2px]" : ""
        }`}
      />
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button
          type="button"
          onClick={zoomIn}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          aria-label="Zoom inn"
        >
          <IconPlus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={zoomOut}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          aria-label="Zoom ut"
        >
          <IconMinus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function getOemColor(oemName?: string | null, fallback?: string) {
  if (!oemName) return fallback ?? OEM_COLORS.default;
  const key = oemName.trim().toLowerCase();
  return OEM_COLORS[key] ?? fallback ?? OEM_COLORS.default;
}

function escapeHtml(value: string) {
  const characters: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return value.replace(/[&<>"']/g, (character) => characters[character]);
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} kl. ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatPopupValue(value?: string | number | null) {
  if (value === null || value === undefined) return "-";
  const text = String(value).trim();
  return text.length ? text : "-";
}

function buildDummyMiniPopupContent(machine: MachineDefinition) {
  const container = document.createElement("div");
  const categoryValue = formatPopupValue(machine.category);
  const agreementValue = formatPopupValue(machine.activeAgreementId);
  const renterValue = formatPopupValue(machine.customerName);
  const lastSeenValue = formatPopupValue(formatDateTime(machine.lastReportedAt));
  const categoryTone = categoryValue === "-" ? "text-slate-400 font-medium" : "text-slate-900 font-semibold";
  const renterTone = renterValue === "-" ? "text-slate-400 font-medium" : "text-slate-900 font-semibold";
  const lastSeenTone = lastSeenValue === "-" ? "text-slate-400 font-medium" : "text-slate-900 font-semibold";
  const logoSrc = getOEMLogo(machine.oem);
  const agreementMarkup =
    agreementValue === "-"
      ? `<div class="mt-0.5 text-[11px] font-medium text-slate-400">-</div>`
      : `
          <div class="mt-0.5 inline-flex max-w-full items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
            <span class="truncate">${escapeHtml(agreementValue)}</span>
          </div>
        `;
  const logoMarkup = logoSrc
    ? `<img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(machine.oem)} logo" class="max-h-8 w-auto object-contain" />`
    : `<span class="text-[10px] font-semibold text-slate-400">OEM</span>`;

  container.className = "min-w-[260px] max-w-[320px]";
  container.innerHTML = `
    <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
      <div class="flex items-start justify-between gap-2 border-b border-slate-100 px-2.5 py-2">
        <div class="flex min-w-0 items-stretch gap-2">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-0.5">
            ${logoMarkup}
          </div>
          <div class="min-w-0">
            <div class="truncate text-[13px] font-semibold text-slate-900">${escapeHtml(machine.name)}</div>
            <div class="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              ID: ${escapeHtml(machine.id)}
            </div>
          </div>
        </div>
        <button
          type="button"
          data-popup-close
          class="cursor-pointer rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Lukk"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
      </div>
      <div class="space-y-2 px-2.5 py-2.5">
        <div class="grid grid-cols-2 gap-1.5">
          <div class="min-h-[52px] rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
            <div class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Kategori</div>
            <div class="mt-0.5 text-[11px] ${categoryTone}">${escapeHtml(categoryValue)}</div>
          </div>
          <div class="min-h-[52px] rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
            <div class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Aktiv avtale</div>
            <div class="mt-0.5">
              ${agreementMarkup}
            </div>
          </div>
          <div class="min-h-[52px] rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
            <div class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Leietaker</div>
            <div class="mt-0.5 text-[11px] ${renterTone}">${escapeHtml(renterValue)}</div>
          </div>
          <div class="min-h-[52px] rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
            <div class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Sist sett</div>
            <div class="mt-0.5 text-[11px] ${lastSeenTone}">${escapeHtml(lastSeenValue)}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  return container;
}

function MetricTrendPlot({
  metricKey,
  color,
  series,
  title,
}: Pick<MetricCardData, "metricKey" | "color" | "series" | "title">) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const {
    tooltipOpen,
    tooltipData,
    tooltipLeft,
    tooltipTop,
    showTooltip,
    hideTooltip,
  } = useTooltip<TrendTooltipData>();

  return (
    <div
      ref={chartContainerRef}
      className="relative h-[20rem] w-full"
    >
      <ParentSize>
        {({ width }) => {
          if (width <= 0 || series.length === 0) return null;

          const height = TREND_CHART_HEIGHT;
          const margin = { top: 18, right: 22, bottom: 34, left: 58 };
          const innerWidth = Math.max(width - margin.left - margin.right, 1);
          const innerHeight = Math.max(height - margin.top - margin.bottom, 1);
          const values = series.map((point) => getPointMetricValue(point, metricKey));
          const domainMax = Math.max(...values, 1);
          const average =
            values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
          const xScale = scalePoint<string>({
            domain: series.map((point) => point.key),
            range: [0, innerWidth],
            padding: 0.42,
          });
          const yScale = scaleLinear<number>({
            domain: [0, domainMax * 1.1],
            range: [innerHeight, 0],
            nice: true,
          });
          const labelStep = Math.max(1, Math.ceil(series.length / 6));
          const tickKeys = series
            .filter((_, index) => index % labelStep === 0 || index === series.length - 1)
            .map((point) => point.key);
          const xLookup = new Map(series.map((point) => [point.key, point.compactLabel]));
          const plottedPoints = series.map((point) => {
            const value = getPointMetricValue(point, metricKey);
            return {
              point,
              value,
              x: xScale(point.key) ?? 0,
              y: yScale(value),
            };
          });
          const activePoint = tooltipData?.point ?? series[series.length - 1];
          const activeValue = tooltipData?.value ?? getPointMetricValue(activePoint, metricKey);
          const activeX = xScale(activePoint.key) ?? 0;
          const activeY = yScale(activeValue);

          return (
            <>
              <svg width={width} height={height} role="img" aria-label={title}>
                <LinearGradient
                  id={`trend-fill-${metricKey}`}
                  from={color}
                  to={color}
                  fromOpacity={0.28}
                  toOpacity={0.03}
                />

                <Group left={margin.left} top={margin.top}>
                  <GridRows
                    scale={yScale}
                    width={innerWidth}
                    stroke="rgba(148,163,184,0.2)"
                    strokeDasharray="3 5"
                    numTicks={4}
                  />
                  <GridColumns
                    scale={xScale}
                    height={innerHeight}
                    tickValues={tickKeys}
                    stroke="rgba(148,163,184,0.1)"
                  />

                  <line
                    x1={0}
                    x2={innerWidth}
                    y1={yScale(average)}
                    y2={yScale(average)}
                    stroke={color}
                    strokeOpacity={0.24}
                    strokeDasharray="7 7"
                  />

                  <AreaClosed<SeriesPoint>
                    data={series}
                    x={(point) => xScale(point.key) ?? 0}
                    y={(point) => yScale(getPointMetricValue(point, metricKey))}
                    yScale={yScale}
                    fill={`url(#trend-fill-${metricKey})`}
                  />
                  <LinePath<SeriesPoint>
                    data={series}
                    x={(point) => xScale(point.key) ?? 0}
                    y={(point) => yScale(getPointMetricValue(point, metricKey))}
                    stroke={color}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  <rect
                    x={0}
                    y={0}
                    width={innerWidth}
                    height={innerHeight}
                    fill="transparent"
                    onPointerLeave={hideTooltip}
                    onPointerMove={(event) => {
                      const coords = getRelativePointerPosition(
                        event,
                        chartContainerRef.current,
                      );
                      if (!coords) return;

                      const chartX = Math.max(
                        0,
                        Math.min(coords.x - margin.left, innerWidth),
                      );
                      const nearest = plottedPoints.reduce((best, candidate) =>
                        Math.abs(candidate.x - chartX) < Math.abs(best.x - chartX)
                          ? candidate
                          : best,
                      );

                      showTooltip({
                        tooltipData: {
                          point: nearest.point,
                          value: nearest.value,
                          metricKey,
                          color,
                        },
                        tooltipLeft: coords.x,
                        tooltipTop: coords.y,
                      });
                    }}
                  />

                  <circle
                    cx={activeX}
                    cy={activeY}
                    r={11}
                    fill={color}
                    fillOpacity={0.12}
                    pointerEvents="none"
                  />
                  <circle
                    cx={activeX}
                    cy={activeY}
                    r={5.5}
                    fill={color}
                    stroke="#FFFFFF"
                    strokeWidth={3}
                    pointerEvents="none"
                  />
                </Group>

                <AxisLeft
                  left={margin.left}
                  top={margin.top}
                  scale={yScale}
                  numTicks={4}
                  hideAxisLine
                  hideTicks
                  tickFormat={(value) => formatAxisMetric(metricKey, Number(value))}
                  tickLabelProps={() => ({
                    fill: "#64748B",
                    fontSize: 11,
                    fontWeight: 600,
                    textAnchor: "end",
                    dx: "-0.5em",
                    dy: "0.33em",
                  })}
                />
                <AxisBottom
                  left={margin.left}
                  top={margin.top + innerHeight}
                  scale={xScale}
                  tickValues={tickKeys}
                  hideAxisLine
                  hideTicks
                  tickFormat={(value) => xLookup.get(String(value)) ?? ""}
                  tickLabelProps={() => ({
                    fill: "#64748B",
                    fontSize: 11,
                    fontWeight: 600,
                    textAnchor: "middle",
                  })}
                />
              </svg>

              {tooltipOpen &&
              tooltipData &&
              tooltipLeft !== undefined &&
              tooltipTop !== undefined ? (
                <div className="pointer-events-none absolute inset-0 z-20">
                  <div
                    style={{
                      ...TOOLTIP_STYLE,
                      position: "absolute",
                      left: clamp(tooltipLeft + 14, 12, Math.max(width - 168, 12)),
                      top: clamp(tooltipTop - 58, 12, TREND_CHART_HEIGHT - 74),
                    }}
                  >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {tooltipData.point.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatMetricValue(metricKey, tooltipData.value)}
                  </p>
                  </div>
                </div>
              ) : null}
            </>
          );
        }}
      </ParentSize>
    </div>
  );
}

function MetricTrendCard({
  metricKey,
  title,
  subtitle,
  color,
  series,
  summaryLabel,
  summaryValue,
  footnotes,
}: MetricCardData) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
            <IconArrowUpRight className="h-4 w-4 text-slate-500" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                {summaryLabel}
              </p>
              <p className="text-sm font-semibold text-slate-900">{summaryValue}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-5">
        <MetricTrendPlot
          metricKey={metricKey}
          color={color}
          series={series}
          title={title}
        />

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {footnotes.map((item) => (
            <div
              key={`${title}-${item.label}`}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {item.label}
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContributionBarChart({
  data,
  metricKey,
}: {
  data: ContributionBarDatum[];
  metricKey: MetricKey;
}) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const {
    tooltipOpen,
    tooltipData,
    tooltipLeft,
    tooltipTop,
    showTooltip,
    hideTooltip,
  } = useTooltip<ContributionBarDatum>();
  const chartHeight = Math.max(280, data.length * 42 + 52);

  return (
    <div ref={chartContainerRef} className="relative w-full" style={{ height: chartHeight }}>
      <ParentSize>
        {({ width }) => {
          if (width <= 0 || data.length === 0) return null;

          const height = chartHeight;
          const margin = { top: 16, right: 34, bottom: 34, left: 150 };
          const innerWidth = Math.max(width - margin.left - margin.right, 1);
          const innerHeight = Math.max(height - margin.top - margin.bottom, 1);
          const xScale = scaleLinear<number>({
            domain: [0, Math.max(...data.map((item) => item.value), 1) * 1.12],
            range: [0, innerWidth],
            nice: true,
          });
          const yScale = scaleBand<string>({
            domain: data.map((item) => item.id),
            range: [0, innerHeight],
            padding: 0.26,
          });

          return (
            <>
              <svg width={width} height={height} role="img" aria-label="Maskinbidrag">
                <Group left={margin.left} top={margin.top}>
                  <GridColumns
                    scale={xScale}
                    height={innerHeight}
                    numTicks={4}
                    stroke="rgba(148,163,184,0.16)"
                    strokeDasharray="3 5"
                  />

                  {data.map((item) => {
                    const y = yScale(item.id);
                    const barWidth = xScale(item.value);
                    if (y === undefined) return null;

                    return (
                      <g key={`${metricKey}-${item.id}`}>
                        <Bar
                          x={0}
                          y={y}
                          width={barWidth}
                          height={yScale.bandwidth()}
                          rx={10}
                          fill={item.color}
                          fillOpacity={0.9}
                          onPointerLeave={hideTooltip}
                          onPointerMove={(event) => {
                            const coords = getRelativePointerPosition(
                              event,
                              chartContainerRef.current,
                            );
                            if (!coords) return;

                            showTooltip({
                              tooltipData: item,
                              tooltipLeft: coords.x,
                              tooltipTop: coords.y,
                            });
                          }}
                        />
                        <text
                          x={Math.min(barWidth + 10, innerWidth - 4)}
                          y={y + yScale.bandwidth() / 2}
                          fill="#0F172A"
                          fontSize="12"
                          fontWeight="700"
                          dominantBaseline="middle"
                        >
                          {formatMetricValue(metricKey, item.value)}
                        </text>
                      </g>
                    );
                  })}
                </Group>

                <AxisLeft
                  left={margin.left}
                  top={margin.top}
                  scale={yScale}
                  hideAxisLine
                  hideTicks
                  tickFormat={(value) => {
                    const match = data.find((item) => item.id === String(value));
                    return match ? truncateLabel(match.shortLabel, 18) : "";
                  }}
                  tickLabelProps={() => ({
                    fill: "#334155",
                    fontSize: 11,
                    fontWeight: 700,
                    textAnchor: "end",
                    dx: "-0.6em",
                    dy: "0.33em",
                  })}
                />
                <AxisBottom
                  left={margin.left}
                  top={margin.top + innerHeight}
                  scale={xScale}
                  numTicks={4}
                  hideAxisLine
                  hideTicks
                  tickFormat={(value) => formatAxisMetric(metricKey, Number(value))}
                  tickLabelProps={() => ({
                    fill: "#64748B",
                    fontSize: 11,
                    fontWeight: 600,
                    textAnchor: "middle",
                  })}
                />
              </svg>

              {tooltipOpen &&
              tooltipData &&
              tooltipLeft !== undefined &&
              tooltipTop !== undefined ? (
                <div className="pointer-events-none absolute inset-0 z-20">
                  <div
                    style={{
                      ...TOOLTIP_STYLE,
                      position: "absolute",
                      left: clamp(tooltipLeft + 14, 12, Math.max(width - 216, 12)),
                      top: clamp(tooltipTop - 28, 12, chartHeight - 88),
                    }}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {tooltipData.label}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {formatMetricValue(metricKey, tooltipData.value)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{tooltipData.subLabel}</p>
                  </div>
                </div>
              ) : null}
            </>
          );
        }}
      </ParentSize>
    </div>
  );
}

function MachineContributionCard({
  rows,
  totalUsageHours,
  totalEnergyKwh,
  totalCo2Kg,
}: {
  rows: MachineRow[];
  totalUsageHours: number;
  totalEnergyKwh: number;
  totalCo2Kg: number;
}) {
  const [metricKey, setMetricKey] = useState<MetricKey>("usageHours");
  const sortedRows = [...rows].sort(
    (a, b) =>
      getSummaryMetricValue(b.summary, metricKey) -
      getSummaryMetricValue(a.summary, metricKey),
  );
  const totalValue =
    metricKey === "usageHours"
      ? totalUsageHours
      : metricKey === "energyKwh"
        ? totalEnergyKwh
        : totalCo2Kg;
  const topRow = sortedRows[0];
  const averageValue = rows.length > 0 ? totalValue / rows.length : 0;
  const chartData: ContributionBarDatum[] = sortedRows.map((row) => ({
    id: row.machine.id,
    label: row.machine.name,
    shortLabel: row.machine.name,
    subLabel: `${row.machine.category} • ${row.machine.location}`,
    value: getSummaryMetricValue(row.summary, metricKey),
    color:
      metricKey === "usageHours"
        ? row.machine.accent
        : metricKey === "energyKwh"
          ? "#0EA5E9"
          : "#F59E0B",
  }));

  return (
    <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Maskinbidrag</h2>
            <p className="mt-1 text-sm text-slate-600">
              Forslag til bar-chart-stil for å sammenligne valgte maskiner.
            </p>
          </div>

          {topRow ? (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
              <IconArrowUpRight className="h-4 w-4 text-slate-500" />
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                  Størst bidrag
                </p>
                <p className="text-sm font-semibold text-slate-900">
                  {topRow.machine.name}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {CONTRIBUTION_METRIC_OPTIONS.map((option) => {
            const active = option.key === metricKey;

            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setMetricKey(option.key)}
                className={`cursor-pointer rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                  active
                    ? option.activeClass
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-5">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-16 text-center">
            <p className="text-sm font-semibold text-slate-700">
              Velg maskiner for å se bidragsbildet.
            </p>
          </div>
        ) : (
          <>
            <ContributionBarChart data={chartData} metricKey={metricKey} />

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Total
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {formatMetricValue(metricKey, totalValue)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Snitt per maskin
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {formatMetricValue(metricKey, averageValue)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Visning
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {rows.length} maskiner
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default function MachinesDashboard() {
  const [period, setPeriod] = useState<PeriodKey>("12w");
  const [aggregation, setAggregation] = useState<AggregationKey>("week");
  const [selectedMachineIds, setSelectedMachineIds] =
    useState<string[]>(DEFAULT_SELECTION);
  const [selectedAnalyses, setSelectedAnalyses] =
    useState<AnalysisKey[]>(DEFAULT_ANALYSES);

  const buckets = buildBuckets(period, aggregation, 0);
  const previousBuckets = buildBuckets(period, aggregation, 1);
  const allMachines = DUMMY_MACHINES;
  const selectedMachines = allMachines.filter((machine) =>
    selectedMachineIds.includes(machine.id),
  );
  const currentSeries = buildFleetSeries(selectedMachines, buckets);
  const previousSeries = buildFleetSeries(selectedMachines, previousBuckets);
  const summary = summarizeSeries(currentSeries);
  const previousSummary = summarizeSeries(previousSeries);
  const filteredMachineRows = buildMachineRows(allMachines, buckets).sort((a, b) => {
    const aSelected = selectedMachineIds.includes(a.machine.id) ? 1 : 0;
    const bSelected = selectedMachineIds.includes(b.machine.id) ? 1 : 0;
    if (aSelected !== bSelected) return bSelected - aSelected;
    return b.summary.totalUsageHours - a.summary.totalUsageHours;
  });

  const selectedMachineRows = buildMachineRows(selectedMachines, buckets).sort(
    (a, b) => b.summary.totalUsageHours - a.summary.totalUsageHours,
  );
  const selectedMachineCount = selectedMachines.length;
  const aggregationLabel =
    AGGREGATION_OPTIONS.find((option) => option.key === aggregation)
      ?.unitLabel ?? "per uke";

  const usageMetric = buildMetricCardData(
    "usageHours",
    currentSeries,
    summary,
    previousSummary,
    aggregationLabel,
  );
  const energyMetric = buildMetricCardData(
    "energyKwh",
    currentSeries,
    summary,
    previousSummary,
    aggregationLabel,
  );
  const co2Metric = buildMetricCardData(
    "co2Kg",
    currentSeries,
    summary,
    previousSummary,
    aggregationLabel,
  );

  const toggleAnalysis = (analysisKey: AnalysisKey) => {
    setSelectedAnalyses((prev) =>
      prev.includes(analysisKey)
        ? prev.filter((key) => key !== analysisKey)
        : [...prev, analysisKey],
    );
  };

  const dashboardCards: React.ReactNode[] = [];
  if (selectedAnalyses.includes("usage")) {
    dashboardCards.push(<MetricTrendCard key="usage" {...usageMetric} />);
  }
  if (selectedAnalyses.includes("energy")) {
    dashboardCards.push(<MetricTrendCard key="energy" {...energyMetric} />);
  }
  if (selectedAnalyses.includes("co2")) {
    dashboardCards.push(<MetricTrendCard key="co2" {...co2Metric} />);
  }
  if (selectedAnalyses.includes("contribution")) {
    dashboardCards.push(
      <MachineContributionCard
        key="contribution"
        rows={selectedMachineRows}
        totalUsageHours={summary.totalUsageHours}
        totalEnergyKwh={summary.totalEnergyKwh}
        totalCo2Kg={summary.totalCo2Kg}
      />,
    );
  }

  return (
    <div className="space-y-6">
      <SectionDivider label="Input" />

      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <section className="rounded-[26px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Maskinutvalg
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                Maskiner brukt i beregningene
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Velg maskiner som skal styre kartet og grafene under.
              </p>
            </div>
          </div>

          <div className="px-4 py-4">
            <div className="h-[22rem] overflow-y-auto pr-1">
              <div className="space-y-2.5">
                {filteredMachineRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                    <p className="text-sm font-semibold text-slate-700">
                      Ingen maskiner tilgjengelig.
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Ingen maskiner tilgjengelig i denne prototypen.
                    </p>
                  </div>
                ) : (
                  filteredMachineRows.map((row) => {
                    const selected = selectedMachineIds.includes(row.machine.id);
                    return (
                      <div
                        key={row.machine.id}
                        className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                          selected
                            ? "border-slate-200 bg-white text-slate-900 shadow-sm"
                            : "border-slate-200 bg-slate-50/75 text-slate-500 hover:border-slate-300 hover:bg-slate-100/75"
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <button
                            type="button"
                            aria-label={
                              selected
                                ? `Fjern ${row.machine.name} fra utvalget`
                                : `Legg til ${row.machine.name} i utvalget`
                            }
                            onClick={() =>
                              setSelectedMachineIds((prev) =>
                                prev.includes(row.machine.id)
                                  ? prev.filter((id) => id !== row.machine.id)
                                  : [...prev, row.machine.id],
                              )
                            }
                            className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md border transition ${
                              selected
                                ? "border-emerald-200 bg-emerald-500 text-white"
                                : "border-slate-300 bg-white text-transparent"
                            }`}
                          >
                            <IconCheck className="h-3.5 w-3.5" stroke={2.5} />
                          </button>

                          <MachineRowOemLogo
                            oem={row.machine.oem}
                            selected={selected}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span
                                className={`truncate text-sm font-semibold ${
                                  selected ? "text-slate-900" : "text-slate-700"
                                }`}
                              >
                                {row.machine.name}
                              </span>
                              <StatusBadge status={row.machine.status} />
                            </div>
                            <p
                              className={`truncate text-[11px] ${
                                selected ? "text-slate-500" : "text-slate-400"
                              }`}
                            >
                              {row.machine.category}
                            </p>
                          </div>

                          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                            <MachineRowMetric
                              label="Drift"
                              value={formatHours(row.summary.totalUsageHours)}
                              selected={selected}
                            />
                            <MachineRowMetric
                              label="Energi"
                              value={formatEnergy(row.summary.totalEnergyKwh)}
                              selected={selected}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="min-h-[22rem] flex-1 overflow-hidden rounded-[24px] border border-slate-200 shadow-inner">
            <div className="relative h-full w-full">
              <SelectedMachinesMiniMap
                machines={selectedMachineRows.map((row) => row.machine)}
                blurred={selectedMachineRows.length === 0}
              />
              {selectedMachineRows.length === 0 ? (
                <div className="absolute inset-0 grid place-items-center p-8">
                  <div className="max-w-sm rounded-[24px] border border-slate-200 bg-white/92 p-6 text-center shadow-sm backdrop-blur-sm">
                    <p className="text-lg font-semibold text-slate-900">
                      Ingen maskiner valgt
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Velg minst en maskin i listen for å fylle kartet.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ControlBlock
          icon={<IconCalendarEvent className="h-5 w-5 text-slate-500" />}
          label="Periode"
          helper="Juster vinduet for analysen"
        >
          <SegmentedSelector
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(next) => setPeriod(next)}
          />
        </ControlBlock>

        <ControlBlock
          icon={<IconAdjustmentsHorizontal className="h-5 w-5 text-slate-500" />}
          label="Gruppering"
          helper="Hvordan tallene skal aggregeres"
        >
          <SegmentedSelector
            options={AGGREGATION_OPTIONS}
            value={aggregation}
            onChange={(next) => setAggregation(next)}
          />
        </ControlBlock>

        <ControlBlock
          icon={<IconChartAreaLine className="h-5 w-5 text-slate-500" />}
          label="Analyser"
          helper="Velg hvilke grafer som skal vises"
        >
          <MultiSelectPills
            options={ANALYSIS_OPTIONS}
            value={selectedAnalyses}
            onToggle={toggleAnalysis}
          />
        </ControlBlock>
      </section>

      <SectionDivider label="Dashboard" />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          icon={<IconBulldozer className="h-5 w-5 text-slate-700" />}
          label="Valgte maskiner"
          value={`${selectedMachineCount} / ${allMachines.length}`}
          helper="Utvalg i dashboardet"
          accentClass="bg-slate-900"
          iconWrapClass="bg-slate-100"
        />
        <KpiCard
          icon={<IconClockHour4 className="h-5 w-5 text-emerald-600" />}
          label="Driftstimer"
          value={formatHours(summary.totalUsageHours)}
          helper={buildChangeLabel(
            summary.totalUsageHours,
            previousSummary.totalUsageHours,
          )}
          accentClass="bg-emerald-500"
          iconWrapClass="bg-emerald-50"
        />
        <KpiCard
          icon={<IconBolt className="h-5 w-5 text-sky-600" />}
          label="Energibruk"
          value={formatEnergy(summary.totalEnergyKwh)}
          helper={buildChangeLabel(
            summary.totalEnergyKwh,
            previousSummary.totalEnergyKwh,
          )}
          accentClass="bg-sky-500"
          iconWrapClass="bg-sky-50"
        />
        <KpiCard
          icon={<IconLeaf className="h-5 w-5 text-amber-600" />}
          label="CO2-utslipp"
          value={formatCo2(summary.totalCo2Kg)}
          helper={`${formatPercent(summary.idleShare, 0)} tomgangsandel`}
          accentClass="bg-amber-500"
          iconWrapClass="bg-amber-50"
        />
        <KpiCard
          icon={<IconChartAreaLine className="h-5 w-5 text-violet-600" />}
          label={
            <span
              lang="nb"
              className="block whitespace-normal break-normal"
              style={{ hyphens: "auto", WebkitHyphens: "auto" }}
            >
              Elektrifiseringsgrad
            </span>
          }
          value={formatPercent(summary.electrificationRate, 0)}
          helper={`${formatCo2(summary.avoidedCo2Kg)} spart mot dieselreferanse`}
          accentClass="bg-violet-500"
          iconWrapClass="bg-violet-50"
        />
      </section>

      {dashboardCards.length > 0 ? (
        <section className="grid gap-6 2xl:grid-cols-2">
          {dashboardCards}
        </section>
      ) : (
        <section className="rounded-[26px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <p className="text-base font-semibold text-slate-900">
            Ingen analyser valgt
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Velg minst en analyse i boksen over for å vise dashboardet.
          </p>
        </section>
      )}
    </div>
  );
}
