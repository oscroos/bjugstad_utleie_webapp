"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconCheck, IconChevronDown, IconPlus, IconSearch } from "@tabler/icons-react";
import { LAST_PROJECT_COOKIE, LAST_PROJECT_COOKIE_MAX_AGE_SECONDS } from "@/lib/constants";
import { PROJECT_STATUS_LABELS, type ProjectStatusValue } from "@/lib/project-status";
import type { ProjectListItem } from "@/lib/projects";

type ProjectSwitcherProps = {
  currentProjectId: string;
  currentProjectName: string;
  projects: ProjectListItem[];
  canCreateProject: boolean;
};

export default function ProjectSwitcher({
  currentProjectId,
  currentProjectName,
  projects,
  canCreateProject,
}: ProjectSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Remember the opened project so /prosjekter lands here next time.
  useEffect(() => {
    try {
      document.cookie = `${LAST_PROJECT_COOKIE}=${encodeURIComponent(currentProjectId)}; path=/; max-age=${LAST_PROJECT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    } catch {
      // Cookie writes can fail in restricted contexts; the fallback is just the default project.
    }
  }, [currentProjectId]);

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) =>
      [project.projectNumber, project.name, project.customerName, project.clientName, project.city]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [projects, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const currentIndex = projects.findIndex((project) => project.id === currentProjectId);
    setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, projects, currentProjectId]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlightedIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [open, highlightedIndex]);

  function selectProject(projectId: string) {
    setOpen(false);
    if (projectId !== currentProjectId) {
      router.push(`/prosjekter/${projectId}`);
    }
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, filteredProjects.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const project = filteredProjects[highlightedIndex];
      if (project) selectProject(project.id);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Bytt prosjekt"
        title="Bytt prosjekt"
        className="group -ml-2 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-slate-100"
      >
        <h1 className="break-words text-3xl font-semibold text-slate-900">{currentProjectName}</h1>
        <IconChevronDown
          className={`h-6 w-6 shrink-0 text-slate-400 transition group-hover:text-slate-700 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="absolute left-0 z-30 mt-2 w-[min(32rem,calc(100vw-4rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="relative border-b border-slate-100 p-3">
            <IconSearch className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Søk på prosjektnummer, navn, kunde eller sted"
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <ul ref={listRef} role="listbox" aria-label="Prosjekter" className="max-h-80 overflow-y-auto py-1">
            {filteredProjects.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-slate-500">Ingen prosjekter matcher søket.</li>
            ) : (
              filteredProjects.map((project, index) => {
                const isCurrent = project.id === currentProjectId;
                const isHighlighted = index === highlightedIndex;
                return (
                  <li
                    key={project.id}
                    data-index={index}
                    role="option"
                    aria-selected={isCurrent}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectProject(project.id)}
                    className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 ${
                      isHighlighted ? "bg-slate-100" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm ${isCurrent ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}>
                        {project.projectNumber} · {project.name}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {[project.customerName ?? `Kunde ${project.customerId}`, project.city]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                      {PROJECT_STATUS_LABELS[project.status as ProjectStatusValue] ?? project.status}
                    </span>
                    {isCurrent ? <IconCheck className="h-4 w-4 shrink-0 text-blue-700" /> : null}
                  </li>
                );
              })
            )}
          </ul>

          {canCreateProject ? (
            <div className="border-t border-slate-100 p-2">
              <Link
                href="/prosjekter/ny"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
              >
                <IconPlus className="h-4 w-4" />
                Nytt prosjekt
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
