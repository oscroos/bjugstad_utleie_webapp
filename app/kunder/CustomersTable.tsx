"use client";

import { formatDisplay, formatPhone } from "@/lib/formatters";
import DataTable, { type DataColumn } from "@/components/DataTable";

type Customer = {
  customerId: number;
  name?: string;
  email?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  contact?: string;
  telephoneNumber?: string;
  organizationNumber?: string;
  customerNumber?: number;
};

type CustomersTableProps = {
  customers: Customer[];
};

export default function CustomersTable({ customers }: CustomersTableProps) {
  const columns: DataColumn<Customer>[] = [
    {
      id: "id",
      header: "ID",
      accessor: (customer) => customer.customerId,
      cell: (customer) => (
        <span className="whitespace-nowrap text-slate-700">
          {customer.customerId ?? "-"}
        </span>
      ),
      sortValue: (customer) => customer.customerId ?? 0,
      filterValue: (customer) => (customer.customerId ?? "-").toString(),
      cellClassName: "whitespace-nowrap",
    },
    {
      id: "name",
      header: "Kunde",
      accessor: (customer) => formatDisplay(customer.name, "Ukjent"),
      cell: (customer) => (
        <div className="font-medium text-slate-900">{formatDisplay(customer.name, "Ukjent")}</div>
      ),
      sortValue: (customer) => formatDisplay(customer.name, "Ukjent").toLowerCase(),
      filterValue: (customer) => formatDisplay(customer.name, "Ukjent"),
    },
    {
      id: "contact",
      header: "Kontakt",
      accessor: (customer) => formatDisplay(customer.contact),
      cell: (customer) => <span className="text-slate-700">{formatDisplay(customer.contact)}</span>,
      sortValue: (customer) => formatDisplay(customer.contact),
      filterValue: (customer) => formatDisplay(customer.contact),
    },
    {
      id: "phone",
      header: "Telefon",
      accessor: (customer) => formatPhone(customer.telephoneNumber),
      cell: (customer) => (
        <span className="whitespace-nowrap text-slate-700">
          {formatPhone(customer.telephoneNumber)}
        </span>
      ),
      sortValue: (customer) => formatPhone(customer.telephoneNumber),
      filterValue: (customer) => formatPhone(customer.telephoneNumber),
      cellClassName: "min-w-[11rem] whitespace-nowrap",
    },
    {
      id: "email",
      header: "E-post",
      accessor: (customer) => formatDisplay(customer.email),
      cell: (customer) => <span className="text-slate-700">{formatDisplay(customer.email)}</span>,
      sortValue: (customer) => formatDisplay(customer.email).toLowerCase(),
      filterValue: (customer) => formatDisplay(customer.email),
    },
    {
      id: "address",
      header: "Adresse",
      accessor: (customer) => formatAddress(customer)?.join(", ") ?? "-",
      cell: (customer) => {
        const addressLines = formatAddress(customer);
        return addressLines ? (
          <div className="whitespace-nowrap text-slate-700">
            {addressLines.map((line, index) => (
              <div key={`${customer.customerId}-address-${index}`}>{line}</div>
            ))}
          </div>
        ) : (
          <span className="text-slate-400">-</span>
        );
      },
      sortValue: (customer) => formatAddress(customer)?.join(", ") ?? "",
      filterValue: (customer) => formatAddress(customer)?.join(", ") ?? "-",
      cellClassName: "min-w-[12rem] whitespace-nowrap",
    },
    {
      id: "organization",
      header: "Org.nr",
      accessor: (customer) => formatDisplay(customer.organizationNumber),
      cell: (customer) => <span className="text-slate-700">{formatDisplay(customer.organizationNumber)}</span>,
      sortValue: (customer) => formatDisplay(customer.organizationNumber),
      filterValue: (customer) => formatDisplay(customer.organizationNumber),
      cellClassName: "whitespace-nowrap",
    },
    {
      id: "customerNumber",
      header: "Kundenummer",
      accessor: (customer) => formatCustomerNumber(customer.customerNumber),
      cell: (customer) => (
        <span className="whitespace-nowrap text-slate-700">
          {formatCustomerNumber(customer.customerNumber)}
        </span>
      ),
      sortValue: (customer) => customer.customerNumber ?? "",
      filterValue: (customer) => formatCustomerNumber(customer.customerNumber),
      cellClassName: "whitespace-nowrap",
    },
  ];

  return (
    <DataTable
      data={customers}
      columns={columns}
      getRowId={(customer, index) => customer.customerId?.toString() ?? String(index)}
      emptyMessage="Ingen kunder funnet."
    />
  );
}

function formatAddress(customer: Pick<Customer, "address" | "postalCode" | "city">) {
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
