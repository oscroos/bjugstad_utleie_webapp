"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ProsjektVelger from "@/components/felles/ProsjektVelger";

export default function MasseInngang() {
  const router = useRouter();
  const [projectId, setProjectId] = useState("");
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">Massehåndtering</h1>
      <p className="mt-1 text-sm text-slate-500">Registrer og spor masseflyttinger per prosjekt. Velg prosjekt.</p>
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <ProsjektVelger value={projectId} onChange={setProjectId} />
        <button
          disabled={!projectId}
          onClick={() => router.push(`/massehandtering/${projectId}`)}
          className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Åpne massehåndtering
        </button>
      </div>
    </div>
  );
}
