"use client";

import DataTable, { type DataColumn } from "@/components/DataTable";
import DialogFlowHost, { type DialogAgreementInput } from "@/components/dialogs/DialogFlowHost";
import { formatDate } from "@/lib/formatters";
import type { ProjectMachine } from "@/lib/projects";
import type { AgreementPayload } from "@/lib/agreements";

type ProjectMachinesSectionProps = {
  machines: ProjectMachine[];
  error: string | null;
  projectNumber: string;
  viewer?: { id?: string | null; role?: string | null };
};

export default function ProjectMachinesSection({
  machines,
  error,
  projectNumber,
  viewer,
}: ProjectMachinesSectionProps) {
  const activeCount = machines.filter((entry) => entry.isActive).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-1 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Maskiner tilknyttet prosjektet</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Hentet fra leieavtaler merket med prosjektnummer {projectNumber}.
          </p>
        </div>
        {machines.length ? (
          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {activeCount} {activeCount === 1 ? "aktiv" : "aktive"} · {machines.length} totalt
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="px-6 py-8 text-sm text-slate-600">
          <p className="font-medium text-slate-800">Kunne ikke hente maskiner fra avtaleregisteret.</p>
          <p className="mt-1 text-slate-500">{error}</p>
        </div>
      ) : (
        <DialogFlowHost viewer={viewer}>
          {({ openAgreement, openMachine }) => {
            const columns: DataColumn<ProjectMachine>[] = [
              {
                id: "machine",
                header: "Maskin",
                accessor: (entry) => machineLabel(entry),
                cell: (entry) => (
                  <PillButton
                    label={machineLabel(entry)}
                    onClick={() =>
                      void openMachine(
                        entry.machine,
                        entry.agreement.customerName ?? null,
                        entry.agreement.customerId ?? null,
                      )
                    }
                  />
                ),
                sortValue: (entry) => machineLabel(entry).toLowerCase(),
                filterValue: (entry) => machineLabel(entry),
                cellClassName: "min-w-[12rem]",
              },
              {
                id: "make",
                header: "Merke",
                accessor: (entry) => entry.machine.make ?? "-",
                cell: (entry) => <span className="text-slate-700">{entry.machine.make ?? "-"}</span>,
                sortValue: (entry) => (entry.machine.make ?? "").toLowerCase(),
                filterValue: (entry) => entry.machine.make ?? "-",
              },
              {
                id: "agreement",
                header: "Avtale",
                accessor: (entry) => entry.agreement.id,
                cell: (entry) => (
                  <PillButton
                    label={entry.agreement.id}
                    onClick={() => openAgreement(toDialogAgreement(entry.agreement))}
                  />
                ),
                sortValue: (entry) => entry.agreement.id,
                filterValue: (entry) => entry.agreement.id,
                cellClassName: "whitespace-nowrap",
              },
              {
                id: "startDate",
                header: "Startdato",
                accessor: (entry) => formatDate(entry.agreement.startDate, { showTime: false }) ?? "",
                filterType: "date-range",
                dateValue: (entry) => entry.agreement.startDate,
                cell: (entry) => (
                  <span className="tabular-nums text-slate-700">
                    {formatDate(entry.agreement.startDate, { showTime: false }) ?? "-"}
                  </span>
                ),
                sortValue: (entry) => toTimestamp(entry.agreement.startDate),
                filterValue: (entry) => formatDate(entry.agreement.startDate, { showTime: false }) ?? "-",
                cellClassName: "tabular-nums whitespace-nowrap",
              },
              {
                id: "endDate",
                header: "Sluttdato",
                accessor: (entry) => formatDate(entry.agreement.endDate, { showTime: false }) ?? "",
                filterType: "date-range",
                dateValue: (entry) => entry.agreement.endDate,
                cell: (entry) => (
                  <span className="tabular-nums text-slate-700">
                    {formatDate(entry.agreement.endDate, { showTime: false }) ?? "-"}
                  </span>
                ),
                sortValue: (entry) => toTimestamp(entry.agreement.endDate),
                filterValue: (entry) => formatDate(entry.agreement.endDate, { showTime: false }) ?? "-",
                cellClassName: "tabular-nums whitespace-nowrap",
              },
              {
                id: "status",
                header: "Status",
                accessor: (entry) => (entry.isActive ? "Aktiv leieavtale" : "Avsluttet"),
                cell: (entry) => (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      entry.isActive
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                        : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                    }`}
                  >
                    {entry.isActive ? "Aktiv leieavtale" : "Avsluttet"}
                  </span>
                ),
                sortValue: (entry) => (entry.isActive ? 0 : 1),
                filterValue: (entry) => (entry.isActive ? "Aktiv leieavtale" : "Avsluttet"),
              },
              {
                id: "actions",
                header: "",
                accessor: () => "",
                cell: (entry) => (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        void openMachine(
                          entry.machine,
                          entry.agreement.customerName ?? null,
                          entry.agreement.customerId ?? null,
                        )
                      }
                      className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                    >
                      Maskinkort
                    </button>
                  </div>
                ),
                plain: true,
                cellClassName: "whitespace-nowrap",
              },
            ];

            return (
              <DataTable
                data={machines}
                columns={columns}
                getRowId={(entry) => entry.key}
                squareTop
                emptyMessage="Ingen maskiner er knyttet til dette prosjektet gjennom leieavtaler ennå."
              />
            );
          }}
        </DialogFlowHost>
      )}
    </section>
  );
}

function machineLabel(entry: ProjectMachine) {
  return (
    entry.machine.name?.trim() ||
    (entry.machine.id !== undefined ? `Maskin ${entry.machine.id}` : "Maskin")
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

function toDialogAgreement(payload: AgreementPayload): DialogAgreementInput {
  return {
    id: payload.id,
    customer:
      payload.customerId || payload.customerName
        ? { id: payload.customerId, name: payload.customerName ?? undefined }
        : undefined,
    startDate: payload.startDate ?? null,
    endDate: payload.endDate ?? null,
    comment: payload.comment ?? null,
    projectNumber: payload.projectNumber ?? null,
    contactPersonName: payload.contactPersonName ?? null,
    contactPersonTelephoneNumber: payload.contactPersonTelephoneNumber ?? null,
    contactPersonEmail: payload.contactPersonEmail ?? null,
    customerContactPersonId: payload.customerContactPersonId ?? null,
    customerContactPersonName: payload.customerContactPersonName ?? null,
    customerContactPersonTelephoneNumber: payload.customerContactPersonTelephoneNumber ?? null,
    customerContactPersonEmail: payload.customerContactPersonEmail ?? null,
    insuranceIncluded: payload.insuranceIncluded ?? null,
    contractPrice: payload.contractPrice ?? null,
    location: payload.location ?? null,
    createdBy: payload.createdBy ?? null,
    createdByTelephoneNumber: payload.createdByTelephoneNumber ?? null,
    machines:
      payload.machines?.map((machine) => ({
        id: machine.id,
        name: machine.name ?? undefined,
        make: machine.make ?? undefined,
      })) ?? [],
  };
}

function toTimestamp(value?: string | Date | null) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
