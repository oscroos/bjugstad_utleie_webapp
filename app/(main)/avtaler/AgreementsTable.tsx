"use client";

import { useState } from "react";
import DataTable, { type DataColumn } from "@/components/DataTable";
import CustomerAccessDialog, {
  type AccessDialogState,
  type AccessPermissions,
  type CustomerAccessEntry,
  type CustomerDetails,
} from "@/components/dialogs/CustomerAccessDialog";

export type AgreementRow = {
  id: string | number;
  customer?: { id?: string | number; name?: string | null } | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  machines?: Array<{ id?: string | number; name?: string | null }> | null;
};

type AgreementsTableProps = {
  agreements: AgreementRow[];
  emptyMessage?: string;
  viewer?: { id?: string | null; role?: string | null };
};

export default function AgreementsTable({ agreements, emptyMessage, viewer }: AgreementsTableProps) {
  const [dialogState, setDialogState] = useState<AccessDialogState>(createInitialDialogState);
  const [dialogPermissions, setDialogPermissions] = useState<AccessPermissions | undefined>();

  const columns: DataColumn<AgreementRow>[] = [
    {
      id: "id",
      header: "Avtale ID",
      accessor: (agreement) => agreement.id ?? "-",
      cell: (agreement) => (
        <span className="whitespace-nowrap text-slate-700">
          {agreement.id ?? "-"}
        </span>
      ),
      sortValue: (agreement) => agreement.id?.toString() ?? "",
      filterValue: (agreement) => agreement.id?.toString() ?? "-",
      cellClassName: "whitespace-nowrap",
    },
    {
      id: "customer",
      header: "Kunde",
      accessor: (agreement) => agreement.customer?.name ?? "-",
      cell: (agreement) => {
        const label = agreement.customer?.name?.trim() || "Ukjent kunde";
        if (!agreement.customer?.name) {
          return <span className="text-slate-400">-</span>;
        }
        return (
          <PillButton
            label={label}
            onClick={() => handleCustomerClick(agreement.customer)}
          />
        );
      },
      sortValue: (agreement) => agreement.customer?.name?.toLowerCase() ?? "",
      filterValue: (agreement) => agreement.customer?.name?.trim() || "Ukjent kunde",
    },
    {
      id: "startDate",
      header: "Startdato",
      accessor: (agreement) => formatDate(agreement.startDate) ?? "",
      filterType: "date-range",
      dateValue: (agreement) => agreement.startDate,
      cell: (agreement) => (
        <span className="whitespace-pre-line tabular-nums text-slate-700">
          {formatDate(agreement.startDate) ?? "-"}
        </span>
      ),
      sortValue: (agreement) => toTimestamp(agreement.startDate),
      filterValue: (agreement) => formatDate(agreement.startDate) ?? "-",
      cellClassName: "tabular-nums whitespace-pre-line",
    },
    {
      id: "endDate",
      header: "Sluttdato",
      accessor: (agreement) => formatDate(agreement.endDate) ?? "",
      filterType: "date-range",
      dateValue: (agreement) => agreement.endDate,
      cell: (agreement) => (
        <span className="whitespace-pre-line tabular-nums text-slate-700">
          {formatDate(agreement.endDate) ?? "-"}
        </span>
      ),
      sortValue: (agreement) => toTimestamp(agreement.endDate),
      filterValue: (agreement) => formatDate(agreement.endDate) ?? "-",
      cellClassName: "tabular-nums whitespace-pre-line",
    },
    {
      id: "machines",
      header: "Maskiner",
      accessor: (agreement) => agreement.machines?.length ?? 0,
      cell: (agreement) => {
        const machines = agreement.machines ?? [];
        if (!machines.length) {
          return <span className="text-slate-400">Ingen maskiner</span>;
        }
        return (
          <div className="flex flex-wrap gap-2">
            {machines.map((machine, index) => {
              const label =
                machine?.name?.trim() ||
                (machine?.id !== undefined ? `Maskin ${machine.id}` : "Maskin");
              return (
                <PillButton
                  key={`${agreement.id}-machine-${machine?.id ?? index}`}
                  label={label}
                />
              );
            })}
          </div>
        );
      },
      sortValue: (agreement) =>
        (agreement.machines ?? [])
          .map((machine) => machine?.name?.toLowerCase() ?? "")
          .sort()
          .join(", "),
      filterValue: (agreement) =>
        (agreement.machines ?? []).map(
          (machine) => machine?.name?.trim() || "Maskin"
        ),
      cellClassName: "min-w-[12rem]",
    },
  ];

  async function handleCustomerClick(customer?: AgreementRow["customer"]) {
    const rawId = customer?.id;
    const customerId =
      typeof rawId === "string" ? Number.parseInt(rawId, 10) : rawId;

    if (!customerId || Number.isNaN(customerId)) {
      return;
    }

    setDialogState({
      open: true,
      loading: true,
      error: null,
      customerId,
      customerName: customer?.name?.trim() || "Kunde",
      customer: null,
      accesses: [],
    });
    setDialogPermissions(undefined);

    try {
      const [customerDetails, accesses] = await Promise.all([
        fetchCustomerDetails(customerId),
        fetchCustomerAccesses(customerId),
      ]);

      setDialogPermissions(derivePermissions(accesses, viewer));

      setDialogState((prev) => ({
        ...prev,
        loading: false,
        customer: customerDetails,
        accesses,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kunne ikke hente data";
      setDialogState((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
    }
  }

  function resetDialog() {
    setDialogState(createInitialDialogState());
    setDialogPermissions(undefined);
  }

  return (
    <>
      <DataTable
        data={agreements}
        columns={columns}
        getRowId={(agreement, index) => agreement.id?.toString() ?? String(index)}
        emptyMessage={emptyMessage ?? "Ingen avtaler funnet."}
        defaultSort={{ columnId: "startDate", direction: "desc" }}
      />
      <CustomerAccessDialog
        state={dialogState}
        onClose={resetDialog}
        permissions={dialogPermissions}
      />
    </>
  );
}

function PillButton({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex max-w-full cursor-pointer items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-left text-xs font-medium text-blue-800 transition hover:border-blue-300"
    >
      <span className="truncate font-semibold">{label}</span>
    </button>
  );
}

function formatDate(value?: string | Date | null) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${day}.${month}.${year}\nkl. ${hours}:${minutes}`;
}

function toTimestamp(value?: string | Date | null) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function createInitialDialogState(): AccessDialogState {
  return {
    open: false,
    loading: false,
    error: null,
    customerId: null,
    customerName: "",
    customer: null,
    accesses: [],
  };
}

async function fetchCustomerDetails(customerId: number): Promise<CustomerDetails | null> {
  const response = await fetch(`/api/customers/${customerId}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as { customer?: CustomerDetails; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Kunne ikke hente kundeinformasjon");
  }
  return payload.customer ?? null;
}

async function fetchCustomerAccesses(customerId: number): Promise<CustomerAccessEntry[]> {
  const response = await fetch(`/api/customers/${customerId}/accesses`, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as { accesses?: CustomerAccessEntry[]; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Kunne ikke hente tilganger");
  }
  return payload.accesses ?? [];
}

function derivePermissions(
  accesses: CustomerAccessEntry[],
  viewer?: { id?: string | null; role?: string | null },
): AccessPermissions {
  if (viewer?.role === "super_admin") {
    return { canEditRoles: true, canRemoveUsers: true, canSave: true };
  }

  const self = accesses.find((access) => access.userId === viewer?.id);
  if (self?.role === "admin") {
    return { canEditRoles: true, canRemoveUsers: true, canSave: true };
  }

  return { canEditRoles: false, canRemoveUsers: false, canSave: false };
}
