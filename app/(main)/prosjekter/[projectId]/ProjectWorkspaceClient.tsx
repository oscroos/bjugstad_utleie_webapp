"use client";

import { Suspense, use, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconCash,
  IconCheck,
  IconFileText,
  IconFolder,
  IconHelp,
  IconMap2,
  IconMountain,
  IconPencil,
  IconTarget,
  IconUsers,
} from "@tabler/icons-react";
import { formatDate } from "@/lib/formatters";
import {
  CLIENT_TYPE_LABELS,
  CONTRACT_TYPE_LABELS,
  KPI_METRIC_LABELS,
  KPI_METRIC_OPTIONS,
  PROJECT_STATUS_LABELS,
  type ClientTypeValue,
  type ContractTypeValue,
  type ProjectStatusValue,
} from "@/lib/project-status";
import type { ProjectListItem, ProjectMachinesResult, ProjectWorkspace } from "@/lib/projects";
import { MachinesSectionSkeleton } from "../ProjectSkeletons";
import ProjectSwitcher from "../ProjectSwitcher";
import ProjectAccessPanel from "./ProjectAccessPanel";
import type { ProjectSetupSection } from "../ProjectSetupForm";
import ProjectAboutSection from "./ProjectAboutSection";
import ProjectDocumentsPanel from "./ProjectDocumentsPanel";
import ProjectEditOverlay from "./ProjectEditOverlay";
import ProjectMachinesSection from "./ProjectMachinesSection";
import ProjectZonesEditor from "./ProjectZonesEditor";

type Viewer = { id?: string | null; role?: string | null };

export type MapCenter = { lat: number; lng: number };

type ProjectWorkspaceClientProps = {
  project: ProjectWorkspace;
  projects: ProjectListItem[];
  /** Streamed from the server; resolves when the Bjugstad rental lookup is done. */
  machinesPromise: Promise<ProjectMachinesResult>;
  mapFallbackCenterPromise: Promise<MapCenter | null>;
  viewer: Viewer;
  canCreateProject: boolean;
  canEdit: boolean;
};

type ProjectTab = "info" | "map" | "masses" | "documents" | "access";

const TABS: Array<{
  id: ProjectTab;
  label: string;
  icon: ReactNode;
}> = [
  { id: "info", label: "Prosjektinfo", icon: <IconFolder className="h-5 w-5" /> },
  { id: "map", label: "Anleggskart", icon: <IconMap2 className="h-5 w-5" /> },
  { id: "masses", label: "Masse & lasslister", icon: <IconTarget className="h-5 w-5" /> },
  { id: "documents", label: "Dokumenter", icon: <IconFileText className="h-5 w-5" /> },
  { id: "access", label: "Brukertilganger", icon: <IconUsers className="h-5 w-5" /> },
];

/** What an edit button opens: the whole project, or one part of it. */
type EditTarget = "all" | "kpis" | "masses";

const EDIT_TARGETS: Record<EditTarget, { title: string; sections: ProjectSetupSection[] }> = {
  all: { title: "Rediger prosjekt", sections: ["info", "contract", "kpis", "fields", "masses"] },
  kpis: { title: "Rediger kontraktsmål", sections: ["kpis"] },
  masses: { title: "Rediger masseplan", sections: ["masses"] },
};

const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50";

export default function ProjectWorkspaceClient({
  project,
  projects,
  machinesPromise,
  mapFallbackCenterPromise,
  viewer,
  canCreateProject,
  canEdit,
}: ProjectWorkspaceClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProjectTab>("info");
  // Which edit overlay is open, if any.
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  return (
    <main className="space-y-6 p-8">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <ProjectSwitcher
              currentProjectId={project.id}
              currentProjectName={project.name}
              projects={projects}
              canCreateProject={canCreateProject}
            />
            <p className="mt-2 text-slate-600">
              {project.projectNumber} · {project.customerName ?? `Kunde ${project.customerId}`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                {PROJECT_STATUS_LABELS[project.status as ProjectStatusValue] ?? project.status}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${deviationClass(project.deviations.level)}`}>
                {project.deviations.label}
              </span>
              {project.clientName ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {project.clientName}
                </span>
              ) : null}
            </div>
          </div>
          {canEdit ? (
            <button type="button" onClick={() => setEditTarget("all")} className={`${secondaryButtonClass} cursor-pointer`}>
              <IconPencil className="h-4 w-4" />
              Rediger prosjekt
            </button>
          ) : null}
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto border-b border-slate-200" aria-label="Prosjektfaner">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
                active
                  ? "border-blue-700 text-blue-700"
                  : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === "info" ? (
        <ProjectInfoTab
          project={project}
          machinesPromise={machinesPromise}
          viewer={viewer}
          canEdit={canEdit}
          onEdit={setEditTarget}
          onSaved={() => router.refresh()}
        />
      ) : null}
      {activeTab === "map" ? (
        <ProjectMapTab project={project} canEdit={canEdit} fallbackCenterPromise={mapFallbackCenterPromise} />
      ) : null}
      {activeTab === "masses" ? (
        <ProjectMassesTab project={project} canEdit={canEdit} onEdit={setEditTarget} />
      ) : null}
      {activeTab === "documents" ? <ProjectDocumentsTab projectId={project.id} canEdit={canEdit} /> : null}
      {activeTab === "access" ? (
        <ProjectAccessPanel
          key={project.id}
          projectId={project.id}
          customerName={project.customerName ?? `Kunde ${project.customerId}`}
        />
      ) : null}

      {editTarget ? (
        <ProjectEditOverlay
          // A new overlay per target, so the form never carries values over from another part.
          key={editTarget}
          projectId={project.id}
          title={EDIT_TARGETS[editTarget].title}
          subtitle={`${project.projectNumber} · ${project.name}`}
          sections={EDIT_TARGETS[editTarget].sections}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            // Reload the page's data, so the saved values show at once.
            router.refresh();
          }}
        />
      ) : null}
    </main>
  );
}

function ProjectInfoTab({
  project,
  machinesPromise,
  viewer,
  canEdit,
  onEdit,
  onSaved,
}: {
  project: ProjectWorkspace;
  machinesPromise: Promise<ProjectMachinesResult>;
  viewer: Viewer;
  canEdit: boolean;
  onEdit: (target: EditTarget) => void;
  /** Reloads the project after something on this tab was saved. */
  onSaved: () => void;
}) {
  const timeline = computeTimeline(project.startDate, project.endDate);
  const kpiCounts = {
    ok: project.kpis.filter((kpi) => kpi.status === "OK").length,
    warning: project.kpis.filter((kpi) => kpi.status === "WARNING").length,
    breach: project.kpis.filter((kpi) => kpi.status === "BREACH").length,
    missing: project.kpis.filter((kpi) => kpi.status === "DATA_MISSING").length,
  };
  const massPlan = project.massTypes.reduce(
    (acc, massType) => ({
      plannedIn: acc.plannedIn + massType.plannedIn,
      plannedOut: acc.plannedOut + massType.plannedOut,
    }),
    { plannedIn: 0, plannedOut: 0 },
  );
  const massUnit = project.massTypes.length
    ? Array.from(new Set(project.massTypes.map((massType) => massType.unit))).length === 1
      ? project.massTypes[0].unit
      : ""
    : "";

  return (
    <div className="space-y-6">
      {/* Key figures */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<IconCash className="h-5 w-5" />}
          tone="blue"
          label="Kontraktssum"
          value={project.contractSizeNok === null ? "Ikke satt" : formatCurrency(project.contractSizeNok)}
          detail={
            project.contractType
              ? `${CONTRACT_TYPE_LABELS[project.contractType as ContractTypeValue]}${
                  project.clientType ? ` · ${CLIENT_TYPE_LABELS[project.clientType as ClientTypeValue]} byggherre` : ""
                }`
              : "Kontraktstype ikke satt"
          }
        />
        <StatTile
          icon={<IconCalendarEvent className="h-5 w-5" />}
          tone="violet"
          label="Fremdrift"
          value={timeline.headline}
          detail={timeline.detail}
        >
          {timeline.percent !== null ? (
            <ProgressBar percent={timeline.percent} className="bg-violet-500" />
          ) : null}
        </StatTile>
        <StatTile
          icon={<IconTarget className="h-5 w-5" />}
          tone={kpiCounts.breach ? "red" : kpiCounts.warning || kpiCounts.missing ? "amber" : "emerald"}
          label="Kontraktsmål"
          value={
            project.kpis.length === 0
              ? "Ingen"
              : `${kpiCounts.ok} av ${project.kpis.length} OK`
          }
          detail={
            project.kpis.length === 0
              ? "Ingen mål registrert"
              : [
                  kpiCounts.breach ? `${kpiCounts.breach} brudd` : null,
                  kpiCounts.warning ? `${kpiCounts.warning} nær grense` : null,
                  kpiCounts.missing ? `${kpiCounts.missing} mangler data` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Alle mål innenfor"
          }
        >
          {project.kpis.length > 0 ? (
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
              {kpiCounts.ok ? <div className="bg-emerald-500" style={{ flex: kpiCounts.ok }} /> : null}
              {kpiCounts.warning ? <div className="bg-amber-400" style={{ flex: kpiCounts.warning }} /> : null}
              {kpiCounts.breach ? <div className="bg-red-500" style={{ flex: kpiCounts.breach }} /> : null}
              {kpiCounts.missing ? <div className="bg-slate-300" style={{ flex: kpiCounts.missing }} /> : null}
            </div>
          ) : null}
        </StatTile>
        <StatTile
          icon={<IconMountain className="h-5 w-5" />}
          tone="teal"
          label="Masseplan"
          value={
            project.massTypes.length === 0
              ? "Ingen"
              : `${project.massTypes.length} ${project.massTypes.length === 1 ? "massetype" : "massetyper"}`
          }
          detail={
            project.massTypes.length === 0
              ? "Ingen massetyper valgt"
              : `${formatNumber(massPlan.plannedIn)} ${massUnit} inn · ${formatNumber(massPlan.plannedOut)} ${massUnit} ut`
          }
        />
      </div>

      {/* Project facts and contract goals */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ProjectAboutSection project={project} canEdit={canEdit} onSaved={onSaved} />

        {/*
          The box never grows with the number of goals. On wide screens it is exactly as
          tall as "Om prosjektet" beside it (it is taken out of the row's height
          calculation); on narrow screens it has a fixed maximum. The goals scroll inside.
        */}
        <div className="relative">
        <section className="flex max-h-[34rem] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm xl:absolute xl:inset-0 xl:max-h-none">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Kontraktsmål</h2>
              <p className="mt-0.5 text-sm text-slate-500">Målt verdi mot kontraktsfestet grense.</p>
            </div>
            {canEdit ? <EditIconButton label="Rediger kontraktsmål" onClick={() => onEdit("kpis")} /> : null}
          </div>
          {project.kpis.length === 0 ? (
            <div className="p-10 text-center">
              <IconTarget className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">Ingen kontraktsmål registrert</p>
              <p className="mt-1 text-sm text-slate-500">
                Legg inn mål for CO2, tomgang, drivstoff eller massegjenbruk for å følge opp kontrakten.
              </p>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-5">
              {project.kpis.map((kpi) => (
                <KpiCard key={kpi.id} kpi={kpi} />
              ))}
            </div>
          )}
        </section>
        </div>
      </div>

      <Suspense fallback={<MachinesSectionSkeleton />}>
        <StreamedMachinesSection
          machinesPromise={machinesPromise}
          projectNumber={project.projectNumber}
          viewer={viewer}
        />
      </Suspense>
    </div>
  );
}

/**
 * The edit button on a box: pencil only, in the same outline style as the
 * "Rediger prosjekt" button. The label is read by screen readers and shown on hover.
 */
function EditIconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
    >
      <IconPencil className="h-4 w-4" />
    </button>
  );
}

function StreamedMachinesSection({
  machinesPromise,
  projectNumber,
  viewer,
}: {
  machinesPromise: Promise<ProjectMachinesResult>;
  projectNumber: string;
  viewer: Viewer;
}) {
  const machines = use(machinesPromise);
  return (
    <ProjectMachinesSection
      machines={machines.machines}
      error={machines.error}
      projectNumber={projectNumber}
      viewer={viewer}
    />
  );
}

const STAT_TONES = {
  blue: "bg-blue-50 text-blue-700",
  violet: "bg-violet-50 text-violet-700",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  teal: "bg-teal-50 text-teal-700",
} as const;

function StatTile({
  icon,
  tone,
  label,
  value,
  detail,
  children,
}: {
  icon: ReactNode;
  tone: keyof typeof STAT_TONES;
  label: string;
  value: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${STAT_TONES[tone]}`}>
          {icon}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <div>
        <div className="text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
        <div className="mt-1 text-sm text-slate-500">{detail}</div>
      </div>
      {children}
    </div>
  );
}

function ProgressBar({ percent, className }: { percent: number; className: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

function KpiCard({ kpi }: { kpi: ProjectWorkspace["kpis"][number] }) {
  const direction = KPI_METRIC_OPTIONS.find((option) => option.value === kpi.metric)?.direction ?? "MAX";
  const hasData = kpi.status !== "DATA_MISSING" && kpi.currentValue !== null;
  const ratio =
    hasData && kpi.targetValue > 0 ? (kpi.currentValue as number) / kpi.targetValue : null;
  const percent = ratio === null ? 0 : Math.min(100, ratio * 100);
  const barClass =
    kpi.status === "BREACH"
      ? "bg-red-500"
      : kpi.status === "WARNING"
        ? "bg-amber-400"
        : kpi.status === "OK"
          ? "bg-emerald-500"
          : "bg-slate-300";
  const StatusIcon =
    kpi.status === "BREACH" ? IconAlertTriangle : kpi.status === "WARNING" ? IconAlertTriangle : kpi.status === "OK" ? IconCheck : IconHelp;

  return (
    <div className={`rounded-xl border p-4 ${kpiCardClass(kpi.status)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-900">{kpi.label}</div>
          <div className="text-xs text-slate-500">
            {KPI_METRIC_LABELS[kpi.metric] ?? kpi.metric}
            {kpi.contractRef ? ` · ${kpi.contractRef}` : ""}
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${kpiStatusClass(kpi.status)}`}
        >
          <StatusIcon className="h-3.5 w-3.5" />
          {kpi.statusLabel}
        </span>
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums text-slate-900">
          {hasData ? formatNumber(kpi.currentValue as number) : "–"}
        </span>
        <span className="text-sm text-slate-500">
          / {formatNumber(kpi.targetValue)} {kpi.unit}
        </span>
      </div>

      <div className="mt-2">
        <ProgressBar percent={percent} className={barClass} />
        <div className="mt-1 text-xs text-slate-500">
          {!hasData
            ? "Ingen måledata ennå"
            : direction === "MAX"
              ? `${formatNumber(percent)} % av grensen brukt`
              : `${formatNumber(percent)} % av minstekravet nådd`}
        </div>
      </div>
    </div>
  );
}

function kpiCardClass(status: ProjectWorkspace["kpis"][number]["status"]) {
  if (status === "BREACH") return "border-red-200 bg-red-50/40";
  if (status === "WARNING") return "border-amber-200 bg-amber-50/40";
  if (status === "DATA_MISSING") return "border-slate-200 bg-slate-50";
  return "border-emerald-200 bg-emerald-50/30";
}

function computeTimeline(startDate: string | null, endDate: string | null) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  const validStart = start && !Number.isNaN(start.getTime()) ? start : null;
  const validEnd = end && !Number.isNaN(end.getTime()) ? end : null;
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  if (validStart && validEnd && validEnd.getTime() > validStart.getTime()) {
    const total = validEnd.getTime() - validStart.getTime();
    const elapsed = now.getTime() - validStart.getTime();
    const percent = Math.max(0, Math.min(100, (elapsed / total) * 100));
    const daysLeft = Math.ceil((validEnd.getTime() - now.getTime()) / dayMs);
    const totalDays = Math.round(total / dayMs);

    if (now.getTime() < validStart.getTime()) {
      const daysUntil = Math.ceil((validStart.getTime() - now.getTime()) / dayMs);
      return {
        percent,
        headline: `Starter om ${daysUntil} ${daysUntil === 1 ? "dag" : "dager"}`,
        detail: `${formatPeriod(startDate, endDate)} · ${totalDays} dager`,
      };
    }
    if (daysLeft < 0) {
      return {
        percent,
        headline: "Periode utløpt",
        detail: `Sluttfrist ${formatDate(endDate, { showTime: false }) ?? "-"} · ${Math.abs(daysLeft)} dager siden`,
      };
    }
    return {
      percent,
      headline: `${Math.round(percent)} % av perioden`,
      detail: `${daysLeft} ${daysLeft === 1 ? "dag" : "dager"} igjen til ${formatDate(endDate, { showTime: false }) ?? "-"}`,
    };
  }

  if (validStart || validEnd) {
    return {
      percent: null,
      headline: validStart ? "Pågår" : "Frist satt",
      detail: formatPeriod(startDate, endDate),
    };
  }

  return { percent: null, headline: "Ikke planlagt", detail: "Oppstart og sluttfrist er ikke satt" };
}

function ProjectMapTab({
  project,
  canEdit,
  fallbackCenterPromise,
}: {
  project: ProjectWorkspace;
  canEdit: boolean;
  fallbackCenterPromise: Promise<MapCenter | null>;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Anleggskart</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {formatAddressInline(project) !== "-"
              ? formatAddressInline(project)
              : "Tegn anleggssoner i kartet og juster punktene ved behov."}
          </p>
        </div>
        <Link href="/kart" className={secondaryButtonClass}>
          Åpne maskinkart
        </Link>
      </div>
      <div className="p-6">
        {project.zones.length > 0 ? (
          <ProjectZonesEditor
            key={project.id}
            projectId={project.id}
            initialZones={project.zones}
            canEdit={canEdit}
            fallbackCenter={null}
          />
        ) : (
          // Without zones the map starts on the project's machines, which come
          // from the streamed rental lookup.
          <Suspense fallback={<MapAreaSkeleton />}>
            <ZonesEditorWithFallbackCenter
              project={project}
              canEdit={canEdit}
              fallbackCenterPromise={fallbackCenterPromise}
            />
          </Suspense>
        )}
      </div>
    </section>
  );
}

function ZonesEditorWithFallbackCenter({
  project,
  canEdit,
  fallbackCenterPromise,
}: {
  project: ProjectWorkspace;
  canEdit: boolean;
  fallbackCenterPromise: Promise<MapCenter | null>;
}) {
  const fallbackCenter = use(fallbackCenterPromise);
  return (
    <ProjectZonesEditor
      key={project.id}
      projectId={project.id}
      initialZones={project.zones}
      canEdit={canEdit}
      fallbackCenter={fallbackCenter}
    />
  );
}

function MapAreaSkeleton() {
  return (
    <div className="flex h-[480px] w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-500">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
      Laster kart...
    </div>
  );
}

function ProjectMassesTab({
  project,
  canEdit,
  onEdit,
}: {
  project: ProjectWorkspace;
  canEdit: boolean;
  onEdit: (target: EditTarget) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Masse & lasslister</h2>
        {canEdit ? <EditIconButton label="Rediger masseplan" onClick={() => onEdit("masses")} /> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-6 py-3">Massetype</th>
              <th className="px-4 py-3">Enhet</th>
              <th className="px-4 py-3">Tonn/m3</th>
              <th className="px-4 py-3">Plan inn</th>
              <th className="px-6 py-3">Plan ut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {project.massTypes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  Ingen massetyper valgt.
                </td>
              </tr>
            ) : (
              project.massTypes.map((massType) => (
                <tr key={massType.id}>
                  <td className="px-6 py-4 font-semibold text-slate-900">{massType.name}</td>
                  <td className="px-4 py-4 text-slate-700">{massType.unit}</td>
                  <td className="px-4 py-4 tabular-nums text-slate-700">{formatNumber(massType.tonnPerM3)}</td>
                  <td className="px-4 py-4 tabular-nums text-slate-700">{formatNumber(massType.plannedIn)}</td>
                  <td className="px-6 py-4 tabular-nums text-slate-700">{formatNumber(massType.plannedOut)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProjectDocumentsTab({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  return <ProjectDocumentsPanel projectId={projectId} canEdit={canEdit} />;
}

function formatAddressInline(project: ProjectWorkspace) {
  const cityLine = [project.postalCode, project.city].filter(Boolean).join(" ");
  return [project.addressLine, cityLine].filter(Boolean).join(", ") || "-";
}

function formatPeriod(startDate: string | null, endDate: string | null) {
  const start = formatDate(startDate, { showTime: false }) ?? "-";
  const end = formatDate(endDate, { showTime: false }) ?? "-";
  return `${start} til ${end}`;
}

function formatCurrency(value: number | null) {
  if (value === null) return "-";
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(value);
}

function deviationClass(level: ProjectWorkspace["deviations"]["level"]) {
  if (level === "RED") return "bg-red-50 text-red-700 ring-1 ring-red-100";
  if (level === "YELLOW") return "bg-amber-50 text-amber-700 ring-1 ring-amber-100";
  return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
}

function kpiStatusClass(status: ProjectWorkspace["kpis"][number]["status"]) {
  if (status === "BREACH") return "bg-red-50 text-red-700 ring-1 ring-red-100";
  if (status === "WARNING") return "bg-amber-50 text-amber-700 ring-1 ring-amber-100";
  if (status === "DATA_MISSING") return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
}
