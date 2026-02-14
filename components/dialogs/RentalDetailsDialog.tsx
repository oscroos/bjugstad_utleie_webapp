"use client";

import { IconLoader2, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { getOEMLogo } from "@/lib/get_OEM_logo";

export type RentalDetails = {
  rentalId: string | number | null;
  customerId?: string | number | null;
  customerName?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  createdBy?: string | null;
  weInsure?: boolean | null;
  projectNumber?: string | null;
  location?: string | null;
  machineOperator?: string | null;
  comment?: string | null;
  machines?: Array<{ id?: string | number; name?: string | null; make?: string | null }> | null;
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
  onCustomerClick,
  onMachineClick,
}: {
  state: RentalDialogState;
  onClose: () => void;
  onCustomerClick?: (customerId?: string | number | null, customerName?: string | null) => void;
  onMachineClick?: (
    machine: { id?: string | number; name?: string | null; make?: string | null },
    renter?: string | null,
  ) => void;
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
            <>
              <RentalOverview rental={localRental} onCustomerClick={onCustomerClick} />
              <ContactPersonCard />
              <MachinesIncludedCard
                machines={localRental.machines ?? []}
                renter={localRental.customerName ?? null}
                onMachineClick={onMachineClick}
              />
            </>
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

function RentalOverview({
  rental,
  onCustomerClick,
}: {
  rental: RentalDetails;
  onCustomerClick?: (customerId?: string | number | null, customerName?: string | null) => void;
}) {
  const infoRows = [
    { label: "Kunde", value: rental.customerName },
    { label: "Startdato", value: formatDateOnly(rental.startDate) },
    { label: "Sluttdato", value: formatDateOnly(rental.endDate) },
    { label: "Opprettet av", value: rental.createdBy },
    { label: "Vi forsikrer", value: rental.weInsure === null || rental.weInsure === undefined ? "-" : rental.weInsure ? "Ja" : "Nei" },
    { label: "Projektnummer", value: rental.projectNumber },
    { label: "Plassering", value: rental.location },
    { label: "Maskinfører", value: rental.machineOperator },
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
            <div className="mt-1 text-sm font-medium text-slate-900">
              {row.label === "Kunde" &&
              rental.customerId !== null &&
              rental.customerId !== undefined &&
              rental.customerName &&
              onCustomerClick ? (
                <button
                  type="button"
                  onClick={() => onCustomerClick(rental.customerId, rental.customerName)}
                  className="group inline-flex max-w-full cursor-pointer items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-left text-xs font-medium text-blue-800 transition hover:border-blue-300"
                >
                  <span className="truncate font-semibold">{rental.customerName}</span>
                </button>
              ) : (
                formatValue(row.value)
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Kommentar
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {formatValue(rental.comment)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ContactPersonCard() {
  const contact = {
    name: "Kontaktperson Navn",
    phone: "+47 900 00 000",
    email: "kontakt@example.com",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">Kontaktperson</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {[
          { label: "Navn", value: contact.name },
          { label: "Telefon", value: contact.phone },
          { label: "E-post", value: contact.email },
        ].map((row) => (
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

function MachinesIncludedCard({
  machines,
  renter,
  onMachineClick,
}: {
  machines: Array<{ id?: string | number; name?: string | null; make?: string | null }>;
  renter?: string | null;
  onMachineClick?: (
    machine: { id?: string | number; name?: string | null; make?: string | null },
    renter?: string | null,
  ) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">Maskiner inkludert</h3>
      {machines.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">Ingen maskiner knyttet til avtalen.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {machines.map((machine, index) => {
            const label =
              machine.name?.trim() ||
              (machine.id !== undefined ? `Maskin ${machine.id}` : "Maskin");
            const logoSrc = getOEMLogo(machine.make ?? label);
            const key = `${machine.id ?? "machine"}-${index}`;
            return (
              <div
                key={key}
                className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 shadow-sm"
              >
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white p-1">
                  {logoSrc ? (
                    <img
                      src={logoSrc}
                      alt={`${machine.make ?? label} logo`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      OEM
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <button
                    type="button"
                    onClick={
                      onMachineClick
                        ? () => onMachineClick(machine, renter ?? null)
                        : undefined
                    }
                    className="group inline-flex max-w-full cursor-pointer items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-left text-xs font-medium text-blue-800 transition hover:border-blue-300"
                  >
                    <span className="truncate font-semibold">{label}</span>
                  </button>
                  <div className="flex-1" />
                </div>
              </div>
            );
          })}
        </div>
      )}
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
