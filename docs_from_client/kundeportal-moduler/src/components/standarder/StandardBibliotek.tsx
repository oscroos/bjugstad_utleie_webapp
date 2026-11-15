"use client";

import { useEffect, useState } from "react";

interface Version {
  id: string; version: string; accessType: string;
  sourceUrl: string | null; fileName: string | null;
  contributedToShared: boolean; isLatestHeld: boolean;
}
interface VersionStatus {
  heldVersion: string | null; latestVersion: string | null;
  outdated: boolean; message: string | null;
}
interface Standard {
  id: string; type: string; code: string; title: string;
  publisher: string | null; officialUrl: string | null;
  latestKnownVersion: string | null;
  versions: Version[]; versionStatus: VersionStatus;
}

const TYPE_LABEL: Record<string, string> = { NS: "NS-standard", LAW: "Lov", REGULATION: "Forskrift", OTHER: "Annet" };

export default function StandardBibliotek() {
  const [standards, setStandards] = useState<Standard[]>([]);
  const [expand, setExpand] = useState<string | null>(null);

  async function last() {
    const r = await fetch("/api/standarder");
    const d = await r.json();
    setStandards(d.standards ?? []);
  }
  useEffect(() => { last(); }, []);

  return (
    <div className="space-y-3">
      {standards.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
          Ingen standarder i biblioteket ennå.
        </p>
      )}
      {standards.map((s) => (
        <div key={s.id} className="rounded-xl border border-slate-200 bg-white">
          <button
            onClick={() => setExpand(expand === s.id ? null : s.id)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{TYPE_LABEL[s.type]}</span>
                <span className="font-medium text-slate-900">{s.code}</span>
                <span className="text-sm text-slate-500">{s.title}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Vi har: {s.versionStatus.heldVersion ?? "(ingen)"} · Siste publiserte: {s.latestKnownVersion ?? "ukjent"}
              </div>
            </div>
            {s.versionStatus.outdated && (
              <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-800">
                Nyere finnes
              </span>
            )}
          </button>

          {s.versionStatus.outdated && s.versionStatus.message && (
            <p className="mx-5 mb-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
              ⚠ {s.versionStatus.message}
            </p>
          )}

          {expand === s.id && (
            <div className="border-t border-slate-100 px-5 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Versjoner vi har</p>
              <ul className="mb-4 space-y-1.5">
                {s.versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-sm">
                    <span>
                      v{v.version} · {v.accessType === "LINK" ? "lenke" : "opplastet"}
                      {v.isLatestHeld && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">nyeste</span>}
                      {v.contributedToShared && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">delt</span>}
                    </span>
                    {v.sourceUrl && <a href={v.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-slate-500 underline">åpne</a>}
                  </li>
                ))}
              </ul>
              <LeggTilVersjon standardId={s.id} onDone={last} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LeggTilVersjon({ standardId, onDone }: { standardId: string; onDone: () => void }) {
  const [mode, setMode] = useState<"LINK" | "UPLOAD">("LINK");
  const [form, setForm] = useState({ version: "", sourceUrl: "", fileName: "", extractedText: "" });
  const [share, setShare] = useState(false);
  const felt = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  async function submit() {
    if (!form.version.trim()) return;
    await fetch(`/api/standarder/${standardId}/versjoner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: form.version, accessType: mode,
        sourceUrl: mode === "LINK" ? form.sourceUrl : undefined,
        fileName: mode === "UPLOAD" ? form.fileName : undefined,
        extractedText: mode === "UPLOAD" ? form.extractedText : undefined,
        shareToCommon: share,
      }),
    });
    setForm({ version: "", sourceUrl: "", fileName: "", extractedText: "" });
    setShare(false);
    onDone();
  }

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="mb-2 flex gap-2">
        <button onClick={() => setMode("LINK")} className={`rounded px-3 py-1 text-sm ${mode === "LINK" ? "bg-slate-900 text-white" : "bg-white border border-slate-300"}`}>Lenke (minimum)</button>
        <button onClick={() => setMode("UPLOAD")} className={`rounded px-3 py-1 text-sm ${mode === "UPLOAD" ? "bg-slate-900 text-white" : "bg-white border border-slate-300"}`}>Last opp dokument</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={felt} placeholder="Versjon (f.eks. 2022)" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
        {mode === "LINK" ? (
          <input className={felt} placeholder="Lenke til standard" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} />
        ) : (
          <input className={felt} placeholder="Filnavn" value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} />
        )}
      </div>
      {mode === "UPLOAD" && (
        <>
          <textarea className={`${felt} mt-2`} rows={2} placeholder="Uttrukket tekst (for AI)" value={form.extractedText} onChange={(e) => setForm({ ...form, extractedText: e.target.value })} />
          <label className="mt-2 flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5" />
            <span>Del til fellesbiblioteket slik at alle kunder og AI kan bruke denne versjonen. Ikke huk av for konfidensielt/opphavsrettsbeskyttet materiale du ikke har rett til å dele.</span>
          </label>
        </>
      )}
      <button onClick={submit} disabled={!form.version.trim()} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        Legg til versjon
      </button>
    </div>
  );
}
