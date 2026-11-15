"use client";

import { useEffect, useState } from "react";
import type { ProjectListItem } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────────
//  DELT PROSJEKT-VELGER
//
//  Gjenbrukes av alle moduler som skal knyttes til et prosjekt. Rapportering,
//  "minijuristen" og "massehåndtering" importerer bare denne og får samme
//  dropdown + samme datakilde (/api/prosjekter). Én kilde til sannhet.
//
//  Bruk:
//    <ProsjektVelger value={projectId} onChange={setProjectId} />
// ────────────────────────────────────────────────────────────────────────────

interface Props {
  value?: string;
  onChange: (projectId: string) => void;
  label?: string;
  className?: string;
}

export default function ProsjektVelger({ value, onChange, label = "Prosjekt", className }: Props) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/prosjekter")
      .then((r) => r.json())
      .then((d) => {
        if (active) setProjects(d.projects ?? []);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-60"
      >
        <option value="" disabled>
          {loading ? "Laster prosjekter…" : "Velg prosjekt"}
        </option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.projectNumber} – {p.name}
            {p.city ? ` (${p.city})` : ""}
          </option>
        ))}
      </select>
      {!loading && projects.length === 0 && (
        <p className="mt-1 text-xs text-slate-500">
          Ingen prosjekter ennå. Opprett ett i Prosjekter-modulen først.
        </p>
      )}
    </div>
  );
}
