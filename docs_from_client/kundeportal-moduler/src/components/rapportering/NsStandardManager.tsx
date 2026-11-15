"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface NsStandard {
  id: string;
  standardNo: string;
  title: string | null;
  clause: string | null;
  notes: string | null;
}

export default function NsStandardManager({
  projectId,
  initial,
}: {
  projectId: string;
  initial: NsStandard[];
}) {
  const router = useRouter();
  const [standards, setStandards] = useState<NsStandard[]>(initial);
  const [form, setForm] = useState({ standardNo: "", title: "", clause: "", notes: "" });

  async function leggTil() {
    if (!form.standardNo.trim()) return;
    const r = await fetch("/api/rapportering/ns-standarder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ...form }),
    });
    if (r.ok) {
      const { standard } = await r.json();
      setStandards((s) => [...s, standard]);
      setForm({ standardNo: "", title: "", clause: "", notes: "" });
      router.refresh();
    }
  }

  async function fjern(id: string) {
    const r = await fetch(`/api/rapportering/ns-standarder?id=${id}`, { method: "DELETE" });
    if (r.ok) setStandards((s) => s.filter((x) => x.id !== id));
  }

  const felt = "rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-4">
        <input
          className={felt}
          placeholder="NS-nummer (f.eks. NS 8407)"
          value={form.standardNo}
          onChange={(e) => setForm((f) => ({ ...f, standardNo: e.target.value }))}
        />
        <input
          className={felt}
          placeholder="Tittel"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <input
          className={felt}
          placeholder="Punkt/kapittel"
          value={form.clause}
          onChange={(e) => setForm((f) => ({ ...f, clause: e.target.value }))}
        />
        <button
          onClick={leggTil}
          disabled={!form.standardNo.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Legg til
        </button>
      </div>

      {standards.length === 0 ? (
        <p className="text-sm text-slate-500">Ingen NS-standarder lagt inn. AI bruker disse i analysen.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {standards.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {s.standardNo}
                  {s.title ? ` – ${s.title}` : ""}
                </p>
                {s.clause && <p className="text-xs text-slate-500">Punkt {s.clause}</p>}
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
