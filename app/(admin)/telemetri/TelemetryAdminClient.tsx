"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  IconArrowUp,
  IconCheck,
  IconEdit,
  IconFilter,
  IconLoader2,
  IconPlus,
  IconSatellite,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  destructiveButtonClass,
  standardButtonClass,
  standardButtonCompactClass,
} from "@/lib/buttonStyles";

const PROVIDERS = [
  "BJUGSTAD",
  "CAT",
  "HYDREMA",
  "TRACKUNIT",
  "TELTONIKA",
  "MICTRACK",
  "VOLVO_CE",
  "KOMATSU",
  "SCANIA",
  "VOLVO_TRUCKS",
  "HITACHI",
  "LIEBHERR",
  "JCB",
  "OTHER",
] as const;

type Provider = (typeof PROVIDERS)[number];

type MachineOption = {
  id: string;
  name: string | null;
  oemName: string | null;
  serialNumber: string | null;
};

export type TelemetryLinkRow = {
  id: string;
  machineId: string;
  provider: Provider;
  externalId: string;
  credentialRef: string | null;
  active: boolean;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  machine: MachineOption;
  _count: {
    positionHistory: number;
  };
};

type ApiResponse = {
  link?: TelemetryLinkRow;
  deleted?: boolean;
  error?: string;
};

type SortKey = "machine" | "provider" | "externalId" | "lastSeenAt" | "status";
type SortConfig = { key: SortKey; direction: "asc" | "desc" } | null;
type FilterKey = "provider" | "status";
type FilterOption = { value: string; label: string };
type FilterState = Partial<Record<FilterKey, Set<string>>>;

const norwegianCollator = new Intl.Collator("nb-NO", {
  numeric: true,
  sensitivity: "base",
});

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

export default function TelemetryAdminClient({
  initialLinks,
  machines,
  ingestionConfigured,
}: {
  initialLinks: TelemetryLinkRow[];
  machines: MachineOption[];
  ingestionConfigured: boolean;
}) {
  const [links, setLinks] = useState(initialLinks);
  const [machineId, setMachineId] = useState(machines[0]?.id ?? "");
  const [provider, setProvider] = useState<Provider>("TELTONIKA");
  const [externalId, setExternalId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [filters, setFilters] = useState<FilterState>({});
  const [machineSearch, setMachineSearch] = useState("");
  const [externalIdSearch, setExternalIdSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TelemetryLinkRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canSubmit = Boolean(machineId && externalId.trim() && !busyKey);
  const providerFilterOptions = useMemo<FilterOption[]>(
    () => [...new Set(links.map((link) => link.provider))]
      .sort((left, right) => norwegianCollator.compare(providerLabel(left), providerLabel(right)))
      .map((value) => ({ value, label: providerLabel(value) })),
    [links],
  );
  const statusFilterOptions = useMemo<FilterOption[]>(() => {
    const statuses = new Set(links.map((link) => link.active ? "active" : "inactive"));
    return [
      ...(statuses.has("active") ? [{ value: "active", label: "Aktiv" }] : []),
      ...(statuses.has("inactive") ? [{ value: "inactive", label: "Inaktiv" }] : []),
    ];
  }, [links]);
  const filteredLinks = useMemo(
    () => links.filter((link) => {
      const normalizedMachineSearch = machineSearch.trim().toLocaleLowerCase("nb-NO");
      if (
        normalizedMachineSearch &&
        !machineLabel(link.machine).toLocaleLowerCase("nb-NO").includes(normalizedMachineSearch)
      ) return false;

      const normalizedIdSearch = externalIdSearch.trim().toLocaleLowerCase("nb-NO");
      if (
        normalizedIdSearch &&
        !link.externalId.toLocaleLowerCase("nb-NO").includes(normalizedIdSearch)
      ) return false;

      const providerFilter = filters.provider;
      if (providerFilter?.size && !providerFilter.has(link.provider)) return false;

      const statusFilter = filters.status;
      const status = link.active ? "active" : "inactive";
      return !statusFilter?.size || statusFilter.has(status);
    }),
    [externalIdSearch, filters, links, machineSearch],
  );
  const displayedLinks = useMemo(
    () => sortTelemetryLinks(filteredLinks, sortConfig),
    [filteredLinks, sortConfig],
  );

  function toggleSort(key: SortKey) {
    setSortConfig((current) => ({
      key,
      direction: current?.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  function toggleFilterValue(key: FilterKey, value: string) {
    setFilters((current) => {
      const selected = new Set(current[key] ?? []);
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
      return { ...current, [key]: selected };
    });
  }

  function toggleAllFilterValues(key: FilterKey, options: FilterOption[]) {
    setFilters((current) => {
      const selected = current[key] ?? new Set<string>();
      const allSelected = options.length > 0 && selected.size === options.length;
      return {
        ...current,
        [key]: allSelected ? new Set<string>() : new Set(options.map((option) => option.value)),
      };
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusyKey(editingId ? `edit-${editingId}` : "create");
    setMessage(null);
    try {
      const response = await requestTelemetry(editingId ? "PATCH" : "POST", editingId
        ? { id: editingId, machineId }
        : { machineId, provider, externalId: externalId.trim() });
      if (!response.link) throw new Error("Ugyldig svar fra serveren");
      setLinks((current) => upsertLink(current, response.link!));
      setMessage({ type: "success", text: editingId ? "Enhetskoblingen er oppdatert." : "Enheten er registrert." });
      cancelEdit();
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  function edit(link: TelemetryLinkRow) {
    setEditingId(link.id);
    setMachineId(link.machineId);
    setProvider(link.provider);
    setExternalId(link.externalId);
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setMachineId(machines[0]?.id ?? "");
    setProvider("TELTONIKA");
    setExternalId("");
  }

  async function toggleActive(link: TelemetryLinkRow) {
    setBusyKey(`active-${link.id}`);
    setMessage(null);
    try {
      const response = await requestTelemetry("PATCH", { id: link.id, active: !link.active });
      if (!response.link) throw new Error("Ugyldig svar fra serveren");
      setLinks((current) => upsertLink(current, response.link!));
      setMessage({
        type: "success",
        text: response.link.active ? "Enheten er aktivert." : "Enheten er deaktivert.",
      });
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  function requestDelete(link: TelemetryLinkRow) {
    if (!canDeleteLink(link)) return;
    setPendingDelete(link);
    setDeleteError(null);
  }

  function cancelDelete() {
    if (busyKey?.startsWith("delete-")) return;
    setPendingDelete(null);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!pendingDelete || !canDeleteLink(pendingDelete)) return;

    const link = pendingDelete;
    setBusyKey(`delete-${link.id}`);
    setDeleteError(null);
    try {
      const response = await requestTelemetry("DELETE", { id: link.id });
      if (!response.deleted) throw new Error("Ugyldig svar fra serveren");
      setLinks((current) => current.filter((item) => item.id !== link.id));
      setPendingDelete(null);
      setMessage({ type: "success", text: "Enhetskoblingen er slettet." });
    } catch (error) {
      setDeleteError(getErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  }

  useEffect(() => {
    if (!pendingDelete) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyKey?.startsWith("delete-")) {
        setPendingDelete(null);
        setDeleteError(null);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [pendingDelete, busyKey]);

  return (
    <div className="space-y-6">
      <div
        className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
          ingestionConfigured
            ? "border-green-200 bg-green-50 text-green-900"
            : "border-amber-200 bg-amber-50 text-amber-950"
        }`}
      >
        <IconSatellite className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">
            {ingestionConfigured ? "GPS-mottak er aktivert" : "GPS-mottak er ikke konfigurert"}
          </p>
          {!ingestionConfigured ? (
            <p className="mt-1">
              Registrering kan klargjøres nå. Eksterne meldinger avvises kontrollert frem til mottaket aktiveres.
            </p>
          ) : null}
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {editingId ? "Flytt enhetskobling" : "Registrer enhet"}
          </h2>
        </div>

        <form onSubmit={submit} className="grid gap-4 p-6 lg:grid-cols-[1.5fr_1fr_1.2fr_auto] lg:items-end">
          <label className="text-sm font-medium text-slate-700">
            Maskin
            <select value={machineId} onChange={(event) => setMachineId(event.target.value)} className={`${inputClass} mt-1`}>
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machineLabel(machine)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Leverandør
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value as Provider)}
              disabled={Boolean(editingId)}
              className={`${inputClass} mt-1 disabled:bg-slate-100 disabled:text-slate-500`}
            >
              {PROVIDERS.map((value) => <option key={value} value={value}>{providerLabel(value)}</option>)}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            {provider === "TELTONIKA" || provider === "MICTRACK" ? "IMEI" : "Ekstern ID"}
            <input
              value={externalId}
              onChange={(event) => setExternalId(event.target.value)}
              disabled={Boolean(editingId)}
              className={`${inputClass} mt-1 disabled:bg-slate-100 disabled:text-slate-500`}
              placeholder={provider === "TELTONIKA" || provider === "MICTRACK" ? "15-sifret IMEI" : "Leverandør-ID"}
            />
          </label>

          <div className="flex gap-2">
            {editingId ? (
              <button type="button" onClick={cancelEdit} className={standardButtonCompactClass} title="Avbryt redigering">
                <IconX className="h-4 w-4" />
                Avbryt
              </button>
            ) : null}
            <button type="submit" disabled={!canSubmit} className={standardButtonClass}>
              {busyKey === "create" || busyKey?.startsWith("edit-") ? (
                <IconLoader2 className="h-5 w-5 animate-spin" />
              ) : editingId ? (
                <IconCheck className="h-5 w-5" />
              ) : (
                <IconPlus className="h-5 w-5" />
              )}
              {editingId ? "Lagre" : "Registrer"}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Registrerte koblinger</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <SortableHeader
                  label="Maskin"
                  sortKey="machine"
                  sortConfig={sortConfig}
                  onSort={toggleSort}
                  padding="px-6"
                  searchValue={machineSearch}
                  onSearchChange={setMachineSearch}
                  searchPlaceholder="Søk på navn, merke eller serienr."
                />
                <SortableHeader
                  label="Leverandør"
                  sortKey="provider"
                  sortConfig={sortConfig}
                  onSort={toggleSort}
                  filterOptions={providerFilterOptions}
                  selectedFilterValues={filters.provider}
                  onToggleFilter={(value) => toggleFilterValue("provider", value)}
                  onToggleAllFilters={() => toggleAllFilterValues("provider", providerFilterOptions)}
                />
                <SortableHeader
                  label="ID / IMEI"
                  sortKey="externalId"
                  sortConfig={sortConfig}
                  onSort={toggleSort}
                  searchValue={externalIdSearch}
                  onSearchChange={setExternalIdSearch}
                  searchPlaceholder="Søk etter ID eller IMEI"
                />
                <SortableHeader label="Sist sett" sortKey="lastSeenAt" sortConfig={sortConfig} onSort={toggleSort} />
                <SortableHeader
                  label="Status"
                  sortKey="status"
                  sortConfig={sortConfig}
                  onSort={toggleSort}
                  filterOptions={statusFilterOptions}
                  selectedFilterValues={filters.status}
                  onToggleFilter={(value) => toggleFilterValue("status", value)}
                  onToggleAllFilters={() => toggleAllFilterValues("status", statusFilterOptions)}
                  filterAlign="right"
                />
                <th className="px-6 py-3 text-right">Handlinger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {links.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">Ingen telemetrienheter er registrert.</td></tr>
              ) : displayedLinks.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">Ingen koblinger matcher filtrene.</td></tr>
              ) : displayedLinks.map((link) => (
                <tr key={link.id} className={link.active ? "" : "bg-slate-50 text-slate-500"}>
                  <td className="px-6 py-3 font-medium text-slate-900">{machineLabel(link.machine)}</td>
                  <td className="px-4 py-3">{providerLabel(link.provider)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{link.externalId}</td>
                  <td className="px-4 py-3">{formatDateTime(link.lastSeenAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${link.active ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"}`}>
                      {link.active ? "Aktiv" : "Inaktiv"}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => edit(link)} className={standardButtonCompactClass} title="Flytt kobling til en annen maskin">
                        <IconEdit className="h-4 w-4" />
                        Flytt
                      </button>
                      <button type="button" onClick={() => toggleActive(link)} disabled={busyKey === `active-${link.id}`} className={standardButtonCompactClass}>
                        {busyKey === `active-${link.id}` ? <IconLoader2 className="h-4 w-4 animate-spin" /> : link.active ? <IconX className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />}
                        {link.active ? "Deaktiver" : "Aktiver"}
                      </button>
                      <button
                        type="button"
                        onClick={() => requestDelete(link)}
                        disabled={!canDeleteLink(link) || busyKey === `delete-${link.id}`}
                        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-red-700 text-white shadow-sm transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
                        aria-label="Slett enhetskoblingen"
                        title={canDeleteLink(link)
                          ? "Slett enhetskoblingen"
                          : "Koblinger som har mottatt eller synkronisert data kan ikke slettes"}
                      >
                        {busyKey === `delete-${link.id}` ? (
                          <IconLoader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <IconTrash className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) cancelDelete();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-telemetry-title"
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h2 id="delete-telemetry-title" className="text-lg font-semibold text-slate-900">
                  Slett enhetskobling?
                </h2>
                <p className="mt-1 text-sm text-slate-600">Handlingen kan ikke angres.</p>
              </div>
              <button
                type="button"
                onClick={cancelDelete}
                disabled={busyKey === `delete-${pendingDelete.id}`}
                className="flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Lukk"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 px-6 py-5 text-sm text-slate-700">
              <p>
                Du er i ferd med å slette koblingen mellom <strong>{machineLabel(pendingDelete.machine)}</strong> og
                {" "}<strong>{providerLabel(pendingDelete.provider)} {pendingDelete.externalId}</strong>.
              </p>
              <p>Dette er bare tillatt fordi koblingen ikke har mottatt eller synkronisert telemetridata.</p>
              {deleteError ? (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800">{deleteError}</p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={cancelDelete}
                disabled={busyKey === `delete-${pendingDelete.id}`}
                className={standardButtonCompactClass}
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busyKey === `delete-${pendingDelete.id}`}
                className={destructiveButtonClass}
              >
                {busyKey === `delete-${pendingDelete.id}` ? (
                  <IconLoader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <IconTrash className="h-5 w-5" />
                )}
                Slett
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {message ? (
        <div className={`fixed bottom-6 right-6 z-50 w-80 rounded-lg border px-4 py-3 shadow-lg ${message.type === "success" ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}>
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      ) : null}
    </div>
  );
}

async function requestTelemetry(method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>): Promise<ApiResponse> {
  const response = await fetch("/api/admin/telemetri", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as ApiResponse;
  if (!response.ok) throw new Error(body.error ?? "Kunne ikke lagre enhetskoblingen");
  return body;
}

function upsertLink(rows: TelemetryLinkRow[], next: TelemetryLinkRow) {
  return rows.some((row) => row.id === next.id)
    ? rows.map((row) => row.id === next.id ? next : row)
    : [...rows, next];
}

function canDeleteLink(link: TelemetryLinkRow) {
  return !link.lastSeenAt && !link.lastSyncAt && link._count.positionHistory === 0;
}

function SortableHeader({
  label,
  sortKey,
  sortConfig,
  onSort,
  padding = "px-4",
  filterOptions,
  selectedFilterValues,
  onToggleFilter,
  onToggleAllFilters,
  filterAlign = "left",
  searchValue,
  onSearchChange,
  searchPlaceholder,
}: {
  label: string;
  sortKey: SortKey;
  sortConfig: SortConfig;
  onSort: (key: SortKey) => void;
  padding?: string;
  filterOptions?: FilterOption[];
  selectedFilterValues?: Set<string>;
  onToggleFilter?: (value: string) => void;
  onToggleAllFilters?: () => void;
  filterAlign?: "left" | "right";
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}) {
  const active = sortConfig?.key === sortKey;
  const [filterOpen, setFilterOpen] = useState(false);
  const filterContainerRef = useRef<HTMLDivElement>(null);
  const hasCheckboxFilter = Boolean(filterOptions && onToggleFilter && onToggleAllFilters);
  const hasSearchFilter = searchValue !== undefined && Boolean(onSearchChange);
  const selectedCount = selectedFilterValues?.size ?? 0;
  const filterActive = hasSearchFilter
    ? Boolean(searchValue?.trim())
    : Boolean(filterOptions?.length && selectedCount > 0 && selectedCount < filterOptions.length);
  const allFiltersSelected = Boolean(
    filterOptions?.length && selectedCount === filterOptions.length,
  );
  const ariaSort = active
    ? sortConfig.direction === "asc" ? "ascending" : "descending"
    : "none";

  useEffect(() => {
    if (!filterOpen) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!filterContainerRef.current?.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setFilterOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [filterOpen]);

  return (
    <th scope="col" className={`${padding} py-3`} aria-sort={ariaSort}>
      <div className="flex items-center gap-2">
        <span>{label}</span>
        <button
          type="button"
          aria-label={`${label} sorter`}
          onClick={() => onSort(sortKey)}
          className={`flex h-6 w-7 cursor-pointer items-center justify-center rounded border border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-700 ${active ? "border-blue-300 bg-blue-100 text-blue-700" : ""}`}
          title={`Sorter etter ${label.toLowerCase()}`}
        >
          <IconArrowUp
            className={`h-3.5 w-3.5 transition-transform ${active && sortConfig.direction === "asc" ? "rotate-180" : "rotate-0"}`}
            aria-hidden="true"
          />
        </button>
        {hasCheckboxFilter || hasSearchFilter ? (
          <div className="relative" ref={filterContainerRef}>
            <button
              type="button"
              aria-label={hasSearchFilter ? `${label} søk` : `${label} filter`}
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((current) => !current)}
              className={`flex h-6 w-7 cursor-pointer items-center justify-center rounded border border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-700 ${filterActive ? "border-blue-300 bg-blue-100 text-blue-700" : ""}`}
              title={hasSearchFilter ? `Søk etter ${label.toLowerCase()}` : `Filtrer etter ${label.toLowerCase()}`}
            >
              {hasSearchFilter ? (
                <IconSearch className="h-4 w-4" aria-hidden="true" />
              ) : (
                <IconFilter className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            {filterOpen ? (
              <div className={`absolute z-20 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ${filterAlign === "right" ? "right-0" : "left-0"}`}>
                <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <span>{hasSearchFilter ? "Søk" : "Filter"}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (hasSearchFilter) onSearchChange?.("");
                      else onToggleAllFilters?.();
                    }}
                    disabled={hasSearchFilter ? !filterActive : filterOptions?.length === 0}
                    className="cursor-pointer text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    {hasSearchFilter ? "Nullstill" : allFiltersSelected ? "Fjern alle" : "Merk alle"}
                  </button>
                </div>
                {hasSearchFilter ? (
                  <div className="border-t border-slate-100 p-3 normal-case">
                    <div className="relative">
                      <IconSearch className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="search"
                        value={searchValue}
                        onChange={(event) => onSearchChange?.(event.target.value)}
                        placeholder={searchPlaceholder ?? `Søk etter ${label.toLowerCase()}`}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        autoFocus
                      />
                    </div>
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto border-t border-slate-100">
                    {filterOptions?.map((option) => (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-normal normal-case text-slate-700 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={selectedFilterValues?.has(option.value) ?? false}
                          onChange={() => onToggleFilter?.(option.value)}
                        />
                        <span className="truncate" title={option.label}>{option.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </th>
  );
}

function sortTelemetryLinks(rows: TelemetryLinkRow[], sortConfig: SortConfig) {
  if (!sortConfig) return rows;

  return [...rows].sort((left, right) => {
    if (sortConfig.key === "lastSeenAt") {
      if (!left.lastSeenAt && !right.lastSeenAt) return 0;
      if (!left.lastSeenAt) return 1;
      if (!right.lastSeenAt) return -1;
    }

    let order = 0;
    switch (sortConfig.key) {
      case "machine":
        order = norwegianCollator.compare(machineLabel(left.machine), machineLabel(right.machine));
        break;
      case "provider":
        order = norwegianCollator.compare(providerLabel(left.provider), providerLabel(right.provider));
        break;
      case "externalId":
        order = norwegianCollator.compare(left.externalId, right.externalId);
        break;
      case "lastSeenAt":
        order = Date.parse(left.lastSeenAt!) - Date.parse(right.lastSeenAt!);
        break;
      case "status":
        order = left.active === right.active ? 0 : left.active ? -1 : 1;
        break;
    }

    return sortConfig.direction === "asc" ? order : -order;
  });
}

function machineLabel(machine: MachineOption) {
  const name = machine.name?.trim() || `Maskin ${machine.id}`;
  const details = [machine.oemName, machine.serialNumber].filter(Boolean).join(" / ");
  return details ? `${name} (${details})` : name;
}

function providerLabel(provider: Provider) {
  return provider.replaceAll("_", " ");
}

function formatDateTime(value: string | null) {
  if (!value) return "Aldri";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Noe gikk galt";
}
