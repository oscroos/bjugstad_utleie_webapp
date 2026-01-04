"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowPathIcon, MinusCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { formatDisplay, formatPhone } from "@/lib/formatters";

export type CustomerContactPerson = {
  contactPersonId: number;
  name?: string | null;
  telephoneNumber?: string | null;
  email?: string | null;
};

export type CustomerDetails = {
  customerId: number;
  name?: string | null;
  email?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  contact?: string | null;
  telephoneNumber?: string | null;
  organizationNumber?: string | null;
  customerNumber?: number | null;
  contactPersons?: CustomerContactPerson[] | null;
};

export type CustomerAccessEntry = {
  userId: string;
  role: "admin" | "user" | string;
  name: string | null;
  phone: string | null;
  email: string | null;
};

export type AccessPermissions = {
  canEditRoles: boolean;
  canRemoveUsers: boolean;
  canSave: boolean;
};

export type AccessDialogState = {
  open: boolean;
  loading: boolean;
  error: string | null;
  customerId: number | null;
  customerName: string;
  customer: CustomerDetails | null;
  accesses: CustomerAccessEntry[];
};

export default function CustomerAccessDialog({
  state,
  onClose,
  permissions,
}: {
  state: AccessDialogState;
  onClose: () => void;
  permissions?: AccessPermissions;
}) {
  const { open, loading, error, customer, accesses, customerId, customerName } = state;
  const [entries, setEntries] = useState<CustomerAccessEntry[]>(accesses);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const effectivePermissions = permissions ?? {
    canEditRoles: true,
    canRemoveUsers: true,
    canSave: true,
  };

  useEffect(() => {
    setEntries(accesses);
    setSaveError(null);
    setSaving(false);
  }, [accesses, state.open]);

  const isDirty = useMemo(() => {
    if (entries.length !== accesses.length) return true;
    const byId = new Map(entries.map((a) => [a.userId, a.role]));
    return accesses.some((a) => byId.get(a.userId) !== a.role);
  }, [entries, accesses]);

  function toggleRole(userId: string) {
    if (!effectivePermissions.canEditRoles) return;
    setEntries((prev) =>
      prev.map((entry) =>
        entry.userId === userId
          ? { ...entry, role: entry.role === "admin" ? "user" : "admin" }
          : entry,
      ),
    );
  }

  function removeEntry(userId: string) {
    if (!effectivePermissions.canRemoveUsers) return;
    setEntries((prev) => prev.filter((entry) => entry.userId !== userId));
  }

  async function handleSave() {
    if (!effectivePermissions.canSave || !customerId || saving || !isDirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/customers/${customerId}/accesses`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accesses: entries.map((entry) => ({
            userId: entry.userId,
            role: entry.role === "admin" ? "admin" : "user",
          })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? "Kunne ikke lagre endringer");
      }
      onClose();
    } catch (err) {
      console.error("Failed to save accesses", err);
      setSaveError(err instanceof Error ? err.message : "Kunne ikke lagre endringer");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kunde</p>
            <h2 className="text-2xl font-semibold text-slate-900">{customerName || "Kunde"}</h2>
            {customerId ? <p className="text-sm text-slate-500">ID: {customerId}</p> : null}
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
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <ArrowPathIcon className="h-5 w-5 animate-spin text-blue-600" />
              Laster kundeinformasjon og tilganger...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : (
            <>
              <CustomerOverview customer={customer} />
              <CustomerAccessList
                accesses={entries}
                onToggleRole={toggleRole}
                onRemove={removeEntry}
                permissions={effectivePermissions}
              />
              {saveError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {saveError}
                </div>
              ) : null}
              {effectivePermissions.canSave ? (
                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow cursor-pointer ${!isDirty || saving
                      ? "cursor-not-allowed bg-blue-300"
                      : "bg-blue-600 hover:bg-blue-500"
                      }`}
                  >
                    {saving ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        Lagrer...
                      </>
                    ) : (
                      "Lagre"
                    )}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomerOverview({ customer }: { customer: CustomerDetails | null }) {
  if (!customer) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Fant ikke kundeinformasjon.
      </div>
    );
  }

  const addressLines = formatCustomerAddress(customer);

  const infoRows = [
    { label: "Kundenummer", value: formatCustomerNumber(customer.customerNumber) },
    { label: "Org.nr", value: formatDisplay(customer.organizationNumber) },
    { label: "Kontakt", value: formatDisplay(customer.contact) },
    { label: "Telefon", value: formatPhone(customer.telephoneNumber) },
    { label: "E-post", value: formatDisplay(customer.email) },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {infoRows.map((row) => (
          <div key={row.label} className="rounded-lg bg-white px-3 py-2 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {row.label}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">{row.value || "-"}</p>
          </div>
        ))}
        <div className="rounded-lg bg-white px-3 py-2 shadow-sm sm:col-span-2 md:col-span-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Adresse
          </p>
          <div className="mt-1 space-y-0.5 text-sm font-medium text-slate-900">
            {addressLines ? (
              addressLines.map((line, index) => <div key={`address-${index}`}>{line}</div>)
            ) : (
              <span className="text-slate-500">Ikke oppgitt</span>
            )}
          </div>
        </div>
      </div>

      {customer.contactPersons?.length ? (
        <div className="mt-4 rounded-lg bg-white px-3 py-2 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Kontaktpersoner (hentet fra Bjugstad API)
          </p>
          <ul className="mt-2 space-y-2 text-sm text-slate-700">
            {customer.contactPersons.map((person) => (
              <li key={person.contactPersonId} className="rounded border border-slate-200 px-3 py-2">
                <div className="font-semibold text-slate-900">{formatDisplay(person.name, "Ukjent navn")}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {person.telephoneNumber ? <span>{formatPhone(person.telephoneNumber)}</span> : null}
                  {formatDisplay(person.email) !== "-" ? (
                    <>
                      <span className="text-slate-300">&middot;</span>
                      <span className="truncate">{formatDisplay(person.email)}</span>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CustomerAccessList({
  accesses,
  onToggleRole,
  onRemove,
  permissions,
}: {
  accesses: CustomerAccessEntry[];
  onToggleRole: (userId: string) => void;
  onRemove: (userId: string) => void;
  permissions: AccessPermissions;
}) {
  const { canEditRoles, canRemoveUsers } = permissions;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Brukertilganger</h3>
        <span className="text-sm text-slate-500">
          {accesses.length} bruker{accesses.length === 1 ? "" : "e"}
        </span>
      </div>

      {accesses.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          Ingen registrerte tilganger for denne kunden.
        </div>
      ) : (
        <div className="space-y-3">
          {accesses.map((access) => (
            <div
              key={access.userId}
              className="flex items-center gap-3"
            >
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {access.name || "Ukjent bruker"}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{formatPhone(access.phone)}</span>
                    {access.email ? (
                      <>
                        <span className="text-slate-300">&middot;</span>
                        <span className="truncate">{access.email}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                {canEditRoles ? (
                  <button
                    type="button"
                    onClick={() => onToggleRole(access.userId)}
                    className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold cursor-pointer ${access.role === "admin"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-blue-200 bg-blue-50 text-blue-800"
                      }`}
                  >
                    {formatCompanyRole(access.role)}
                  </button>
                ) : (
                  <span
                    className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${access.role === "admin"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-blue-200 bg-blue-50 text-blue-800"
                      }`}
                  >
                    {formatCompanyRole(access.role)}
                  </span>
                )}
              </div>
              {canRemoveUsers ? (
                <button
                  type="button"
                  onClick={() => onRemove(access.userId)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-slate-500 hover:text-red-600 cursor-pointer"
                >
                  <MinusCircleIcon className="h-5 w-5" />
                  Fjern
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatCustomerAddress(customer: Pick<CustomerDetails, "address" | "postalCode" | "city">) {
  const lines: string[] = [];
  if (customer.address) {
    lines.push(customer.address);
  }

  const postalCity = [customer.postalCode, customer.city]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");

  if (postalCity) {
    lines.push(postalCity);
  }

  return lines.length ? lines : undefined;
}

function formatCustomerNumber(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return value.toString();
}

function formatCompanyRole(role: string) {
  switch (role) {
    case "admin":
      return "Selskapsadmin";
    case "user":
      return "Selskapsbruker";
    default:
      return role || "Ukjent";
  }
}
