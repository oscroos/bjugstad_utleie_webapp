"use client";

import { useEffect, useState, useCallback } from "react";

// ────────────────────────────────────────────────────────────────────────────
//  CO2-/MILJØREGNSKAP – dashboard
//  Dimensjoner: sted / prosjekt / UE / leide / egne / egne+leide / alle.
// ────────────────────────────────────────────────────────────────────────────

interface Co2Result {
  totalKgCo2e: number;
  byOwnership: Record<string, number>;
  byFuelType: Record<string, number>;
  byProject: Record<string, number>;
  transportKgCo2e: number;
  lines: { key: string; ownership: string; fuelType: string; amount: number; unit: string; kgCo2e: number }[];
}

const SCOPES: { value: string; label: string }[] = [
  { value: "ALL", label: "Alle (egne + leide + UE)" },
  { value: "OWNED_RENTED", label: "Egne + leide maskiner" },
  { value: "OWNED", label: "Kun egne maskiner" },
  { value: "RENTED", label: "Kun leide maskiner" },
  { value: "SUBCONTRACTOR", label: "Kun UE" },
];
const OWN_LABEL: Record<string, string> = { OWNED: "Egne", RENTED: "Leide", SUBCONTRACTOR: "UE" };
const FUEL_LABEL: Record<string, string> = {
  DIESEL: "Diesel", HVO: "HVO100", ELECTRIC: "Elektrisk", BIOGAS: "Biogass", PETROL: "Bensin", HYDROGEN: "Hydrogen",
};

function tonn(kg: number) {
  return kg >= 1000 ? (kg / 1000).toLocaleString("nb-NO", { maximumFractionDigits: 1 }) + " tonn" : Math.round(kg).toLocaleString("nb-NO") + " kg";
}

export default function MiljoDashboard({
  projectId,
  city,
}: {
  projectId?: string; // satt = prosjektvisning; tom = org-nivå
  city?: string;
}) {
  const [scope, setScope] = useState("ALL");
  const [dim, setDim] = useState<"project" | "city" | "org">(projectId ? "project" : "org");
  const [data, setData] = useState<Co2Result | null>(null);
  const [loading, setLoading] = useState(true);

  const last = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ scope });
    if (dim === "project" && projectId) p.set("projectId", projectId);
    if (dim === "city" && city) p.set("city", city);
    const r = await fetch("/api/miljo/regnskap?" + p.toString());
    setData(await r.json());
    setLoading(false);
  }, [scope, dim, projectId, city]);

  useEffect(() => { last(); }, [last]);

  return (
    <div className="space-y-6">
      {/* Dimensjonsvalg */}
      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Nivå</label>
          <select value={dim} onChange={(e) => setDim(e.target.value as never)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {projectId && <option value="project">Dette prosjektet</option>}
            {city && <option value="city">Sted: {city}</option>}
            <option value="org">Hele selskapet</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Maskiner</label>
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {loading || !data ? (
        <p className="text-sm text-slate-400">Beregner…</p>
      ) : (
        <>
          {/* Nøkkeltall */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Totalt CO2e" value={tonn(data.totalKgCo2e)} />
            <Metric label="Herav transport" value={tonn(data.transportKgCo2e)} />
            <Metric label="Egne" value={tonn(data.byOwnership.OWNED ?? 0)} />
            <Metric label="Leide + UE" value={tonn((data.byOwnership.RENTED ?? 0) + (data.byOwnership.SUBCONTRACTOR ?? 0))} />
          </div>

          {/* Fordeling per eierskap og drivstoff */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Fordeling title="Per eierskap" rows={Object.entries(data.byOwnership).map(([k, v]) => [OWN_LABEL[k] ?? k, v])} total={data.totalKgCo2e} />
            <Fordeling title="Per energikilde" rows={Object.entries(data.byFuelType).map(([k, v]) => [FUEL_LABEL[k] ?? k, v])} total={data.totalKgCo2e} />
          </div>

          {/* Per prosjekt (relevant på sted/org-nivå) */}
          {dim !== "project" && Object.keys(data.byProject).length > 0 && (
            <Fordeling title="Per prosjekt" rows={Object.entries(data.byProject)} total={data.totalKgCo2e} />
          )}

          {/* Største utslippskilder */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <p className="border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700">Største kilder</p>
            <ul className="divide-y divide-slate-100">
              {data.lines.slice(0, 8).map((l, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span>
                    {l.key}
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{OWN_LABEL[l.ownership] ?? l.ownership}</span>
                  </span>
                  <span className="text-slate-600">{tonn(l.kgCo2e)}</span>
                </li>
              ))}
              {data.lines.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-slate-400">
                  Ingen forbruksdata registrert ennå. Registrer drivstoff/energi under, eller la felt-appen synke inn data.
                </li>
              )}
            </ul>
          </div>

          <p className="text-xs text-slate-400">
            Beregnet med standard utslippsfaktorer (kan overstyres i EmissionFactor-tabellen).
            Verifiser faktorene mot gjeldende offisielle kilder før bruk i anbud eller ekstern rapportering.
          </p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-100 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Fordeling({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  const sorted = rows.sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-sm font-medium text-slate-700">{title}</p>
      <div className="space-y-2">
        {sorted.map(([label, kg]) => {
          const pct = total > 0 ? Math.round((kg / total) * 100) : 0;
          return (
            <div key={label}>
              <div className="mb-0.5 flex justify-between text-xs text-slate-600">
                <span>{label}</span><span>{tonn(kg)} · {pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-slate-700" style={{ width: pct + "%" }} />
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <p className="text-xs text-slate-400">Ingen data.</p>}
      </div>
    </div>
  );
}
