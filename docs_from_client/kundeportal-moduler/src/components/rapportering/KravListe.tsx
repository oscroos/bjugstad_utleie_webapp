"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DataField {
  id: string;
  label: string;
  sourceType: string;
  availableInPortal: boolean;
  required: boolean;
  note: string | null;
}
interface Requirement {
  id: string;
  source: string;
  title: string;
  description: string | null;
  legalReference: string | null;
  interval: string;
  intervalDetail: string | null;
  recipientInstance: string | null;
  recipientName: string | null;
  origin: string;
  aiConfidence: number | null;
  aiRationale: string | null;
  status: string;
  dataFields: DataField[];
}
type Grouped = { LAW: Requirement[]; NS_STANDARD: Requirement[]; CONTRACT: Requirement[] };

const INTERVAL: Record<string, string> = {
  ONE_TIME: "Engangs",
  DAILY: "Daglig",
  WEEKLY: "Ukentlig",
  BIWEEKLY: "Annenhver uke",
  MONTHLY: "Månedlig",
  QUARTERLY: "Kvartalsvis",
  SEMI_ANNUAL: "Halvårlig",
  ANNUAL: "Årlig",
  EVENT_BASED: "Hendelsesstyrt",
  CUSTOM: "Egendefinert",
};

const KILDER: { key: keyof Grouped; tittel: string; beskrivelse: string }[] = [
  { key: "LAW", tittel: "Lover og forskrifter", beskrivelse: "Norske myndighetskrav" },
  { key: "NS_STANDARD", tittel: "NS-standarder", beskrivelse: "Standardene du har lagt inn" },
  { key: "CONTRACT", tittel: "Kontraktspesifikt", beskrivelse: "Fra kontraktdokumentene (AI-lest)" },
];

export default function KravListe({ initial }: { initial: Grouped }) {
  const router = useRouter();
  const [data, setData] = useState<Grouped>(initial);

  async function settStatus(req: Requirement, status: "ACTIVE" | "DISMISSED") {
    const r = await fetch("/api/rapportering/krav", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: req.id, status }),
    });
    if (!r.ok) return;
    setData((d) => {
      const list = d[req.source as keyof Grouped];
      const updated =
        status === "DISMISSED"
          ? list.filter((x) => x.id !== req.id)
          : list.map((x) => (x.id === req.id ? { ...x, status } : x));
      return { ...d, [req.source]: updated };
    });
    router.refresh();
  }

  async function settOppRapport(req: Requirement) {
    await fetch("/api/rapportering/rapporter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requirementId: req.id }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {KILDER.map(({ key, tittel, beskrivelse }) => {
        const krav = data[key];
        return (
          <section key={key}>
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="text-lg font-semibold text-slate-900">{tittel}</h2>
              <span className="text-sm text-slate-400">{beskrivelse}</span>
              <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                {krav.length}
              </span>
            </div>

            {krav.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                Ingen krav registrert i denne kategorien ennå.
              </p>
            ) : (
              <ul className="space-y-3">
                {krav.map((req) => (
                  <li
                    key={req.id}
                    className={`rounded-xl border bg-white p-4 ${
                      req.status === "PROPOSED" ? "border-amber-300" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium text-slate-900">{req.title}</h3>
                          {req.status === "PROPOSED" && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                              AI-forslag
                              {req.aiConfidence != null ? ` · ${Math.round(req.aiConfidence * 100)}%` : ""}
                            </span>
                          )}
                        </div>
                        {req.description && (
                          <p className="mt-1 text-sm text-slate-600">{req.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                          <span>🗓 {INTERVAL[req.interval] ?? req.interval}</span>
                          {req.recipientInstance && <span>📮 {req.recipientInstance}</span>}
                          {req.recipientName && <span>👤 {req.recipientName}</span>}
                          {req.legalReference && <span>§ {req.legalReference}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Datagrunnlag: portal vs manuelt */}
                    {req.dataFields.length > 0 && (
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <DataBøtte
                          tittel="Hentes fra portalen"
                          farge="green"
                          felter={req.dataFields.filter((f) => f.availableInPortal)}
                        />
                        <DataBøtte
                          tittel="Må legges inn av deg"
                          farge="orange"
                          felter={req.dataFields.filter((f) => !f.availableInPortal)}
                        />
                      </div>
                    )}

                    {req.aiRationale && req.status === "PROPOSED" && (
                      <p className="mt-3 border-l-2 border-slate-200 pl-3 text-xs italic text-slate-500">
                        {req.aiRationale}
                      </p>
                    )}

                    {/* Handlinger */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {req.status === "PROPOSED" ? (
                        <>
                          <button
                            onClick={() => settStatus(req, "ACTIVE")}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                          >
                            Bekreft krav
                          </button>
                          <button
                            onClick={() => settStatus(req, "DISMISSED")}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                          >
                            Avvis
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => settOppRapport(req)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Sett opp rapport
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DataBøtte({
  tittel,
  farge,
  felter,
}: {
  tittel: string;
  farge: "green" | "orange";
  felter: DataField[];
}) {
  const stil =
    farge === "green"
      ? "border-emerald-200 bg-emerald-50"
      : "border-orange-200 bg-orange-50";
  return (
    <div className={`rounded-lg border ${stil} p-3`}>
      <p className="mb-1.5 text-xs font-semibold text-slate-700">{tittel}</p>
      {felter.length === 0 ? (
        <p className="text-xs text-slate-400">—</p>
      ) : (
        <ul className="space-y-1">
          {felter.map((f) => (
            <li key={f.id} className="text-xs text-slate-700">
              • {f.label}
              {f.note && <span className="text-slate-400"> — {f.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
