"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrgSearchResult } from "@/lib/types";

interface Sub {
  id: string;
  scopeOfWork: string | null;
  subcontractorOrg: { id: string; name: string; orgNumber: string | null };
}

export default function UnderentreprenorSok({
  projectId,
  initial,
}: {
  projectId: string;
  initial: Sub[];
}) {
  const router = useRouter();
  const [subs, setSubs] = useState<Sub[]>(initial);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<OrgSearchResult[]>([]);
  const [scope, setScope] = useState("");
  const [picked, setPicked] = useState<OrgSearchResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced søk
  useEffect(() => {
    if (picked) return;
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/organisasjoner/sok?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      setResults(d.results ?? []);
    }, 250);
  }, [q, picked]);

  async function leggTil() {
    if (!picked) return;
    const r = await fetch(`/api/prosjekter/${projectId}/underentreprenorer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subcontractorOrgId: picked.id, scopeOfWork: scope }),
    });
    if (r.ok) {
      const { subcontractor } = await r.json();
      setSubs((s) => [...s, subcontractor]);
      setPicked(null);
      setQ("");
      setScope("");
      setResults([]);
      router.refresh();
    }
  }

  async function fjern(id: string) {
    const r = await fetch(`/api/prosjekter/${projectId}/underentreprenorer?subId=${id}`, {
      method: "DELETE",
    });
    if (r.ok) setSubs((s) => s.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 p-4">
        <p className="mb-2 text-sm font-medium text-slate-700">Legg til underentreprenør (UE)</p>
        {picked ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm">
              {picked.name}
              {picked.orgNumber ? ` · ${picked.orgNumber}` : ""}
              <button className="ml-2 text-slate-500 hover:text-slate-900" onClick={() => setPicked(null)}>
                endre
              </button>
            </div>
            <input
              placeholder="Fagområde / arbeidsomfang"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              onClick={leggTil}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Legg til
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              placeholder="Søk selskap i portalen (navn eller org.nr)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            {results.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                {results.map((o) => (
                  <li key={o.id}>
                    <button
                      onClick={() => setPicked(o)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span>{o.name}</span>
                      <span className="text-xs text-slate-500">{o.orgNumber ?? o.city ?? ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {subs.length === 0 ? (
        <p className="text-sm text-slate-500">Ingen underentreprenører lagt til.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {subs.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{s.subcontractorOrg.name}</p>
                <p className="text-xs text-slate-500">
                  {s.subcontractorOrg.orgNumber ?? ""}
                  {s.scopeOfWork ? ` · ${s.scopeOfWork}` : ""}
                </p>
              </div>
              <button onClick={() => fjern(s.id)} className="text-sm text-red-600 hover:underline">
                Fjern
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
