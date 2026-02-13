"use client";

import { IconLoader2, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { getOEMLogo } from "@/lib/get_OEM_logo";

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

type MachineLocation = {
  id: string | number;
  lat: number | null;
  lng: number | null;
  last_pos_reported_at: string | null;
  name?: string | null;
  oem_name?: string | null;
};

type LocationState = {
  status: "idle" | "loading" | "ready" | "error";
  location: MachineLocation | null;
  error: string | null;
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
  const [locationState, setLocationState] = useState<LocationState>({
    status: "idle",
    location: null,
    error: null,
  });
  const logoSrc = getOEMLogo(localMachine?.make ?? machineLabel);

  useEffect(() => {
    setLocalMachine(machine);
    setLocalError(error);
  }, [machine, error, open]);

  useEffect(() => {
    if (!open || !machineId) {
      setLocationState({ status: "idle", location: null, error: null });
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    async function fetchLocation() {
      setLocationState({ status: "loading", location: null, error: null });

      try {
        const response = await fetch(`/api/machines/${machineId}/location`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          location?: MachineLocation;
          error?: string;
        };

        if (isCancelled) return;

        if (!response.ok) {
          setLocationState({
            status: "error",
            location: null,
            error: payload.error ?? "Kunne ikke hente lokasjon",
          });
          return;
        }

        setLocationState({
          status: "ready",
          location: payload.location ?? null,
          error: null,
        });
      } catch (err) {
        if (isCancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Kunne ikke hente lokasjon";
        setLocationState({ status: "error", location: null, error: message });
      }
    }

    fetchLocation();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [open, machineId]);

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
          <div className="flex items-start gap-4">
            {logoSrc ? (
              <div className="flex items-start">
                <img
                  src={logoSrc}
                  alt={(localMachine?.make ?? machineLabel ?? "OEM") + " logo"}
                  className="h-16 w-auto max-w-[140px] object-contain"
                />
              </div>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Lukk dialog"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          {loading ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <IconLoader2 className="h-5 w-5 animate-spin text-blue-600" />
              Laster maskindetaljer...
            </div>
          ) : localError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {localError}
            </div>
          ) : localMachine ? (
            <>
              <MachineOverview machine={localMachine} currentRenter={currentRenter} />
              <LocationMap machineLabel={machineLabel} state={locationState} />
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
    { label: "Siste jernbanekontroll", value: formatDateTime(machine.railControlDate) },
    { label: "Kontrolldato", value: formatDateTime(machine.controlDate) },
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

function LocationMap({
  machineLabel,
  state,
}: {
  machineLabel?: string;
  state: LocationState;
}) {
  const { status, location, error } = state;
  const lat = location?.lat ?? null;
  const lng = location?.lng ?? null;
  const hasCoords =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);
  const effectiveError =
    error === "Maskin ikke funnet"
      ? "Lokasjon ikke tilgjengelig for denne enheten."
      : error ?? "Kunne ikke hente lokasjon";

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">Lokasjon</h3>
      {status === "loading" ? (
        <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500">
          <IconLoader2 className="h-4 w-4 animate-spin text-blue-600" />
          Henter posisjon...
        </div>
      ) : status === "error" ? (
        <p className="mt-1 text-xs text-slate-500">
          {effectiveError}
        </p>
      ) : hasCoords ? (
        <div className="mt-2 space-y-1 text-sm text-slate-700">
          <p className="text-xs text-slate-500">
            Sist rapportert:{" "}
            <span className="font-semibold text-slate-900">
              {formatDateTime(location?.last_pos_reported_at)}
            </span>
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
          <p className="text-[11px] text-slate-500">Fra maskindatabasen (Azure)</p>
        </div>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          {location
            ? "Ingen gyldige koordinater funnet for denne maskinen."
            : "Koordinater ikke tilgjengelig for denne enheten."}
          {machineLabel ? ` (${machineLabel})` : null}
        </p>
      )}
    </div>
  );
}

function formatValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return value;
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (n: number) => n.toString().padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${day}.${month}.${year} kl. ${hours}:${minutes}`;
}
