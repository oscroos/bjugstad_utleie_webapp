"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface FieldVal {
  label: string;
  value: string | null;
  source?: string;
  note?: string | null;
}
interface ReportContent {
  recipientInstance?: string | null;
  recipientName?: string | null;
  autofilled?: FieldVal[];
  manualInputs?: FieldVal[];
}
interface Report {
  id: string;
  title: string;
  status: string;
  content: ReportContent | null;
  generatedBody: string | null;
  requirement?: { title: string; source: string; legalReference: string | null } | null;
}

const felt = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export default function RapportUtfylling({ report }: { report: Report }) {
  const router = useRouter();
  const content = report.content ?? {};
  const [manual, setManual] = useState<FieldVal[]>(content.manualInputs ?? []);
  const [autofilled, setAutofilled] = useState<FieldVal[]>(content.autofilled ?? []);
  const [body, setBody] = useState(report.generatedBody ?? "");
  const [busy, setBusy] = useState<null | "save" | "generate" | "submit">(null);

  function settManual(i: number, v: string) {
    setManual((m) => m.map((f, idx) => (idx === i ? { ...f, value: v } : f)));
  }
  function settAuto(i: number, v: string) {
    setAutofilled((a) => a.map((f, idx) => (idx === i ? { ...f, value: v } : f)));
  }

  async function lagre() {
    setBusy("save");
    await fetch(`/api/rapportering/rapporter/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { ...content, manualInputs: manual, autofilled } }),
    });
    setBusy(null);
    router.refresh();
  }

  async function generer() {
    setBusy("generate");
    const fields = [
      ...autofilled.map((f) => ({ label: f.label, value: f.value ?? "", source: "portal" })),
      ...manual.map((f) => ({ label: f.label, value: f.value ?? "", source: "manual" })),
    ];
    const r = await fetch(`/api/rapportering/rapporter/${report.id}/generer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    setBusy(null);
    if (r.ok) {
      const d = await r.json();
      setBody(d.generatedBody ?? "");
      router.refresh();
    }
  }

  async function sendInn() {
    setBusy("submit");
    await fetch(`/api/rapportering/rapporter/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generatedBody: body, status: "SUBMITTED" }),
    });
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* Auto-felt fra portalen */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Hentet fra portalen</h2>
        <p className="mb-3 text-sm text-slate-500">
          Forhåndsutfylt fra maskiner/avtaler. Kontroller og juster ved behov.
        </p>
        {autofilled.length === 0 ? (
          <p className="text-sm text-slate-400">Ingen automatiske felt for dette kravet.</p>
        ) : (
          <div className="space-y-3">
            {autofilled.map((f, i) => (
              <div key={i} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <label className="mb-1 block text-sm font-medium text-slate-700">{f.label}</label>
                <input className={felt} value={f.value ?? ""} onChange={(e) => settAuto(i, e.target.value)} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Manuelle felt kunden må fylle */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Må fylles inn</h2>
        <p className="mb-3 text-sm text-slate-500">Data portalen ikke har – legg inn selv.</p>
        {manual.length === 0 ? (
          <p className="text-sm text-slate-400">Ingen manuelle felt.</p>
        ) : (
          <div className="space-y-3">
            {manual.map((f, i) => (
              <div key={i} className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                <label className="mb-1 block text-sm font-medium text-slate-700">{f.label}</label>
                {f.note && <p className="mb-1 text-xs text-slate-500">{f.note}</p>}
                <input className={felt} value={f.value ?? ""} onChange={(e) => settManual(i, e.target.value)} />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={lagre}
          disabled={busy !== null}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === "save" ? "Lagrer…" : "Lagre kladd"}
        </button>
        <button
          onClick={generer}
          disabled={busy !== null}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy === "generate" ? "Genererer…" : "Generer rapporttekst"}
        </button>
      </div>

      {/* Generert tekst */}
      {(body || report.generatedBody) && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Rapporttekst</h2>
          <p className="mb-3 text-sm text-slate-500">Rediger fritt før innsending.</p>
          <textarea
            className="min-h-[240px] w-full rounded-lg border border-slate-300 p-3 font-mono text-sm"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button
            onClick={sendInn}
            disabled={busy !== null || !body}
            className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy === "submit" ? "Sender…" : "Marker som sendt"}
          </button>
        </section>
      )}
    </div>
  );
}
