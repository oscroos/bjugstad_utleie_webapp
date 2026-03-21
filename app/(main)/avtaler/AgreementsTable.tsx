"use client";

import { useState } from "react";
import DataTable, { type DataColumn } from "@/components/DataTable";
import CustomerAccessDialog, {
  type AccessDialogState,
  type AccessPermissions,
  type CustomerAccessEntry,
} from "@/components/dialogs/CustomerAccessDialog";
import RentalDetailsDialog, {
  type RentalDialogState,
} from "@/components/dialogs/RentalDetailsDialog";
import MachineDetailsDialog, {
  type MachineDialogState,
  type MachineDetails,
} from "@/components/dialogs/MachineDetailsDialog";
import { fetchCustomerDetails } from "@/lib/api/customers";
import { formatDate } from "@/lib/formatters";

export type AgreementRow = {
  id: string | number;
  customer?: { id?: string | number; name?: string | null } | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  machines?: Array<{ id?: string | number; name?: string | null; make?: string | null }> | null;
};

type AgreementsTableProps = {
  agreements: AgreementRow[];
  emptyMessage?: string;
  viewer?: { id?: string | null; role?: string | null };
};

export default function AgreementsTable({ agreements, emptyMessage, viewer }: AgreementsTableProps) {
  const [dialogState, setDialogState] = useState<AccessDialogState>(createInitialDialogState);
  const [dialogPermissions, setDialogPermissions] = useState<AccessPermissions | undefined>();
  const [machineDialogState, setMachineDialogState] = useState<MachineDialogState>(
    createInitialMachineState,
  );
  const [rentalDialogState, setRentalDialogState] =
    useState<RentalDialogState>(createInitialRentalState);
  const [customerBackToRental, setCustomerBackToRental] = useState(false);
  const [customerBackToMachine, setCustomerBackToMachine] = useState(false);
  const [machineBackToRental, setMachineBackToRental] = useState(false);

  const columns: DataColumn<AgreementRow>[] = [
    {
      id: "id",
      header: "Avtale ID",
      accessor: (agreement) => agreement.id ?? "-",
      cell: (agreement) => {
        const label = agreement.id?.toString() ?? "-";
        return (
          <PillButton
            label={label}
            onClick={() => handleAgreementClick(agreement)}
          />
        );
      },
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
      accessor: (agreement) => formatDate(agreement.startDate, { showTime: false }) ?? "",
      filterType: "date-range",
      dateValue: (agreement) => agreement.startDate,
      cell: (agreement) => (
        <span className="tabular-nums text-slate-700">
          {formatDate(agreement.startDate, { showTime: false }) ?? "-"}
        </span>
      ),
      sortValue: (agreement) => toTimestamp(agreement.startDate),
      filterValue: (agreement) => formatDate(agreement.startDate, { showTime: false }) ?? "-",
      cellClassName: "tabular-nums whitespace-nowrap",
    },
    {
      id: "endDate",
      header: "Sluttdato",
      accessor: (agreement) => formatDate(agreement.endDate, { showTime: false }) ?? "",
      filterType: "date-range",
      dateValue: (agreement) => agreement.endDate,
      cell: (agreement) => (
        <span className="tabular-nums text-slate-700">
          {formatDate(agreement.endDate, { showTime: false }) ?? "-"}
        </span>
      ),
      sortValue: (agreement) => toTimestamp(agreement.endDate),
      filterValue: (agreement) => formatDate(agreement.endDate, { showTime: false }) ?? "-",
      cellClassName: "tabular-nums whitespace-nowrap",
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
              const machineKey = `${agreement.id ?? `agreement-${index}`}-machine-${machine?.id ?? `idx-${index}`}-${index}`;
              return (
                <PillButton
                  key={machineKey}
                  label={label}
                  onClick={() => handleMachineClick(agreement, machine)}
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

  async function handleCustomerClick(
    customer?: AgreementRow["customer"],
    opts?: { fromRental?: boolean; fromMachine?: boolean },
  ) {
    setCustomerBackToRental(Boolean(opts?.fromRental));
    setCustomerBackToMachine(Boolean(opts?.fromMachine));
    if (opts?.fromRental) {
      setRentalDialogState((prev) => ({ ...prev, open: false }));
    }
    if (opts?.fromMachine) {
      setMachineDialogState((prev) => ({ ...prev, open: false }));
    }
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

  function handleAgreementClick(agreement: AgreementRow) {
    setRentalDialogState({
      open: true,
      loading: false,
      error: null,
      rental: {
        rentalId: agreement.id ?? null,
        customerId: agreement.customer?.id ?? null,
        customerName: agreement.customer?.name ?? null,
        startDate: agreement.startDate ?? null,
        endDate: agreement.endDate ?? null,
        machines: agreement.machines ?? [],
      },
    });
  }

  function handleMachineClick(agreement: AgreementRow, machine?: { id?: string | number; name?: string | null; make?: string | null }) {
    setMachineBackToRental(false);
    openMachineDialog(machine, agreement.customer?.name ?? null, agreement.customer?.id ?? null);
  }

  function handleMachineClickFromRental(
    machine?: { id?: string | number; name?: string | null; make?: string | null },
    renter?: string | null,
    renterId?: string | number | null,
  ) {
    setRentalDialogState((prev) => ({ ...prev, open: false }));
    setMachineBackToRental(true);
    openMachineDialog(machine, renter ?? null, renterId ?? null);
  }

  async function openMachineDialog(
    machine?: { id?: string | number; name?: string | null; make?: string | null },
    renter?: string | null,
    renterId?: string | number | null,
  ) {
    const rawId = machine?.id;
    const machineId =
      typeof rawId === "string" ? Number.parseInt(rawId, 10) : rawId;

    if (!machineId || Number.isNaN(machineId)) {
      return;
    }

    const machineLabel =
      machine?.name?.trim() ||
      (machineId !== undefined ? `Maskin ${machineId}` : "Maskin");

    setMachineDialogState({
      open: true,
      loading: true,
      error: null,
      machine: null,
      machineId,
      machineLabel,
      currentRenter: renter ?? null,
      currentRenterId: renterId ?? null,
    });

    try {
      const machineDetails = await fetchMachineDetails(machineId);
      setMachineDialogState((prev) => ({
        ...prev,
        loading: false,
        machine: machineDetails,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kunne ikke hente maskindetaljer";
      setMachineDialogState((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
    }
  }

  function resetDialog() {
    setDialogState(createInitialDialogState());
    setDialogPermissions(undefined);
    setCustomerBackToRental(false);
    setCustomerBackToMachine(false);
  }

  function resetMachineDialog() {
    setMachineDialogState(createInitialMachineState());
    setMachineBackToRental(false);
  }

  function resetRentalDialog() {
    setRentalDialogState(createInitialRentalState());
  }

  function handleCustomerBack() {
    resetDialog();
    setRentalDialogState((prev) => ({ ...prev, open: true }));
  }

  function handleCustomerBackToMachine() {
    resetDialog();
    setMachineDialogState((prev) => ({ ...prev, open: true }));
  }

  function handleMachineBack() {
    resetMachineDialog();
    setRentalDialogState((prev) => ({ ...prev, open: true }));
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
        onBack={
          customerBackToMachine
            ? handleCustomerBackToMachine
            : customerBackToRental
              ? handleCustomerBack
              : undefined
        }
        permissions={dialogPermissions}
      />
      <MachineDetailsDialog
        state={machineDialogState}
        onClose={resetMachineDialog}
        onBack={machineBackToRental ? handleMachineBack : undefined}
        onCustomerClick={(customerId, customerName) =>
          handleCustomerClick(
            { id: customerId ?? undefined, name: customerName ?? undefined },
            { fromMachine: true },
          )
        }
      />
      <RentalDetailsDialog
        state={rentalDialogState}
        onClose={resetRentalDialog}
        onCustomerClick={(customerId, customerName) =>
          handleCustomerClick(
            { id: customerId ?? undefined, name: customerName ?? undefined },
            { fromRental: true },
          )
        }
        onMachineClick={handleMachineClickFromRental}
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

function createInitialMachineState(): MachineDialogState {
  return {
    open: false,
    loading: false,
    error: null,
    machine: null,
    machineId: null,
    machineLabel: "",
    currentRenter: null,
    currentRenterId: null,
  };
}

function createInitialRentalState(): RentalDialogState {
  return {
    open: false,
    loading: false,
    error: null,
    rental: null,
  };
}

async function fetchCustomerAccesses(customerId: number): Promise<CustomerAccessEntry[]> {
  const response = await fetch(`/api/customers/${customerId}/accesses`, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as { accesses?: CustomerAccessEntry[]; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Kunne ikke hente tilganger");
  }
  return payload.accesses ?? [];
}

async function fetchMachineDetails(machineId: number): Promise<MachineDetails | null> {
  const response = await fetch(`/api/machines/${machineId}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as { machine?: MachineDetails; error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Kunne ikke hente maskindetaljer");
  }
  return payload.machine ?? null;
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
