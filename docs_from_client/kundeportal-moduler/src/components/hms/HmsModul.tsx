"use client";

import { useCallback, useEffect, useState } from "react";

// HMS-modul: RUH/avvik + vernerunder. Data herfra mater SHA-rapportene
// automatisk (availableInPortal=true i rapporteringsmodulen).

interface Ruh {
  id: string; severity: string; title: string; location: string | null;
  occurredAt: string; status: string; source: string;
}
interface Round { id: string; performedAt: string; participants: string; findingsCount: number }
interface Stats { total: number; open: number; lostTimeInjuries: number; bySeverity: Record<string, number> }

const SEV: Record<string, { label: string; farge: string }> = {
  OBSERVATION: { label: "Observasjon", farge: "bg-slate-100 text-slate-600" },
  NEAR_MISS: { label: "Nestenulykke", farge: "bg-amber-100 text-amber-700" },
  INJURY_NO_LOST_TIME: { label: "Skade u/fravær", farge: "bg-orange-100 text-orange-700" },
  INJURY_LOST_TIME: { label: "Skade m/fravær", farge: "bg-red-100 text-red-700" },
  ENVIRONMENTAL: { label: "Miljøhendelse", farge: "bg-emerald-100 text-emerald-700" },
};

export default function HmsModul({ projectId }: { projectId: string }) {
  const [ruh, setRuh] = useState<Ruh[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [notifiableWarning, setNotifiableWarning] = useState(false);
  const [ruhForm, setRuhForm] = useState({ severity: "OBSERVATION", title: "", location: "", occurredAt: "" });
  const [roundForm, setRoundForm] = useState({ performedAt: "", participants: "", findingsCount: "" });

  const felt = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  const last = useCallback(async () => {
    const [r1, r2] = await Promise.all([
      fetch(`/api/hms/ruh?projectId=${projectId}`).then((r) => r.json()),
      fetch(`/api/hms/vernerunder?projectId=${projectId}`).then((r) => r.json()),
    ]);
    setRuh(r1.reports ?? []);
    setStats(r1.stats ?? null);
    setRounds(r2.rounds ?? []);
  }, [projectId]);
  useEffect(() => { last(); }, [last]);

  async function registrerRuh() {
    if (!ruhForm.title.trim() || !ruhForm.occurredAt) return;
    const r = await fetch("/api/hms/ruh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ...ruhForm }),
    });
    if (r.ok) {
      const d = await r.json();
      setNotifiableWarning(Boolean(d.notifiable));
      setRuhForm({ severity: "OBSERVATION", title: "", location: "", occurredAt: "" });
      last();
    }
  }

  async function registrerRunde() {
    if (!roundForm.performedAt || !roundForm.participants.trim()) return;
    const r = await fetch("/api/hms/vernerunder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ...roundForm, findingsCount: Number(roundForm.findingsCount || 0) }),
    });
    if (r.ok) {
      setRoundForm({ performedAt: "", participants: "", findingsCount: "" });
      last();
    }
  }

  return (
    <div className="space-y-8">
      {/* Statistikk – nøyaktig tallene SHA-rapporten trenger */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="RUH totalt" value={String(stats.total)} />
          <Metric label="Åpne" value={String(stats.open)} />
          <Metric label="Skader m/fravær" value={String(stats.lostTimeInjuries)} alert={stats.lostTimeInjuries > 0} />
          <Metric label="Vernerunder" value={String(rounds.length)} />
        </div>
      )}

      {notifiableWarning && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Varslingspliktig hendelse registrert</p>
          <p className="mt-1">Personskade med fravær skal varsles Arbeidstilsynet og byggherre umiddelbart (aml. §5-2). Rapporteringsmodulen har kravet under «Lover og forskrifter».</p>
        </div>
      )}

      {/* RUH-registrering */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-slate-900">RUH / avvik</h2>
        <p className="mb-3 text-sm text-slate-500">Registreringer her fyller SHA-rapportens «antall RUH» automatisk. Felt-appen synker inn hit.</p>
        <div className="mb-3 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-4">
          <select className={felt} value={ruhForm.severity} onChange={(e) => setRuhForm({ ...ruhForm, severity: e.target.value })}>
            {Object.entries(SEV).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input className={felt} placeholder="Kort tittel *" value={ruhForm.title} onChange={(e) => setRuhForm({ ...ruhForm, title: e.target.value })} />
          <input className={felt} placeholder="Sted på anlegget" value={ruhForm.location} onChange={(e) => setRuhForm({ ...ruhForm, location: e.target.value })} />
          <input className={felt} type="datetime-local" value={ruhForm.occurredAt} onChange={(e) => setRuhForm({ ...ruhForm, occurredAt: e.target.value })} />
          <button onClick={registrerRuh} disabled={!ruhForm.title.trim() || !ruhForm.occurredAt} className="col-span-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-4">
            Registrer RUH
          </button>
        </div>
        {ruh.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {ruh.slice(0, 10).map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>
                  {r.title}
                  {r.location && <span className="text-slate-400"> · {r.location}</span>}
                  {r.source === "APP" && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">app</span>}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${SEV[r.severity]?.farge}`}>{SEV[r.severity]?.label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Vernerunder */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Vernerunder</h2>
        <p className="mb-3 text-sm text-slate-500">Antall vernerunder hentes automatisk inn i SHA-rapporten.</p>
        <div className="mb-3 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-4">
          <input className={felt} type="date" value={roundForm.performedAt} onChange={(e) => setRoundForm({ ...roundForm, performedAt: e.target.value })} />
          <input className={`${felt} col-span-2`} placeholder="Deltakere *" value={roundForm.participants} onChange={(e) => setRoundForm({ ...roundForm, participants: e.target.value })} />
          <input className={felt} type="number" placeholder="Antall funn" value={roundForm.findingsCount} onChange={(e) => setRoundForm({ ...roundForm, findingsCount: e.target.value })} />
          <button onClick={registrerRunde} disabled={!roundForm.performedAt || !roundForm.participants.trim()} className="col-span-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-4">
            Registrer vernerunde
          </button>
        </div>
        {rounds.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {rounds.slice(0, 6).map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{new Date(r.performedAt).toLocaleDateString("nb-NO")} · {r.participants}</span>
                <span className="text-xs text-slate-500">{r.findingsCount} funn</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${alert ? "bg-red-50" : "bg-slate-100"}`}>
      <p className={`text-xs ${alert ? "text-red-600" : "text-slate-500"}`}>{label}</p>
      <p className={`mt-1 text-xl font-semibold ${alert ? "text-red-700" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
