"use client";

import DataTable, { type DataColumn } from "@/components/DataTable";

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
  const columns: DataColumn<LoginEvent>[] = [
    {
      id: "user",
      header: "Bruker",
      accessor: (event) => event.user?.name ?? "Ukjent",
      cell: (event) => (
        <div>
          <div className="font-medium text-slate-900">{event.user?.name ?? "Ukjent navn"}</div>
          <div className="text-xs text-slate-500">{event.user?.id ?? "Ingen bruker-ID"}</div>
        </div>
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
      id: "provider",
      header: "Provider",
      accessor: (event) => event.provider ?? "-",
      cell: (event) => <span className="text-slate-700">{event.provider ?? "-"}</span>,
      filterValue: (event) => event.provider ?? "-",
      sortValue: (event) => event.provider ?? "",
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
    <DataTable
      data={events}
      columns={columns}
      getRowId={(event) => event.id}
      emptyMessage="Ingen innloggingsaktivitet funnet."
    />
  );
}

function formatPhone(raw?: string | null) {
  if (!raw) return "-";
  const compact = raw.replace(/\s+/g, "");
  if (!compact.startsWith("+") || compact.length <= 3) {
    return raw;
  }
  const country = compact.slice(0, 3);
  const rest = compact.slice(3);
  const groups = rest.match(/.{1,2}/g);
  const spaced = groups ? groups.join(" ") : rest;
  return `${country} ${spaced}`.trim();
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
