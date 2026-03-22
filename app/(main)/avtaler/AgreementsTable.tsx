"use client";

import DataTable, { type DataColumn } from "@/components/DataTable";
import DialogFlowHost, { type DialogAgreementInput } from "@/components/dialogs/DialogFlowHost";
import { formatDate } from "@/lib/formatters";

export type AgreementRow = DialogAgreementInput;

type AgreementsTableProps = {
  agreements: AgreementRow[];
  emptyMessage?: string;
  viewer?: { id?: string | null; role?: string | null };
};

export default function AgreementsTable({ agreements, emptyMessage, viewer }: AgreementsTableProps) {
  return (
    <DialogFlowHost viewer={viewer}>
      {({ openAgreement, openCustomer, openMachine }) => {
        const columns: DataColumn<AgreementRow>[] = [
          {
            id: "id",
            header: "Avtale ID",
            accessor: (agreement) => agreement.id ?? "-",
            cell: (agreement) => {
              const label = agreement.id?.toString() ?? "-";
              return <PillButton label={label} onClick={() => openAgreement(agreement)} />;
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
              return <PillButton label={label} onClick={() => void openCustomer(agreement.customer)} />;
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
                        onClick={() =>
                          void openMachine(machine, agreement.customer?.name ?? null, agreement.customer?.id ?? null)
                        }
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
              (agreement.machines ?? []).map((machine) => machine?.name?.trim() || "Maskin"),
            cellClassName: "min-w-[12rem]",
          },
        ];

        return (
          <DataTable
            data={agreements}
            columns={columns}
            getRowId={(agreement, index) => agreement.id?.toString() ?? String(index)}
            emptyMessage={emptyMessage ?? "Ingen avtaler funnet."}
            defaultSort={{ columnId: "startDate", direction: "desc" }}
          />
        );
      }}
    </DialogFlowHost>
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
