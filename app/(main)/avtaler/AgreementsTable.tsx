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
  machines?: Array<{ id?: string | number; name?: string | null; make?: string | null }> | null;
};

type AgreementsTableProps = {
  agreements: AgreementRow[];
  emptyMessage?: string;
  viewer?: { id?: string | null; role?: string | null };
};

type CustomerDialogSnapshot = {
  state: AccessDialogState;
  permissions?: AccessPermissions;
};

type RentalDialogSnapshot = {
  state: RentalDialogState;
  backToMachine: boolean;
  backToCustomer: boolean;
};

type MachineDialogSnapshot = {
  state: MachineDialogState;
  backToRental: boolean;
  backToCustomer: boolean;
};

type DialogHistoryEntry =
  | {
      type: "customer";
      label: string;
      state: AccessDialogState;
      permissions?: AccessPermissions;
      backToRental: boolean;
      backToMachine: boolean;
    }
  | {
      type: "rental";
      label: string;
      state: RentalDialogState;
      backToMachine: boolean;
      backToCustomer: boolean;
    }
  | {
      type: "machine";
      label: string;
      state: MachineDialogState;
      backToRental: boolean;
      backToCustomer: boolean;
    };

type BreadcrumbItem = {
  label: string;
  onClick?: () => void;
};

export default function AgreementsTable({ agreements, emptyMessage, viewer }: AgreementsTableProps) {
  const [dialogState, setDialogState] = useState<AccessDialogState>(createInitialDialogState);
  const [dialogPermissions, setDialogPermissions] = useState<AccessPermissions | undefined>();
  const [dialogHistory, setDialogHistory] = useState<DialogHistoryEntry[]>([]);
  const [customerDialogStack, setCustomerDialogStack] = useState<CustomerDialogSnapshot[]>([]);
  const [machineDialogState, setMachineDialogState] = useState<MachineDialogState>(
    createInitialMachineState,
  );
  const [machineDialogStack, setMachineDialogStack] = useState<MachineDialogSnapshot[]>([]);
  const [rentalDialogState, setRentalDialogState] =
    useState<RentalDialogState>(createInitialRentalState);
  const [rentalDialogStack, setRentalDialogStack] = useState<RentalDialogSnapshot[]>([]);
  const [customerBackToRental, setCustomerBackToRental] = useState(false);
  const [customerBackToMachine, setCustomerBackToMachine] = useState(false);
  const [machineBackToRental, setMachineBackToRental] = useState(false);
  const [machineBackToCustomer, setMachineBackToCustomer] = useState(false);
  const [rentalBackToMachine, setRentalBackToMachine] = useState(false);
  const [rentalBackToCustomer, setRentalBackToCustomer] = useState(false);

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

  function buildCustomerLabel(state: AccessDialogState) {
    return state.customerName?.trim() || "Kunde";
  }

  function buildRentalLabel(state: RentalDialogState) {
    const customerName = state.rental?.customerName?.trim() || "Avtale";
    const startDate = formatDate(state.rental?.startDate, { showTime: false });
    return startDate ? `${customerName} - ${startDate}` : customerName;
  }

  function buildMachineLabel(state: MachineDialogState) {
    return state.machineLabel?.trim() || "Maskin";
  }

  function pushCurrentDialogToHistory() {
    if (dialogState.open) {
      setDialogHistory((prev) => [
        ...prev,
        {
          type: "customer",
          label: buildCustomerLabel(dialogState),
          state: { ...dialogState, open: false },
          permissions: dialogPermissions,
          backToRental: customerBackToRental,
          backToMachine: customerBackToMachine,
        },
      ]);
      return;
    }

    if (rentalDialogState.open) {
      setDialogHistory((prev) => [
        ...prev,
        {
          type: "rental",
          label: buildRentalLabel(rentalDialogState),
          state: { ...rentalDialogState, open: false },
          backToMachine: rentalBackToMachine,
          backToCustomer: rentalBackToCustomer,
        },
      ]);
      return;
    }

    if (machineDialogState.open) {
      setDialogHistory((prev) => [
        ...prev,
        {
          type: "machine",
          label: buildMachineLabel(machineDialogState),
          state: { ...machineDialogState, open: false },
          backToRental: machineBackToRental,
          backToCustomer: machineBackToCustomer,
        },
      ]);
    }
  }

  function restoreDialogFromHistory(entry: DialogHistoryEntry, nextHistory: DialogHistoryEntry[]) {
    setDialogHistory(nextHistory);

    setDialogState(
      entry.type === "customer" ? { ...entry.state, open: true } : createInitialDialogState(),
    );
    setDialogPermissions(entry.type === "customer" ? entry.permissions : undefined);
    setCustomerBackToRental(entry.type === "customer" ? entry.backToRental : false);
    setCustomerBackToMachine(entry.type === "customer" ? entry.backToMachine : false);

    setRentalDialogState(
      entry.type === "rental" ? { ...entry.state, open: true } : createInitialRentalState(),
    );
    setRentalBackToMachine(entry.type === "rental" ? entry.backToMachine : false);
    setRentalBackToCustomer(entry.type === "rental" ? entry.backToCustomer : false);

    setMachineDialogState(
      entry.type === "machine" ? { ...entry.state, open: true } : createInitialMachineState(),
    );
    setMachineBackToRental(entry.type === "machine" ? entry.backToRental : false);
    setMachineBackToCustomer(entry.type === "machine" ? entry.backToCustomer : false);
  }

  function restorePreviousDialogFromHistory() {
    const previousEntry = dialogHistory[dialogHistory.length - 1];
    if (!previousEntry) return;
    restoreDialogFromHistory(previousEntry, dialogHistory.slice(0, -1));
  }

  function getCurrentBreadcrumbs(): BreadcrumbItem[] {
    const items = dialogHistory.map((entry, index) => ({
      label: entry.label,
      onClick: () => restoreDialogFromHistory(entry, dialogHistory.slice(0, index)),
    }));

    if (dialogState.open) {
      items.push({ label: buildCustomerLabel(dialogState), onClick: () => undefined });
    } else if (rentalDialogState.open) {
      items.push({ label: buildRentalLabel(rentalDialogState), onClick: () => undefined });
    } else if (machineDialogState.open) {
      items.push({ label: buildMachineLabel(machineDialogState), onClick: () => undefined });
    }

    return items;
  }

  async function handleCustomerClick(
    customer?: AgreementRow["customer"],
    opts?: { fromRental?: boolean; fromMachine?: boolean },
  ) {
    if (opts?.fromRental || opts?.fromMachine) {
      pushCurrentDialogToHistory();
    }
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

    if (dialogState.customerId !== null && dialogState.customerId !== customerId) {
      setCustomerDialogStack((prev) => [
        ...prev,
        {
          state: { ...dialogState, open: false },
          permissions: dialogPermissions,
        },
      ]);
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

  function handleAgreementClick(agreement: AgreementRow, opts?: { fromMachine?: boolean }) {
    if (opts?.fromMachine) {
      pushCurrentDialogToHistory();
    }
    if (
      rentalDialogState.rental?.rentalId !== null &&
      rentalDialogState.rental?.rentalId !== undefined &&
      rentalDialogState.rental.rentalId !== agreement.id
    ) {
      setRentalDialogStack((prev) => [
        ...prev,
        {
          state: { ...rentalDialogState, open: false },
          backToMachine: rentalBackToMachine,
          backToCustomer: rentalBackToCustomer,
        },
      ]);
    }
    setRentalBackToCustomer(false);
    setRentalBackToMachine(Boolean(opts?.fromMachine));
    if (opts?.fromMachine) {
      setMachineDialogState((prev) => ({ ...prev, open: false }));
    }
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
        comment: agreement.comment ?? null,
        projectNumber: agreement.projectNumber ?? null,
        contactPersonName: agreement.contactPersonName ?? null,
        contactPersonTelephoneNumber: agreement.contactPersonTelephoneNumber ?? null,
        contactPersonEmail: agreement.contactPersonEmail ?? null,
        customerContactPersonId: agreement.customerContactPersonId ?? null,
        customerContactPersonName: agreement.customerContactPersonName ?? null,
        customerContactPersonTelephoneNumber: agreement.customerContactPersonTelephoneNumber ?? null,
        customerContactPersonEmail: agreement.customerContactPersonEmail ?? null,
        insuranceIncluded: agreement.insuranceIncluded ?? null,
        contractPrice: agreement.contractPrice ?? null,
        location: agreement.location ?? null,
        createdBy: agreement.createdBy ?? null,
        createdByTelephoneNumber: agreement.createdByTelephoneNumber ?? null,
        machines: agreement.machines ?? [],
      },
    });
  }

  function handleMachineClick(agreement: AgreementRow, machine?: { id?: string | number; name?: string | null; make?: string | null }) {
    openMachineDialog(machine, agreement.customer?.name ?? null, agreement.customer?.id ?? null);
  }

  function handleMachineClickFromRental(
    machine?: { id?: string | number; name?: string | null; make?: string | null },
    renter?: string | null,
    renterId?: string | number | null,
  ) {
    setRentalDialogState((prev) => ({ ...prev, open: false }));
    openMachineDialog(machine, renter ?? null, renterId ?? null, { fromRental: true });
  }

  function handleAgreementClickFromCustomer(agreement: {
    id: string;
    customerId?: number | null;
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
    machines?: Array<{ id?: string | number; name?: string | null; make?: string | null }> | null;
  }) {
    pushCurrentDialogToHistory();
    if (
      rentalDialogState.rental?.rentalId !== null &&
      rentalDialogState.rental?.rentalId !== undefined &&
      rentalDialogState.rental.rentalId !== agreement.id
    ) {
      setRentalDialogStack((prev) => [
        ...prev,
        {
          state: { ...rentalDialogState, open: false },
          backToMachine: rentalBackToMachine,
          backToCustomer: rentalBackToCustomer,
        },
      ]);
    }
    setDialogState((prev) => ({ ...prev, open: false }));
    setRentalBackToMachine(false);
    setRentalBackToCustomer(true);
    setRentalDialogState({
      open: true,
      loading: false,
      error: null,
      rental: {
        rentalId: agreement.id ?? null,
        customerId: agreement.customerId ?? null,
        customerName: agreement.customerName ?? null,
        startDate: agreement.startDate ?? null,
        endDate: agreement.endDate ?? null,
        comment: agreement.comment ?? null,
        projectNumber: agreement.projectNumber ?? null,
        contactPersonName: agreement.contactPersonName ?? null,
        contactPersonTelephoneNumber: agreement.contactPersonTelephoneNumber ?? null,
        contactPersonEmail: agreement.contactPersonEmail ?? null,
        customerContactPersonId: agreement.customerContactPersonId ?? null,
        customerContactPersonName: agreement.customerContactPersonName ?? null,
        customerContactPersonTelephoneNumber: agreement.customerContactPersonTelephoneNumber ?? null,
        customerContactPersonEmail: agreement.customerContactPersonEmail ?? null,
        insuranceIncluded: agreement.insuranceIncluded ?? null,
        contractPrice: agreement.contractPrice ?? null,
        location: agreement.location ?? null,
        createdBy: agreement.createdBy ?? null,
        createdByTelephoneNumber: agreement.createdByTelephoneNumber ?? null,
        machines: agreement.machines ?? [],
      },
    });
  }

  function handleMachineClickFromCustomer(
    machine?: { id?: string | number | null; name?: string | null; make?: string | null },
  ) {
    const customer = dialogState.customer ?? null;
    const machineCustomerId = dialogState.customerId;
    const machineCustomerName = dialogState.customerName || customer?.name || null;
    const normalizedMachine = machine
      ? {
          ...machine,
          id: machine.id ?? undefined,
        }
      : undefined;
    setDialogState((prev) => ({ ...prev, open: false }));
    openMachineDialog(normalizedMachine, machineCustomerName, machineCustomerId, {
      fromCustomer: true,
    });
  }

  async function openMachineDialog(
    machine?: { id?: string | number; name?: string | null; make?: string | null },
    renter?: string | null,
    renterId?: string | number | null,
    opts?: { fromRental?: boolean; fromCustomer?: boolean },
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

    if (opts?.fromRental || opts?.fromCustomer) {
      pushCurrentDialogToHistory();
    }

    if (
      machineDialogState.machineId !== null &&
      machineDialogState.machineId !== undefined &&
      machineDialogState.machineId !== machineId
    ) {
      setMachineDialogStack((prev) => [
        ...prev,
        {
          state: { ...machineDialogState, open: false },
          backToRental: machineBackToRental,
          backToCustomer: machineBackToCustomer,
        },
      ]);
    }

    setMachineBackToRental(Boolean(opts?.fromRental));
    setMachineBackToCustomer(Boolean(opts?.fromCustomer));

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
    setDialogHistory([]);
    setCustomerDialogStack([]);
    setCustomerBackToRental(false);
    setCustomerBackToMachine(false);
  }

  function restorePreviousCustomerSnapshot() {
    const previousSnapshot = customerDialogStack[customerDialogStack.length - 1];

    if (previousSnapshot) {
      setCustomerDialogStack((prev) => prev.slice(0, -1));
      setDialogState({ ...previousSnapshot.state, open: false });
      setDialogPermissions(previousSnapshot.permissions);
      return;
    }

    setDialogState(createInitialDialogState());
    setDialogPermissions(undefined);
  }

  function resetMachineDialog() {
    setMachineDialogState(createInitialMachineState());
    setDialogHistory([]);
    setMachineDialogStack([]);
    setMachineBackToRental(false);
    setMachineBackToCustomer(false);
  }

  function restorePreviousMachineSnapshot() {
    const previousSnapshot = machineDialogStack[machineDialogStack.length - 1];

    if (previousSnapshot) {
      setMachineDialogStack((prev) => prev.slice(0, -1));
      setMachineDialogState({ ...previousSnapshot.state, open: false });
      setMachineBackToRental(previousSnapshot.backToRental);
      setMachineBackToCustomer(previousSnapshot.backToCustomer);
      return;
    }

    setMachineDialogState(createInitialMachineState());
    setMachineBackToRental(false);
    setMachineBackToCustomer(false);
  }

  function resetRentalDialog() {
    setRentalDialogState(createInitialRentalState());
    setDialogHistory([]);
    setRentalDialogStack([]);
    setRentalBackToMachine(false);
    setRentalBackToCustomer(false);
  }

  function restorePreviousRentalSnapshot() {
    const previousSnapshot = rentalDialogStack[rentalDialogStack.length - 1];

    if (previousSnapshot) {
      setRentalDialogStack((prev) => prev.slice(0, -1));
      setRentalDialogState({ ...previousSnapshot.state, open: false });
      setRentalBackToMachine(previousSnapshot.backToMachine);
      setRentalBackToCustomer(previousSnapshot.backToCustomer);
      return;
    }

    setRentalDialogState(createInitialRentalState());
    setRentalBackToMachine(false);
    setRentalBackToCustomer(false);
  }

  function handleCustomerBack() {
    restorePreviousDialogFromHistory();
  }

  function handleCustomerBackToMachine() {
    restorePreviousDialogFromHistory();
  }

  function handleMachineBack() {
    restorePreviousDialogFromHistory();
  }

  function handleMachineBackToCustomer() {
    restorePreviousDialogFromHistory();
  }

  function handleRentalBackToMachine() {
    restorePreviousDialogFromHistory();
  }

  function handleRentalBackToCustomer() {
    restorePreviousDialogFromHistory();
  }

  const breadcrumbs = getCurrentBreadcrumbs();

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
        onAgreementClick={handleAgreementClickFromCustomer}
        onMachineClick={handleMachineClickFromCustomer}
        breadcrumbs={breadcrumbs}
      />
      <MachineDetailsDialog
        state={machineDialogState}
        onClose={resetMachineDialog}
        onBack={
          machineBackToCustomer
            ? handleMachineBackToCustomer
            : machineBackToRental
              ? handleMachineBack
              : undefined
        }
        viewerRole={viewer?.role}
        breadcrumbs={breadcrumbs}
        onCustomerClick={(customerId, customerName) =>
          handleCustomerClick(
            { id: customerId ?? undefined, name: customerName ?? undefined },
            { fromMachine: true },
          )
        }
        onAgreementClick={(agreement) =>
          handleAgreementClick(
            {
              id: agreement.id,
              customer:
                agreement.customerId || agreement.customerName
                  ? {
                      id: agreement.customerId ?? undefined,
                      name: agreement.customerName ?? undefined,
                    }
                  : undefined,
              startDate: agreement.startDate ?? null,
              endDate: agreement.endDate ?? null,
              comment: agreement.comment ?? null,
              projectNumber: agreement.projectNumber ?? null,
              contactPersonName: agreement.contactPersonName ?? null,
              contactPersonTelephoneNumber: agreement.contactPersonTelephoneNumber ?? null,
              contactPersonEmail: agreement.contactPersonEmail ?? null,
              customerContactPersonId: agreement.customerContactPersonId ?? null,
              customerContactPersonName: agreement.customerContactPersonName ?? null,
              customerContactPersonTelephoneNumber: agreement.customerContactPersonTelephoneNumber ?? null,
              customerContactPersonEmail: agreement.customerContactPersonEmail ?? null,
              insuranceIncluded: agreement.insuranceIncluded ?? null,
              contractPrice: agreement.contractPrice ?? null,
              location: agreement.location ?? null,
              createdBy: agreement.createdBy ?? null,
              createdByTelephoneNumber: agreement.createdByTelephoneNumber ?? null,
              machines: [],
            },
            { fromMachine: true },
          )
        }
      />
      <RentalDetailsDialog
        state={rentalDialogState}
        onClose={resetRentalDialog}
        onBack={
          rentalBackToCustomer
            ? handleRentalBackToCustomer
            : rentalBackToMachine
              ? handleRentalBackToMachine
              : undefined
        }
        breadcrumbs={breadcrumbs}
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
