"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AiAnalyseKnapp({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function kjør() {
    setLoading(true);
    setError(null);
    setSummary(null);
    const r = await fetch("/api/rapportering/analyser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    setLoading(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.error ?? "Analysen feilet.");
      return;
    }
    const d = await r.json();
    setSummary(d.summary ?? "Analyse fullført.");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-900">AI-kartlegging av rapporteringskrav</h3>
          <p className="mt-1 text-sm text-slate-600">
            AI leser NS-standarder og kontraktdokumenter du har lagt inn, kombinerer med lovkrav,
            og foreslår hva som skal rapporteres, hvor ofte og til hvem. Foreslåtte krav må bekreftes.
          </p>
        </div>
        <button
          onClick={kjør}
          disabled={loading}
          className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Analyserer…" : "Kjør AI-analyse"}
        </button>
      </div>
      {summary && (
        <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-700">{summary}</p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
