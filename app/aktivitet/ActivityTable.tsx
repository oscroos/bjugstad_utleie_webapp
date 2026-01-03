"use client";

import { useState } from "react";
import { formatPhone } from "@/lib/formatters";
import DataTable, { type DataColumn } from "@/components/DataTable";
import UserAccessDialog from "@/components/dialogs/UserAccessDialog";

type LoginEvent = {
  id: string;
  provider: string | null;
  loggedAt: string | Date;
  user: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    role: string | null;
  } | null;
};

type ActivityTableProps = {
  events: LoginEvent[];
};

export default function ActivityTable({ events }: ActivityTableProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<LoginEvent["user"] | null>(null);

  function openUserDialog(user: LoginEvent["user"] | null) {
    if (!user?.id) return;
    setSelectedUserId(user.id);
    setSelectedUser(user);
  }

  function closeUserDialog() {
    setSelectedUserId(null);
    setSelectedUser(null);
  }

  const columns: DataColumn<LoginEvent>[] = [
    {
      id: "user",
      header: "Bruker",
      accessor: (event) => event.user?.name ?? "Ukjent",
      cell: (event) => (
        <button
          type="button"
          onClick={() => openUserDialog(event.user)}
          className="group inline-flex max-w-full cursor-pointer items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-left text-xs font-medium text-blue-800 transition hover:border-blue-300"
        >
          <span className="truncate font-semibold">{event.user?.name ?? "Ukjent navn"}</span>
        </button>
      ),
      sortValue: (event) => (event.user?.name ?? "").toLowerCase(),
      filterValue: (event) => event.user?.name?.trim() ?? "Ukjent navn",
    },
    {
      id: "phone",
      header: "Telefon",
      accessor: (event) => formatPhone(event.user?.phone),
      cell: (event) => (
        <span className="whitespace-nowrap text-slate-700">{formatPhone(event.user?.phone)}</span>
      ),
      sortValue: (event) => formatPhone(event.user?.phone),
      filterValue: (event) => formatPhone(event.user?.phone),
      cellClassName: "min-w-[11rem] whitespace-nowrap",
    },
    {
      id: "email",
      header: "E-post",
      accessor: (event) => event.user?.email ?? "-",
      cell: (event) => <span className="text-slate-700">{event.user?.email ?? "-"}</span>,
      sortValue: (event) => (event.user?.email ?? "").toLowerCase(),
      filterValue: (event) => event.user?.email ?? "-",
    },
    {
      id: "event",
      header: "Hendelse",
      accessor: (event) => formatEvent(event),
      cell: (event) => <span className="text-slate-700">{formatEvent(event)}</span>,
      filterValue: (event) => formatEvent(event),
      sortValue: (event) => formatEvent(event),
    },
    {
      id: "loggedAt",
      header: "Tidspunkt",
      accessor: (event) => formatDate(event.loggedAt) ?? "",
      filterType: "date-range",
      dateValue: (event) => event.loggedAt,
      cell: (event) => (
        <span className="whitespace-pre-line tabular-nums text-slate-700">
          {formatDate(event.loggedAt) ?? "-"}
        </span>
      ),
      sortValue: (event) => toTimestamp(event.loggedAt),
      filterValue: (event) => formatDate(event.loggedAt) ?? "-",
      cellClassName: "tabular-nums whitespace-pre-line",
    },
  ];

  return (
    <>
      <DataTable
        data={events}
        columns={columns}
        getRowId={(event) => event.id}
        defaultSort={{ columnId: "loggedAt", direction: "desc" }}
        emptyMessage="Ingen innloggingsaktivitet funnet."
      />
      <UserAccessDialog
        userId={selectedUserId}
        initialUser={
          selectedUserId && selectedUser?.id === selectedUserId
            ? {
                id: selectedUser.id,
                name: selectedUser.name,
                phone: selectedUser.phone,
                email: selectedUser.email,
                role: selectedUser.role,
              }
            : undefined
        }
        onClose={closeUserDialog}
      />
    </>
  );
}

function formatEvent(event: LoginEvent) {
  const provider = event.provider?.trim();
  const providerLabel = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "ukjent metode";
  return `Logget inn med ${providerLabel}`;
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
