"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { type DataColumn } from "@/components/DataTable";
import CustomerAccessDialog, {
  type AccessDialogState,
  type CustomerAccessEntry,
  type CustomerDetails,
} from "@/components/dialogs/CustomerAccessDialog";
import UserAccessDialog from "@/components/dialogs/UserAccessDialog";
import { formatPhone, formatDate } from "@/lib/formatters";

type UserRow = {
  id: string;
  name: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
  accesses?: UserAccess[] | null;
  address_street: string | null;
  address_postal_code: string | null;
  address_region: string | null;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
  acceptedTerms: boolean;
  acceptedTermsAt: string | Date | null;
};

type UserAccess = {
  customerId: number;
  role: string;
  customer?: {
    name?: string | null;
    customer_number?: number | null;
  } | null;
};

type UsersTableProps = {
  users: UserRow[];
};

export default function UsersTable({ users }: UsersTableProps) {
  const [dialogState, setDialogState] = useState<AccessDialogState>({
    open: false,
    loading: false,
    error: null,
    customerId: null,
    customerName: "",
    customer: null,
    accesses: [],
  });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const router = useRouter();

  function resetDialog() {
    setDialogState({
      open: false,
      loading: false,
      error: null,
      customerId: null,
      customerName: "",
      customer: null,
      accesses: [],
    });
  }

  function openUserDialog(user: UserRow) {
    setSelectedUserId(user.id);
    setSelectedUser(user);
  }

  function closeUserDialog() {
    setSelectedUserId(null);
    setSelectedUser(null);
  }

  async function handleAccessClick(access: UserAccess) {
    const customerId = access.customerId;
    if (!customerId) return;

    setDialogState({
      open: true,
      loading: true,
      error: null,
      customerId,
      customerName: access.customer?.name?.trim() || "Kunde",
      customer: null,
      accesses: [],
    });

    try {
      const [customer, accesses] = await Promise.all([
        fetchCustomerDetails(customerId),
        fetchCustomerAccesses(customerId),
      ]);

      setDialogState((prev) => ({
        ...prev,
        loading: false,
        customer,
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

  const columns: DataColumn<UserRow>[] = [
    {
      id: "name",
      header: "Navn",
      accessor: (user) => user.name ?? "",
      cell: (user) => (
        <div>
          <div className="font-medium text-slate-900">{user.name ?? "-"}</div>
          <div className="text-xs text-slate-500">{user.id}</div>
        </div>
      ),
      sortValue: (user) => (user.name ?? "").toLowerCase(),
      filterValue: (user) => (user.name ? user.name.trim() : "-"),
    },
    {
      id: "role",
      header: "Rolle",
      accessor: (user) => formatRole(user.role),
      cell: (user) => <span className="text-slate-700">{formatRole(user.role)}</span>,
      sortValue: (user) => formatRole(user.role),
      filterValue: (user) => formatRole(user.role),
    },
    {
      id: "phone",
      header: "Telefon",
      accessor: (user) => formatPhone(user.phone),
      cell: (user) => <span className="whitespace-nowrap text-slate-700">{formatPhone(user.phone)}</span>,
      sortValue: (user) => formatPhone(user.phone),
      filterValue: (user) => formatPhone(user.phone),
      cellClassName: "min-w-[11rem] whitespace-nowrap",
    },
    {
      id: "email",
      header: "E-post",
      accessor: (user) => user.email ?? "-",
      cell: (user) => <span className="text-slate-700">{user.email ?? "-"}</span>,
      filterValue: (user) => user.email ?? "-",
      sortValue: (user) => (user.email ?? "").toLowerCase(),
    },
    {
      id: "address",
      header: "Adresse",
      accessor: (user) => formatAddress(user)?.join(", ") ?? "-",
      cell: (user) => {
        const addressLines = formatAddress(user);
        return addressLines ? (
          <div className="whitespace-nowrap text-slate-700">
            {addressLines.map((line, index) => (
              <div key={`${user.id}-address-${index}`}>{line}</div>
            ))}
          </div>
        ) : (
          <span className="text-slate-400">-</span>
        );
      },
      filterValue: (user) => formatAddress(user)?.join(", ") ?? "-",
      sortValue: (user) => formatAddress(user)?.join(", ") ?? "",
      cellClassName: "min-w-[11rem] whitespace-nowrap",
    },
    {
      id: "customers",
      header: "Kundetilganger",
      accessor: (user) => getAccessLabels(user).length,
      cell: (user) => {
        if (user.role === "super_admin") {
          return (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-100 px-3 py-1 text-xs font-semibold text-green-800"
              >
                Full tilgang
              </button>
            </div>
          );
        }

        const accesses = user.accesses ?? [];
        if (!accesses.length) {
          return <span className="text-slate-400">Ingen tilganger</span>;
        }
        return (
          <div className="flex flex-wrap gap-2">
            {accesses.map((access) => {
              const label = formatAccessLabel(access);
              return (
                <button
                  key={`${user.id}-${access.customerId}`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleAccessClick(access);
                  }}
                  className="group flex cursor-pointer items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 transition hover:border-blue-300"
                  >
                  <span className="font-semibold">{label}</span>
                </button>
              );
            })}
          </div>
        );
      },
      filterValue: (user) => getAccessLabels(user),
      sortValue: (user) => getAccessLabels(user).sort().join(", "),
      cellClassName: "min-w-[14rem]",
    },
    {
      id: "created",
      header: "Bruker opprettet",
      accessor: (user) => formatDate(user.createdAt, { multiline: true }) ?? "",
      filterType: "date-range",
      dateValue: (user) => user.createdAt,
      cell: (user) => (
        <span className="whitespace-pre-line tabular-nums text-slate-700">
          {formatDate(user.createdAt, { multiline: true }) ?? "-"}
        </span>
      ),
      sortValue: (user) => toTimestamp(user.createdAt),
      filterValue: (user) => formatDate(user.createdAt, { multiline: true }) ?? "-",
      cellClassName: "tabular-nums whitespace-pre-line",
    },
    {
      id: "updated",
      header: "Bruker oppdatert",
      accessor: (user) => formatDate(user.updatedAt, { multiline: true }) ?? "",
      filterType: "date-range",
      dateValue: (user) => user.updatedAt,
      cell: (user) => (
        <span className="whitespace-pre-line tabular-nums text-slate-700">
          {formatDate(user.updatedAt, { multiline: true }) ?? "-"}
        </span>
      ),
      sortValue: (user) => toTimestamp(user.updatedAt),
      filterValue: (user) => formatDate(user.updatedAt, { multiline: true }) ?? "-",
      cellClassName: "tabular-nums whitespace-pre-line",
    },
    {
      id: "terms",
      header: "Vilkår akseptert?",
      accessor: (user) => (user.acceptedTerms ? "Ja" : "Nei"),
      cell: (user) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${user.acceptedTerms
            ? "bg-green-100 text-green-800"
            : "bg-red-100 text-red-800"
            }`}
        >
          {user.acceptedTerms ? "Ja" : "Nei"}
        </span>
      ),
      sortValue: (user) => (user.acceptedTerms ? 1 : 0),
      filterValue: (user) => (user.acceptedTerms ? "Ja" : "Nei"),
    },
    {
      id: "acceptedAt",
      header: "Vilkår\nakseptert dato",
      headerClassName: "min-w-[14rem] whitespace-pre-line leading-tight",
      accessor: (user) => formatDate(user.acceptedTermsAt, { multiline: true }) ?? "",
      filterType: "date-range",
      dateValue: (user) => user.acceptedTermsAt,
      cell: (user) => (
        <span className="whitespace-pre-line tabular-nums text-slate-700">
          {formatDate(user.acceptedTermsAt, { multiline: true }) ?? "-"}
        </span>
      ),
      sortValue: (user) => toTimestamp(user.acceptedTermsAt),
      filterValue: (user) => formatDate(user.acceptedTermsAt, { multiline: true }) ?? "-",
      cellClassName: "min-w-[14rem] tabular-nums whitespace-pre-line",
    },
  ];

  return (
    <>
      <DataTable
        data={users}
        columns={columns}
        getRowId={(user) => user.id}
        emptyMessage="Ingen brukere funnet."
        onRowClick={openUserDialog}
      />

      <CustomerAccessDialog state={dialogState} onClose={resetDialog} />
      <UserAccessDialog
        userId={selectedUserId}
        initialUser={selectedUser}
        onClose={closeUserDialog}
        onChanged={() => router.refresh()}
      />
    </>
  );
}

function formatAddress(user: Pick<UserRow, "address_street" | "address_postal_code" | "address_region">) {
  const lines: string[] = [];
  if (user.address_street) {
    lines.push(user.address_street);
  }

  const postalRegion = [user.address_postal_code, user.address_region]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");

  if (postalRegion) {
    lines.push(postalRegion);
  }

  return lines.length ? lines : undefined;
}

function toTimestamp(value?: string | Date | null) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatRole(role?: string | null) {
  if (!role) return "Ukjent";
  const labels: Record<string, string> = {
    super_admin: "Administrator",
    customer: "Kunde",
  };
  return (
    labels[role] ??
    role
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function formatAccessLabel(access: UserAccess) {
  return access.customer?.name?.trim() || "Ukjent kunde";
}

function getAccessLabels(user: UserRow) {
  if (user.role === "super_admin") {
    return ["Full tilgang"];
  }
  return (user.accesses ?? []).map((access) => formatAccessLabel(access));
}
