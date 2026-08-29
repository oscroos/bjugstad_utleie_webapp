"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  IconAlertTriangle,
  IconCheck,
  IconFileText,
  IconFolder,
  IconMap2,
  IconTarget,
} from "@tabler/icons-react";
import { formatDate, formatDisplay } from "@/lib/formatters";
import {
  CLIENT_TYPE_LABELS,
  CONTRACT_TYPE_LABELS,
  KPI_METRIC_LABELS,
  PROJECT_STATUS_LABELS,
  type ClientTypeValue,
  type ContractTypeValue,
  type ProjectStatusValue,
} from "@/lib/project-status";
import type { ProjectWorkspace } from "@/lib/projects";
import ProjectDocumentsPanel from "./ProjectDocumentsPanel";

type ProjectWorkspaceClientProps = {
  project: ProjectWorkspace;
  canEdit: boolean;
};

type ProjectTab = "info" | "map" | "masses" | "documents";

const TABS: Array<{
  id: ProjectTab;
  label: string;
  icon: ReactNode;
}> = [
  { id: "info", label: "Prosjektinfo", icon: <IconFolder className="h-5 w-5" /> },
  { id: "map", label: "Anleggskart", icon: <IconMap2 className="h-5 w-5" /> },
  { id: "masses", label: "Masse & lasslister", icon: <IconTarget className="h-5 w-5" /> },
  { id: "documents", label: "Dokumenter", icon: <IconFileText className="h-5 w-5" /> },
];

const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50";

export default function ProjectWorkspaceClient({
  project,
  canEdit,
}: ProjectWorkspaceClientProps) {
  const [activeTab, setActiveTab] = useState<ProjectTab>("info");

  return (
    <main className="space-y-6 p-8">
      <header className="space-y-4">
        <Link href="/prosjekter" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
          Tilbake til prosjekter
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">{project.name}</h1>
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
            <Link href={`/prosjekter/${project.id}/oppsett`} className={secondaryButtonClass}>
              Rediger
            </Link>
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
              className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
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

      {activeTab === "info" ? <ProjectInfoTab project={project} /> : null}
      {activeTab === "map" ? <ProjectMapTab project={project} /> : null}
      {activeTab === "masses" ? <ProjectMassesTab project={project} canEdit={canEdit} /> : null}
      {activeTab === "documents" ? <ProjectDocumentsTab projectId={project.id} canEdit={canEdit} /> : null}
    </main>
  );
}

function ProjectInfoTab({ project }: { project: ProjectWorkspace }) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-900">Avvik</h2>
        </div>
        <div className="p-6">
          {project.deviations.issues.length === 0 ? (
            <div className="flex items-center gap-3 text-sm font-medium text-emerald-700">
              <IconCheck className="h-5 w-5" />
              Ingen avvik registrert.
            </div>
          ) : (
            <div className="space-y-3">
              {project.deviations.issues.map((issue) => (
                <div key={issue} className="flex items-start gap-3 text-sm text-slate-800">
                  <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <InfoSection
          title="Prosjekt"
          rows={[
            ["Kunde", project.customerName ?? `Kunde ${project.customerId}`],
            ["Adresse", formatAddress(project)],
            ["Periode", formatPeriod(project.startDate, project.endDate)],
            ["Oppdatert", formatDate(project.updatedAt) ?? "-"],
            ["Beskrivelse", project.description ?? "-"],
          ]}
        />
        <InfoSection
          title="Kontrakt"
          rows={[
            [
              "Kontraktstype",
              project.contractType
                ? CONTRACT_TYPE_LABELS[project.contractType as ContractTypeValue]
                : "-",
            ],
            ["Kontraktsstørrelse", formatCurrency(project.contractSizeNok)],
            [
              "Byggherretype",
              project.clientType ? CLIENT_TYPE_LABELS[project.clientType as ClientTypeValue] : "-",
            ],
          ]}
        />
        <InfoSection
          title="Byggherre"
          rows={[
            ["Navn", project.clientName ?? "-"],
            ["Adresse", project.clientAddress ?? "-"],
            ["E-post", project.clientEmail ?? "-"],
            ["Kontaktperson", project.clientContactName ?? "-"],
            ["Kontakt e-post", project.clientContactEmail ?? "-"],
            ["Kontakt telefon", project.clientContactPhone ?? "-"],
          ]}
        />
        <InfoSection
          title="Egendefinerte felt"
          rows={
            project.fieldValues.length
              ? project.fieldValues.map((field) => [field.label, formatProjectField(field)])
              : [["Status", "Ingen felt registrert"]]
          }
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-900">Kontraktsmål</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Mål</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Målverdi</th>
                <th className="px-4 py-3">Målt verdi</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-6 py-3">Kontraktspunkt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {project.kpis.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Ingen kontraktsmål registrert.
                  </td>
                </tr>
              ) : (
                project.kpis.map((kpi) => (
                  <tr key={kpi.id}>
                    <td className="px-6 py-4 font-semibold text-slate-900">{kpi.label}</td>
                    <td className="px-4 py-4 text-slate-700">
                      {KPI_METRIC_LABELS[kpi.metric] ?? kpi.metric}
                    </td>
                    <td className="px-4 py-4 tabular-nums text-slate-700">
                      {formatNumber(kpi.targetValue)} {kpi.unit}
                    </td>
                    <td className="px-4 py-4 tabular-nums text-slate-700">
                      {kpi.currentValue === null ? "-" : `${formatNumber(kpi.currentValue)} ${kpi.unit}`}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${kpiStatusClass(kpi.status)}`}>
                        {kpi.statusLabel}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-700">{kpi.contractRef ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ProjectMapTab({ project }: { project: ProjectWorkspace }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-xl font-semibold text-slate-900">Anleggskart</h2>
      </div>
      <div className="space-y-5 p-6">
        <InfoSection
          title="Lokasjon"
          rows={[
            ["Adresse", formatAddress(project)],
            ["Sted", project.city ?? "-"],
          ]}
        />
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          Ingen anleggssoner registrert.
        </div>
        <Link href="/kart" className={secondaryButtonClass}>
          Åpne kart
        </Link>
      </div>
    </section>
  );
}

function ProjectMassesTab({
  project,
  canEdit,
}: {
  project: ProjectWorkspace;
  canEdit: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Masse & lasslister</h2>
        {canEdit ? (
          <Link href={`/prosjekter/${project.id}/oppsett`} className={secondaryButtonClass}>
            Rediger masseoppsett
          </Link>
        ) : null}
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

function InfoSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string]>;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      </div>
      <dl className="divide-y divide-slate-100">
        {rows.map(([label, value]) => (
          <div key={`${title}-${label}`} className="grid gap-2 px-6 py-4 sm:grid-cols-[12rem_1fr]">
            <dt className="text-sm font-medium text-slate-500">{label}</dt>
            <dd className="whitespace-pre-wrap text-sm text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function formatAddress(project: ProjectWorkspace) {
  const cityLine = [project.postalCode, project.city].filter(Boolean).join(" ");
  return [project.addressLine, cityLine].filter(Boolean).join("\n") || "-";
}

function formatPeriod(startDate: string | null, endDate: string | null) {
  const start = formatDate(startDate, { showTime: false }) ?? "-";
  const end = formatDate(endDate, { showTime: false }) ?? "-";
  return `${start} til ${end}`;
}

function formatProjectField(field: ProjectWorkspace["fieldValues"][number]) {
  if (field.fieldType === "BOOLEAN") {
    if (field.value === "true") return "Ja";
    if (field.value === "false") return "Nei";
  }
  return formatDisplay(field.value);
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
