"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconChevronLeft, IconLoader2, IconX } from "@tabler/icons-react";
import { formatDisplay, formatPhone, normalizePhone } from "@/lib/formatters";

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

type CustomerAgreementSummary = {
  id: string;
  customerId?: number | null;
  customerName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  comment?: string | null;
  projectNumber?: string | null;
  contactPersonName?: string | null;
  contactPersonTelephoneNumber?: string | null;
  contactPersonEmail?: string | null;
  customerContactPersonId?: string | number | null;
  customerContactPersonName?: string | null;
  customerContactPersonTelephoneNumber?: string | null;
  customerContactPersonEmail?: string | null;
  insuranceIncluded?: boolean | null;
  contractPrice?: boolean | null;
  location?: string | null;
  createdBy?: string | null;
  createdByTelephoneNumber?: string | null;
  machines: Array<{ id?: string; name?: string | null; make?: string | null }>;
};

export default function CustomerAccessDialog({
  state,
  onClose,
  permissions,
  onBack,
  onAgreementClick,
  onMachineClick,
}: {
  state: AccessDialogState;
  onClose: () => void;
  permissions?: AccessPermissions;
  onBack?: () => void;
  onAgreementClick?: (agreement: CustomerAgreementSummary) => void;
  onMachineClick?: (machine: {
    id?: string | number | null;
    name?: string | null;
    make?: string | null;
  }) => void;
}) {
  const { open, loading, error, customer, accesses, customerId, customerName } = state;
  const [entries, setEntries] = useState<CustomerAccessEntry[]>(accesses);
  const agreementsCacheRef = useRef<Record<number, CustomerAgreementSummary[]>>({});
  const [agreementsState, setAgreementsState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    agreements: CustomerAgreementSummary[];
    error: string | null;
  }>({
    status: "idle",
    agreements: [],
    error: null,
  });
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

  useEffect(() => {
    if (!customerId) {
      setAgreementsState({ status: "idle", agreements: [], error: null });
      return;
    }
    if (!open) return;

    const currentCustomerId = customerId;

    if (agreementsCacheRef.current[currentCustomerId]) {
      setAgreementsState({
        status: "ready",
        agreements: agreementsCacheRef.current[currentCustomerId],
        error: null,
      });
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    async function fetchAgreements() {
      setAgreementsState({ status: "loading", agreements: [], error: null });

      try {
        const response = await fetch("/api/agreements", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          active?: Array<{
            id: string;
            customerId?: number;
            customerName?: string | null;
            startDate?: string | null;
            endDate?: string | null;
            comment?: string | null;
            projectNumber?: string | null;
            contactPersonName?: string | null;
            contactPersonTelephoneNumber?: string | null;
            contactPersonEmail?: string | null;
            customerContactPersonId?: string | number | null;
            customerContactPersonName?: string | null;
            customerContactPersonTelephoneNumber?: string | null;
            customerContactPersonEmail?: string | null;
            insuranceIncluded?: boolean | null;
            contractPrice?: boolean | null;
            location?: string | null;
            createdBy?: string | null;
            createdByTelephoneNumber?: string | null;
            machines?: Array<{ id?: string; name?: string | null; make?: string | null }>;
          }>;
          historical?: Array<{
            id: string;
            customerId?: number;
            customerName?: string | null;
            startDate?: string | null;
            endDate?: string | null;
            comment?: string | null;
            projectNumber?: string | null;
            contactPersonName?: string | null;
            contactPersonTelephoneNumber?: string | null;
            contactPersonEmail?: string | null;
            customerContactPersonId?: string | number | null;
            customerContactPersonName?: string | null;
            customerContactPersonTelephoneNumber?: string | null;
            customerContactPersonEmail?: string | null;
            insuranceIncluded?: boolean | null;
            contractPrice?: boolean | null;
            location?: string | null;
            createdBy?: string | null;
            createdByTelephoneNumber?: string | null;
            machines?: Array<{ id?: string; name?: string | null; make?: string | null }>;
          }>;
          error?: string;
        };

        if (isCancelled) return;

        if (!response.ok) {
          setAgreementsState({
            status: "error",
            agreements: [],
            error: payload.error ?? "Kunne ikke hente leieavtaler",
          });
          return;
        }

        const agreements = [
          ...(payload.active ?? []).map((agreement) => ({ ...agreement, isActive: true })),
          ...(payload.historical ?? []).map((agreement) => ({ ...agreement, isActive: false })),
        ]
          .filter((agreement) => agreement.customerId === currentCustomerId)
          .map((agreement) => ({
            id: agreement.id,
            customerId: agreement.customerId ?? null,
            customerName: agreement.customerName ?? null,
            startDate: agreement.startDate ?? null,
            endDate: agreement.endDate ?? null,
            isActive: agreement.isActive,
            comment: agreement.comment ?? null,
            projectNumber: agreement.projectNumber ?? null,
            contactPersonName: agreement.contactPersonName ?? null,
            contactPersonTelephoneNumber: agreement.contactPersonTelephoneNumber ?? null,
            contactPersonEmail: agreement.contactPersonEmail ?? null,
            customerContactPersonId: agreement.customerContactPersonId ?? null,
            customerContactPersonName: agreement.customerContactPersonName ?? null,
            customerContactPersonTelephoneNumber:
              agreement.customerContactPersonTelephoneNumber ?? null,
            customerContactPersonEmail: agreement.customerContactPersonEmail ?? null,
            insuranceIncluded: agreement.insuranceIncluded ?? null,
            contractPrice: agreement.contractPrice ?? null,
            location: agreement.location ?? null,
            createdBy: agreement.createdBy ?? null,
            createdByTelephoneNumber: agreement.createdByTelephoneNumber ?? null,
            machines: agreement.machines ?? [],
          }))
          .sort(compareCustomerAgreements);

        agreementsCacheRef.current[currentCustomerId] = agreements;
        setAgreementsState({
          status: "ready",
          agreements,
          error: null,
        });
      } catch (err) {
        if (isCancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Kunne ikke hente leieavtaler";
        setAgreementsState({ status: "error", agreements: [], error: message });
      }
    }

    fetchAgreements();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [open, customerId]);

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
          <div className="flex items-start gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="mt-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                aria-label="Tilbake"
              >
                <IconChevronLeft className="h-4 w-4" />
              </button>
            ) : null}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kunde</p>
              <h2 className="text-2xl font-semibold text-slate-900">{customerName || "Kunde"}</h2>
              {customerId ? <p className="text-sm text-slate-500">ID: {customerId}</p> : null}
            </div>
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
              Laster kundeinformasjon og tilganger...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : (
            <>
              <CustomerOverview customer={customer} />
              <CustomerAgreementsSection
                state={agreementsState}
                onAgreementClick={onAgreementClick}
                onMachineClick={onMachineClick}
              />
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
                        <IconLoader2 className="h-4 w-4 animate-spin" />
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

  const contactPersons = customer.contactPersons ?? [];
  const contactListScrollable = contactPersons.length > 4;

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
            <p className="mt-1 text-sm font-medium text-slate-900">{row.value || "-"}</p>
          </div>
        ))}
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 shadow-sm sm:col-span-2 md:col-span-3">
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

      {contactPersons.length ? (
        <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Kontaktpersoner
          </p>
          <div className={contactListScrollable ? "mt-2 max-h-64 overflow-y-auto pr-2" : "mt-2"}>
            <ul className="space-y-2 text-sm text-slate-700">
              {contactPersons.map((person) => (
                <li
                  key={person.contactPersonId}
                  className="rounded border border-slate-200 bg-white px-3 py-2"
                >
                  <div className="font-semibold text-slate-900">{formatDisplay(person.name, "Ukjent navn")}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {person.telephoneNumber ? (
                    <span>
                      {formatPhone(normalizePhone(person.telephoneNumber) ?? person.telephoneNumber)}
                    </span>
                  ) : null}
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
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Brukertilganger</h3>
        <span className="text-sm text-slate-500">
          {accesses.length} bruker{accesses.length === 1 ? "" : "e"}
        </span>
      </div>

      {accesses.length === 0 ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Ingen registrerte tilganger for denne kunden.
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {accesses.map((access) => (
            <div
              key={access.userId}
              className="flex items-center gap-3"
            >
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 shadow-sm">
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
                  className="cursor-pointer rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                >
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

function CustomerAgreementsSection({
  state,
  onAgreementClick,
  onMachineClick,
}: {
  state: { status: "idle" | "loading" | "ready" | "error"; agreements: CustomerAgreementSummary[]; error: string | null };
  onAgreementClick?: (agreement: CustomerAgreementSummary) => void;
  onMachineClick?: (machine: {
    id?: string | number | null;
    name?: string | null;
    make?: string | null;
  }) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">Tilknyttede leieavtaler</h3>
      {state.status === "loading" ? (
        <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500">
          <IconLoader2 className="h-4 w-4 animate-spin text-blue-600" />
          Laster leieavtaler...
        </div>
      ) : state.status === "error" ? (
        <p className="mt-1 text-xs text-slate-500">{state.error ?? "Kunne ikke hente leieavtaler"}</p>
      ) : state.agreements.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">Ingen leieavtaler funnet for denne kunden.</p>
      ) : (
        <div className={state.agreements.length > 4 ? "mt-3 max-h-[14rem] overflow-y-auto pr-2" : "mt-3"}>
          <table className="min-w-full border-separate border-spacing-y-0 text-sm">
              <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Leieavtale</th>
                  <th className="px-3 py-2">Maskiner</th>
                  <th className="py-2 pr-0.5 text-right">Startdato</th>
                  <th className="w-px px-1 py-2" aria-label="Varighet" />
                  <th className="py-2 pl-0.5 text-left">Sluttdato</th>
                </tr>
              </thead>
              <tbody>
                {state.agreements.map((agreement) => (
                  <tr key={agreement.id}>
                    <td className="border-b border-slate-100 bg-white px-3 py-3 text-slate-900">
                      <button
                        type="button"
                        onClick={() => onAgreementClick?.(agreement)}
                        className={`inline-flex max-w-full items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-left text-xs font-medium text-blue-800 ${onAgreementClick ? "cursor-pointer" : "cursor-default"}`}
                        disabled={!onAgreementClick}
                      >
                        <span className="truncate font-semibold">{agreement.id}</span>
                      </button>
                    </td>
                    <td className="border-b border-slate-100 bg-white px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        {agreement.machines.length ? (
                          agreement.machines.map((machine, index) => (
                            <button
                              key={`${agreement.id}-machine-${machine.id ?? "unknown"}-${index}`}
                              type="button"
                              onClick={() => onMachineClick?.(machine)}
                              className={`inline-flex max-w-full items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 ${onMachineClick ? "cursor-pointer" : "cursor-default"}`}
                              disabled={!onMachineClick}
                            >
                              <span className="truncate font-semibold">
                                {machine.name?.trim() || (machine.id ? `Maskin ${machine.id}` : "Maskin")}
                              </span>
                            </button>
                          ))
                        ) : (
                          <span className="text-slate-500">Ingen maskiner</span>
                        )}
                      </div>
                    </td>
                  <td className="border-b border-slate-100 bg-white py-3 pr-0.5 text-right text-slate-700 whitespace-nowrap">
                    {formatDateOnly(agreement.startDate)}
                  </td>
                  <td className="w-px border-b border-slate-100 bg-white px-1 py-3">
                    <AgreementDurationIndicator
                      startDate={agreement.startDate}
                      endDate={agreement.endDate}
                    />
                  </td>
                  <td className="border-b border-slate-100 bg-white py-3 pl-0.5 text-left text-slate-700 whitespace-nowrap">
                    {agreement.endDate ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{formatDateOnly(agreement.endDate)}</span>
                        {agreement.isActive ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                            Aktiv
                          </span>
                        ) : null}
                      </div>
                    ) : agreement.isActive ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                        Aktiv
                      </span>
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

function compareCustomerAgreements(a: CustomerAgreementSummary, b: CustomerAgreementSummary) {
  if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
  const byStart = (toTimestamp(b.startDate) ?? 0) - (toTimestamp(a.startDate) ?? 0);
  if (byStart !== 0) return byStart;
  return (toTimestamp(b.endDate) ?? 0) - (toTimestamp(a.endDate) ?? 0);
}

function toTimestamp(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function formatDateOnly(value?: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function formatAgreementDuration(startDate?: string | Date | null, endDate?: string | Date | null) {
  if (!startDate || !endDate) return null;

  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const startOfDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const diffInDays = Math.max(
    0,
    Math.round((endOfDay.getTime() - startOfDay.getTime()) / millisecondsPerDay),
  );

  return `-> ${diffInDays} ${diffInDays === 1 ? "dag" : "dager"}`;
}

function AgreementDurationIndicator({
  startDate,
  endDate,
}: {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}) {
  const label = formatAgreementDuration(startDate, endDate);
  const hasDuration = Boolean(label);
  const durationLabel = label?.replace("-> ", "") ?? "";

  return (
    <div className="flex justify-center">
      {hasDuration ? (
        <div className="flex w-[5.5rem] items-center gap-0 text-slate-400">
          <div className="h-px w-2.5 bg-slate-200" />
          <div className="shrink-0 rounded-full border border-slate-100 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            {durationLabel}
          </div>
          <div className="relative h-px w-2.5 bg-slate-200">
            <span className="absolute -right-px -top-[2px] h-0 w-0 border-b-[3px] border-l-[5px] border-t-[3px] border-b-transparent border-l-slate-200 border-t-transparent" />
          </div>
        </div>
      ) : (
        <span />
      )}
    </div>
  );
}
