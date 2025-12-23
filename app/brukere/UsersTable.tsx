"use client";

import DataTable, { type DataColumn } from "@/components/DataTable";

type UserRow = {
  id: string;
  name: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
  address_street: string | null;
  address_postal_code: string | null;
  address_region: string | null;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
  acceptedTerms: boolean;
  acceptedTermsAt: string | Date | null;
};

type UsersTableProps = {
  users: UserRow[];
};

export default function UsersTable({ users }: UsersTableProps) {
  const columns: DataColumn<UserRow>[] = [
    {
      id: "name",
      header: "Navn",
      accessor: (user) => user.name ?? "",
      cell: (user) => (
        <div>
          <div className="font-medium text-slate-900">{user.name ?? "Ukjent"}</div>
          <div className="text-xs text-slate-500">{user.id}</div>
        </div>
      ),
      sortValue: (user) => (user.name ?? "").toLowerCase(),
      filterValue: (user) => (user.name ? user.name.trim() : "Ukjent"),
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
      id: "company",
      header: "Selskap",
      accessor: () => "UNDER DEVELOPMENT",
      cell: () => <span className="text-slate-700">UNDER DEVELOPMENT</span>,
      filterValue: () => "UNDER DEVELOPMENT",
      sortValue: () => "UNDER DEVELOPMENT",
    },
    {
      id: "created",
      header: "Opprettet",
      accessor: (user) => formatDate(user.createdAt) ?? "",
      filterType: "date-range",
      dateValue: (user) => user.createdAt,
      cell: (user) => (
        <span className="whitespace-pre-line tabular-nums text-slate-700">
          {formatDate(user.createdAt) ?? "-"}
        </span>
      ),
      sortValue: (user) => toTimestamp(user.createdAt),
      filterValue: (user) => formatDate(user.createdAt) ?? "-",
      cellClassName: "tabular-nums whitespace-pre-line",
    },
    {
      id: "updated",
      header: "Oppdatert",
      accessor: (user) => formatDate(user.updatedAt) ?? "",
      filterType: "date-range",
      dateValue: (user) => user.updatedAt,
      cell: (user) => (
        <span className="whitespace-pre-line tabular-nums text-slate-700">
          {formatDate(user.updatedAt) ?? "-"}
        </span>
      ),
      sortValue: (user) => toTimestamp(user.updatedAt),
      filterValue: (user) => formatDate(user.updatedAt) ?? "-",
      cellClassName: "tabular-nums whitespace-pre-line",
    },
    {
      id: "terms",
      header: "Vilkår",
      accessor: (user) => (user.acceptedTerms ? "Ja" : "Nei"),
      cell: (user) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${user.acceptedTerms
            ? "bg-green-100 text-green-800"
            : "bg-amber-100 text-amber-800"
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
      header: "Akseptert",
      accessor: (user) => formatDate(user.acceptedTermsAt) ?? "",
      filterType: "date-range",
      dateValue: (user) => user.acceptedTermsAt,
      cell: (user) => (
        <span className="whitespace-pre-line tabular-nums text-slate-700">
          {formatDate(user.acceptedTermsAt) ?? "-"}
        </span>
      ),
      sortValue: (user) => toTimestamp(user.acceptedTermsAt),
      filterValue: (user) => formatDate(user.acceptedTermsAt) ?? "-",
      cellClassName: "tabular-nums whitespace-pre-line",
    },
  ];

  return (
    <DataTable
      data={users}
      columns={columns}
      getRowId={(user) => user.id}
      emptyMessage="Ingen brukere funnet."
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
