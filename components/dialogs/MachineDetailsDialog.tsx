"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";

export type MachineDetails = {
  machineId: number;
  make?: string | null;
  model?: string | null;
  productionYear?: string | null;
  number?: string | null;
  category?: string | null;
  registrationNumber?: string | null;
  serialNumber?: string | null;
  location?: string | null;
  railControlDate?: string | null;
  controlDate?: string | null;
  trainingVideos?: string[] | null;
  documentedTrainingVideoUri?: string | null;
  englishDocumentedTrainingVideoUri?: string | null;
};

export type MachineDialogState = {
  open: boolean;
  loading: boolean;
  error: string | null;
  machine: MachineDetails | null;
  machineId: number | null;
  machineLabel: string;
  currentRenter?: string | null;
};

export default function MachineDetailsDialog({
  state,
  onClose,
}: {
  state: MachineDialogState;
  onClose: () => void;
}) {
  const { open, loading, error, machine, machineId, machineLabel, currentRenter } = state;
  const [localMachine, setLocalMachine] = useState<MachineDetails | null>(machine);
  const [localError, setLocalError] = useState<string | null>(error);

  useEffect(() => {
    setLocalMachine(machine);
    setLocalError(error);
  }, [machine, error, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Maskin</p>
            <h2 className="text-2xl font-semibold text-slate-900">{machineLabel || "Maskin"}</h2>
            {machineId ? <p className="text-sm text-slate-500">ID: {machineId}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Lukk dialog"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Laster maskindetaljer...
            </div>
          ) : localError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {localError}
            </div>
          ) : localMachine ? (
            <>
              <MachineOverview machine={localMachine} currentRenter={currentRenter} />
              <LocationMap />
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Fant ikke maskindetaljer.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MachineOverview({
  machine,
  currentRenter,
}: {
  machine: MachineDetails;
  currentRenter?: string | null;
}) {
  const infoRows = [
    { label: "Merke", value: machine.make },
    { label: "Modell", value: machine.model },
    { label: "Årsmodell", value: machine.productionYear },
    { label: "Maskinnummer", value: machine.number },
    { label: "Kategori", value: machine.category },
    { label: "Registreringsnummer", value: machine.registrationNumber },
    { label: "Serienummer", value: machine.serialNumber },
    { label: "Lokasjon (tekst)", value: machine.location },
    { label: "Spor kontroll dato", value: machine.railControlDate },
    { label: "Kontrolldato", value: machine.controlDate },
    { label: "Aktuell leietaker", value: currentRenter },
  ];

  const trainingVideos = [
    ...(machine.trainingVideos ?? []),
    ...(machine.documentedTrainingVideoUri ? [machine.documentedTrainingVideoUri] : []),
    ...(machine.englishDocumentedTrainingVideoUri ? [machine.englishDocumentedTrainingVideoUri] : []),
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {infoRows.map((row) => (
          <div key={row.label} className="rounded-lg bg-white px-3 py-2 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {row.label}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">{formatValue(row.value)}</p>
          </div>
        ))}
      </div>

      {trainingVideos.length ? (
        <div className="mt-4 rounded-lg bg-white px-3 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Opplæringsvideoer
          </p>
          <ul className="mt-2 space-y-1 text-sm text-blue-700">
            {trainingVideos.map((link, index) => (
              <li key={`training-${index}`}>
                <a href={link as string} target="_blank" rel="noreferrer" className="underline">
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function LocationMap() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Lokasjon</h3>
        <p className="text-xs text-slate-500">Kart kommer når koordinater er tilgjengelig.</p>
      </div>
      <div className="h-64 w-full bg-slate-100" />
    </div>
  );
}

function formatValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return value;
}
