"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconSearch } from "@tabler/icons-react";
import { formatDate } from "@/lib/formatters";
import {
  CONTRACT_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  type ContractTypeValue,
  type ProjectStatusValue,
} from "@/lib/project-status";
import type { ProjectListItem } from "@/lib/projects";

type ProjectsListClientProps = {
  projects: ProjectListItem[];
  canCreateProject: boolean;
};

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-10 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

export default function ProjectsListClient({
  projects,
  canCreateProject,
}: ProjectsListClientProps) {
  const [query, setQuery] = useState("");

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;

    return projects.filter((project) =>
      [
        project.projectNumber,
        project.name,
        project.customerName,
        project.clientName,
        project.city,
        project.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [projects, query]);

  if (projects.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Ingen prosjekter ennå</h2>
        {canCreateProject ? (
          <p className="mt-2 text-sm text-slate-600">
            Opprett første prosjekt for å fylle inn prosjektinfo og kontraktsmål.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="relative max-w-2xl">
        <IconSearch className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Søk på prosjektnummer, navn, kunde, byggherre eller sted"
          className={inputClass}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filteredProjects.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-600">
            Ingen prosjekter matcher søket.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">Prosjekt</th>
                  <th className="px-4 py-3">Kunde og byggherre</th>
                  <th className="px-4 py-3">Sted</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Avvik</th>
                  <th className="px-4 py-3">Oppdatert</th>
                  <th className="px-6 py-3 text-right">Handling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredProjects.map((project) => (
                  <tr key={project.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <Link
                        href={`/prosjekter/${project.id}`}
                        className="font-semibold text-slate-900 hover:text-blue-700"
                      >
                        {project.name}
                      </Link>
                      <div className="mt-1 text-xs text-slate-500">
                        {project.projectNumber}
                        {project.contractType ? (
                          <> · {CONTRACT_TYPE_LABELS[project.contractType as ContractTypeValue]}</>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      <div>{project.customerName ?? `Kunde ${project.customerId}`}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {project.clientName ?? "Byggherre ikke satt"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{project.city ?? "-"}</td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                        {PROJECT_STATUS_LABELS[project.status as ProjectStatusValue] ?? project.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${deviationClass(project.deviationLevel)}`}>
                        {project.deviationLabel}
                        {project.issueCount ? ` (${project.issueCount})` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {formatDate(project.updatedAt, { showTime: false }) ?? "-"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-3">
                        <Link
                          href={`/prosjekter/${project.id}`}
                          className="text-sm font-semibold text-blue-700 hover:text-blue-900"
                        >
                          Åpne prosjekt
                        </Link>
                        <Link
                          href={`/prosjekter/${project.id}/oppsett`}
                          className="text-sm font-semibold text-slate-600 hover:text-slate-900"
                        >
                          Rediger
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function deviationClass(level: ProjectListItem["deviationLevel"]) {
  if (level === "RED") return "bg-red-50 text-red-700 ring-1 ring-red-100";
  if (level === "YELLOW") return "bg-amber-50 text-amber-700 ring-1 ring-amber-100";
  return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100";
}
