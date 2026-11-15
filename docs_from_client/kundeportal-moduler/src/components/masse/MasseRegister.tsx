"use client";

import { useEffect, useState } from "react";

interface Movement {
  id: string; massType: string; classification: string; volumeM3: number | null;
  originLocation: string | null; destinationName: string | null; transporter: string | null;
  declarationRef: string | null; status: string;
}

const KLASSE: Record<string, { label: string; farge: string }> = {
  CLEAN: { label: "Rene", farge: "bg-emerald-100 text-emerald-700" },
  CONTAMINATED: { label: "Forurenset", farge: "bg-orange-100 text-orange-700" },
  HAZARDOUS: { label: "Farlig avfall", farge: "bg-red-100 text-red-700" },
  UNKNOWN: { label: "Uklassifisert", farge: "bg-slate-100 text-slate-600" },
};
const STATUS: Record<string, string> = { PLANNED: "Planlagt", IN_TRANSIT: "Under transport", DELIVERED: "Levert", REJECTED: "Avvist" };

export default function MasseRegister({ projectId }: { projectId: string }) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [form, setForm] = useState({
    massType: "", classification: "UNKNOWN", volumeM3: "",
    originLocation: "", destinationName: "", transporter: "", declarationRef: "",
  });
  const felt = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  async function last() {
    const r = await fetch(`/api/massehandtering?projectId=${projectId}`);
    const d = await r.json();
    setMovements(d.movements ?? []);
    setSummary(d.summary ?? {});
  }
  useEffect(() => { last(); }, [projectId]);

  async function opprett() {
    if (!form.massType.trim()) return;
    const r = await fetch("/api/massehandtering", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ...form, volumeM3: form.volumeM3 ? Number(form.volumeM3) : null }),
    });
    if (r.ok) {
      setForm({ massType: "", classification: "UNKNOWN", volumeM3: "", originLocation: "", destinationName: "", transporter: "", declarationRef: "" });
      last();
    }
  }

  async function settStatus(id: string, status: string) {
    await fetch("/api/massehandtering", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    last();
  }

  return (
    <div className="space-y-6">
      {/* Oppsummering */}
      {Object.keys(summary).length > 0 && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(summary).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-500">{KLASSE[k]?.label ?? k}</p>
              <p className="text-lg font-semibold text-slate-900">{v.toLocaleString("nb-NO")} m³</p>
            </div>
          ))}
        </div>
      )}

      {/* Skjema */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-slate-700">Ny masseflytting</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <input className={felt} placeholder="Massetype (f.eks. jord)" value={form.massType} onChange={(e) => setForm({ ...form, massType: e.target.value })} />
          <select className={felt} value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })}>
            {Object.entries(KLASSE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input className={felt} type="number" placeholder="Volum (m³)" value={form.volumeM3} onChange={(e) => setForm({ ...form, volumeM3: e.target.value })} />
          <input className={felt} placeholder="Fra (sted)" value={form.originLocation} onChange={(e) => setForm({ ...form, originLocation: e.target.value })} />
          <input className={felt} placeholder="Mottak/deponi" value={form.destinationName} onChange={(e) => setForm({ ...form, destinationName: e.target.value })} />
          <input className={felt} placeholder="Transportør" value={form.transporter} onChange={(e) => setForm({ ...form, transporter: e.target.value })} />
          <input className={`${felt} col-span-2 sm:col-span-3`} placeholder="Avfallsdeklarering (referanse, ved forurenset)" value={form.declarationRef} onChange={(e) => setForm({ ...form, declarationRef: e.target.value })} />
        </div>
        {(form.classification === "CONTAMINATED" || form.classification === "HAZARDOUS") && !form.declarationRef && (
          <p className="mt-2 text-xs text-orange-700">
            Forurensede/farlige masser krever normalt avfallsdeklarering og godkjent mottak. Legg inn referanse.
          </p>
        )}
        <button onClick={opprett} disabled={!form.massType.trim()} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          Registrer
        </button>
      </div>

      {/* Liste */}
      {movements.length === 0 ? (
        <p className="text-sm text-slate-500">Ingen masseflyttinger registrert.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2">Type</th><th className="px-4 py-2">Klasse</th>
                <th className="px-4 py-2">Volum</th><th className="px-4 py-2">Mottak</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2.5">{m.massType}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${KLASSE[m.classification]?.farge}`}>
                      {KLASSE[m.classification]?.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{m.volumeM3 ? `${m.volumeM3} m³` : "—"}</td>
                  <td className="px-4 py-2.5">{m.destinationName ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <select value={m.status} onChange={(e) => settStatus(m.id, e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-xs">
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
