"use client";

import { useMemo, useState } from "react";
import CustomerAccessDialog, {
  type AccessDialogState,
  type AccessPermissions,
  type CustomerAccessEntry,
} from "@/components/dialogs/CustomerAccessDialog";
import MachineDetailsDialog, {
  type MachineDialogState,
  type MachineDetails,
} from "@/components/dialogs/MachineDetailsDialog";
import RentalDetailsDialog, {
  type RentalDialogState,
} from "@/components/dialogs/RentalDetailsDialog";
import { fetchCustomerDetails } from "@/lib/api/customers";
import { formatDate } from "@/lib/formatters";

export type DialogCustomerRef = { id?: string | number | null; name?: string | null } | null | undefined;
export type DialogMachineRef = { id?: string | number | null; name?: string | null; make?: string | null } | undefined;

export type DialogAgreementInput = {
  id: string | number;
  customer?: DialogCustomerRef;
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

type HostActions = {
  openCustomer: (
    customer?: DialogCustomerRef,
    opts?: { fromRental?: boolean; fromMachine?: boolean },
  ) => Promise<void>;
  openAgreement: (
    agreement: DialogAgreementInput,
    opts?: { fromMachine?: boolean; fromCustomer?: boolean },
  ) => void;
  openMachine: (
    machine?: DialogMachineRef,
    renter?: string | null,
    renterId?: string | number | null,
    opts?: { fromRental?: boolean; fromCustomer?: boolean },
  ) => Promise<void>;
};

export default function DialogFlowHost({
  viewer,
  children,
}: {
  viewer?: { id?: string | null; role?: string | null };
  children: (actions: HostActions) => React.ReactNode;
}) {
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
    customer?: DialogCustomerRef,
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
    const customerId = typeof rawId === "string" ? Number.parseInt(rawId, 10) : rawId;
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

  function handleAgreementClick(
    agreement: DialogAgreementInput,
    opts?: { fromMachine?: boolean; fromCustomer?: boolean },
  ) {
    if (opts?.fromMachine || opts?.fromCustomer) {
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

    if (opts?.fromMachine) {
      setMachineDialogState((prev) => ({ ...prev, open: false }));
    }
    if (opts?.fromCustomer) {
      setDialogState((prev) => ({ ...prev, open: false }));
    }

    setRentalBackToMachine(Boolean(opts?.fromMachine));
    setRentalBackToCustomer(Boolean(opts?.fromCustomer));
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

  async function openMachineDialog(
    machine?: DialogMachineRef,
    renter?: string | null,
    renterId?: string | number | null,
    opts?: { fromRental?: boolean; fromCustomer?: boolean },
  ) {
    const rawId = machine?.id;
    const machineId = typeof rawId === "string" ? Number.parseInt(rawId, 10) : rawId;
    if (!machineId || Number.isNaN(machineId)) {
      return;
    }

    const machineLabel = machine?.name?.trim() || `Maskin ${machineId}`;

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

    if (opts?.fromRental) {
      setRentalDialogState((prev) => ({ ...prev, open: false }));
    }
    if (opts?.fromCustomer) {
      setDialogState((prev) => ({ ...prev, open: false }));
    }

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

  function resetMachineDialog() {
    setMachineDialogState(createInitialMachineState());
    setDialogHistory([]);
    setMachineDialogStack([]);
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

  const breadcrumbs = getCurrentBreadcrumbs();

  const actions = useMemo<HostActions>(() => ({
    openCustomer: handleCustomerClick,
    openAgreement: handleAgreementClick,
    openMachine: openMachineDialog,
  }), [dialogState, dialogPermissions, dialogHistory, rentalDialogState, machineDialogState, viewer, customerBackToRental, customerBackToMachine, rentalBackToMachine, rentalBackToCustomer, machineBackToRental, machineBackToCustomer]);

  return (
    <>
      {children(actions)}
      <CustomerAccessDialog
        state={dialogState}
        onClose={resetDialog}
        onBack={
          customerBackToMachine
            ? restorePreviousDialogFromHistory
            : customerBackToRental
              ? restorePreviousDialogFromHistory
              : undefined
        }
        permissions={dialogPermissions}
        onAgreementClick={(agreement) =>
          handleAgreementClick(
            {
              id: agreement.id,
              customer:
                agreement.customerId || agreement.customerName
                  ? { id: agreement.customerId ?? undefined, name: agreement.customerName ?? undefined }
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
              machines: agreement.machines ?? [],
            },
            { fromCustomer: true },
          )
        }
        onMachineClick={(machine) =>
          openMachineDialog(
            machine ? { ...machine, id: machine.id ?? undefined } : undefined,
            dialogState.customerName || dialogState.customer?.name || null,
            dialogState.customerId,
            { fromCustomer: true },
          )
        }
        breadcrumbs={breadcrumbs}
      />
      <MachineDetailsDialog
        state={machineDialogState}
        onClose={resetMachineDialog}
        onBack={
          machineBackToCustomer
            ? restorePreviousDialogFromHistory
            : machineBackToRental
              ? restorePreviousDialogFromHistory
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
                  ? { id: agreement.customerId ?? undefined, name: agreement.customerName ?? undefined }
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
            ? restorePreviousDialogFromHistory
            : rentalBackToMachine
              ? restorePreviousDialogFromHistory
              : undefined
        }
        breadcrumbs={breadcrumbs}
        onCustomerClick={(customerId, customerName) =>
          handleCustomerClick(
            { id: customerId ?? undefined, name: customerName ?? undefined },
            { fromRental: true },
          )
        }
        onMachineClick={(machine, renter, renterId) =>
          openMachineDialog(machine, renter ?? null, renterId ?? null, { fromRental: true })
        }
      />
    </>
  );
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
