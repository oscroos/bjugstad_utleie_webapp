"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ContractDoc {
  id: string;
  documentId: string;
  fileName: string | null;
  analyzed: boolean;
}

// MERK: Denne komponenten kobler eksisterende dokumenter (fra dokumentmodulen)
// til prosjektet. Erstatt dokument-velgeren under med deres faktiske
// dokumentvelger/-plukker slik at documentId peker på et reelt dokument.
export default function KontraktDokumentImport({
  projectId,
  initial,
  velgbareDokumenter = [],
}: {
  projectId: string;
  initial: ContractDoc[];
  velgbareDokumenter?: { id: string; fileName: string }[];
}) {
  const router = useRouter();
  const [docs, setDocs] = useState<ContractDoc[]>(initial);
  const [documentId, setDocumentId] = useState("");

  async function draInn() {
    if (!documentId) return;
    const valgt = velgbareDokumenter.find((d) => d.id === documentId);
    const r = await fetch("/api/rapportering/kontraktdokumenter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, documentId, fileName: valgt?.fileName }),
    });
    if (r.ok) {
      const { document } = await r.json();
      setDocs((d) => [document, ...d]);
      setDocumentId("");
      router.refresh();
    }
  }

  async function fjern(id: string) {
    const r = await fetch(`/api/rapportering/kontraktdokumenter?id=${id}`, { method: "DELETE" });
    if (r.ok) setDocs((d) => d.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-4">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Dra inn dokument fra dokumentmodulen
          </label>
          <select
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Velg dokument…</option>
            {velgbareDokumenter.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fileName}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={draInn}
          disabled={!documentId}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Dra inn
        </button>
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-slate-500">
          Ingen kontraktdokumenter dratt inn. AI leser disse for kontraktspesifikke krav.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-900">📄 {d.fileName ?? d.documentId}</span>
                {d.analyzed && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                    analysert
                  </span>
                )}
              </div>
              <button onClick={() => fjern(d.id)} className="text-sm text-red-600 hover:underline">
                Fjern
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
