"use client";

import { useEffect, useState } from "react";

interface Row {
  requirementId: string;
  title: string;
  source: string;
  interval: string;
  recipientInstance: string | null;
  dueDate: string;
  status: "OVERDUE" | "DUE_SOON" | "UPCOMING";
}
interface Data {
  overdue: Row[];
  dueSoon: Row[];
  upcoming: Row[];
}

function dato(iso: string) {
  return new Date(iso).toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ForfallsVarsler({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    fetch(`/api/rapportering/forfall?projectId=${projectId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [projectId]);

  if (!data) return null;
  const antall = data.overdue.length + data.dueSoon.length + data.upcoming.length;
  if (antall === 0) return null;

  const Gruppe = ({ tittel, rows, farge }: { tittel: string; rows: Row[]; farge: string }) =>
    rows.length === 0 ? null : (
      <div>
        <p className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${farge}`}>
          {tittel} ({rows.length})
        </p>
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.requirementId} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
              <span className="text-slate-800">{r.title}</span>
              <span className="text-xs text-slate-500">
                {dato(r.dueDate)}
                {r.recipientInstance ? ` · ${r.recipientInstance}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <h3 className="mb-3 font-semibold text-slate-900">Forfall</h3>
      <div className="space-y-4">
        <Gruppe tittel="Forfalt" rows={data.overdue} farge="text-red-600" />
        <Gruppe tittel="Forfaller snart" rows={data.dueSoon} farge="text-orange-600" />
        <Gruppe tittel="Kommende" rows={data.upcoming.slice(0, 5)} farge="text-slate-500" />
      </div>
    </div>
  );
}
