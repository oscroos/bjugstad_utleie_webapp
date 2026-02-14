"use client";

import { IconLoader2, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";

export type RentalDetails = {
  rentalId: string | number | null;
  customerName?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
};

export type RentalDialogState = {
  open: boolean;
  loading: boolean;
  error: string | null;
  rental: RentalDetails | null;
};

export default function RentalDetailsDialog({
  state,
  onClose,
}: {
  state: RentalDialogState;
  onClose: () => void;
}) {
  const { open, loading, error, rental } = state;
  const [localRental, setLocalRental] = useState<RentalDetails | null>(rental);

  useEffect(() => {
    setLocalRental(rental);
  }, [rental, open]);

  if (!open) return null;

  const companyName = localRental?.customerName?.trim() || "Kunde";
  const startLabel = formatDateOnly(localRental?.startDate);
  const headerTitle = startLabel ? `${companyName} - ${startLabel}` : companyName;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avtale</p>
            <h2 className="text-2xl font-semibold text-slate-900">{headerTitle || "Avtale"}</h2>
            {localRental?.rentalId ? (
              <p className="text-sm text-slate-500">ID: {localRental.rentalId}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Lukk dialog"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {loading ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <IconLoader2 className="h-5 w-5 animate-spin text-blue-600" />
              Laster avtaledetaljer...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : localRental ? (
            <RentalOverview rental={localRental} />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Fant ikke avtaledetaljer.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RentalOverview({ rental }: { rental: RentalDetails }) {
  const infoRows = [
    { label: "Kunde", value: rental.customerName },
    { label: "Startdato", value: formatDateOnly(rental.startDate) },
    { label: "Sluttdato", value: formatDateOnly(rental.endDate) },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">Generelt</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {infoRows.map((row) => (
          <div
            key={row.label}
            className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 shadow-sm"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {row.label}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">{formatValue(row.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDateOnly(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return value;
}
