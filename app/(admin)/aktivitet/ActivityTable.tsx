"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/formatters";
import type { ActivityItem, ActivityUser } from "@/lib/activity";
import type { AuditCategory, AuditChange } from "@/lib/audit";
import DataTable, { type DataColumn } from "@/components/DataTable";
import UserAccessDialog from "@/components/dialogs/UserAccessDialog";

type ActivityTableProps = {
  items: ActivityItem[];
};

const CATEGORY_CLASSES: Record<AuditCategory, string> = {
  LOGIN: "border-slate-200 bg-slate-50 text-slate-700",
  PROJECT: "border-blue-200 bg-blue-50 text-blue-800",
  ACCESS: "border-violet-200 bg-violet-50 text-violet-800",
  ZONES: "border-amber-200 bg-amber-50 text-amber-800",
  MASSES: "border-teal-200 bg-teal-50 text-teal-800",
  DOCUMENTS: "border-emerald-200 bg-emerald-50 text-emerald-800",
  CALL_OFF: "border-cyan-200 bg-cyan-50 text-cyan-800",
  CATALOG: "border-slate-200 bg-slate-50 text-slate-700",
  TELEMETRY: "border-slate-200 bg-slate-50 text-slate-700",
  OTHER: "border-slate-200 bg-slate-50 text-slate-700",
};

const pillClass =
  "inline-flex max-w-full items-center rounded-full border px-3 py-1 text-left text-xs font-semibold";
const VISIBLE_CHANGES = 3;

export default function ActivityTable({ items }: ActivityTableProps) {
  const [selectedUser, setSelectedUser] = useState<ActivityUser | null>(null);
  // Rows whose full list of changes is shown. Shared by the old and new value columns.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const columns: DataColumn<ActivityItem>[] = [
    {
      id: "at",
      header: "Tidspunkt",
      accessor: (item) => formatDate(item.at, { multiline: true }) ?? "",
      filterType: "date-range",
      dateValue: (item) => item.at,
      cell: (item) => (
        <span className="whitespace-pre-line tabular-nums text-slate-700">
          {formatDate(item.at, { multiline: true }) ?? "-"}
        </span>
      ),
      sortValue: (item) => new Date(item.at).getTime(),
      cellClassName: "tabular-nums whitespace-pre-line",
    },
    {
      id: "user",
      header: "Bruker",
      accessor: (item) => userLabel(item),
      cell: (item) =>
        item.user ? (
          <button
            type="button"
            onClick={() => setSelectedUser(item.user)}
            className={`${pillClass} cursor-pointer border-blue-200 bg-blue-50 text-blue-800 transition hover:border-blue-300`}
          >
            <span className="truncate">{userLabel(item)}</span>
          </button>
        ) : (
          <span className="text-slate-500">{userLabel(item)}</span>
        ),
      sortValue: (item) => userLabel(item).toLowerCase(),
      filterValue: (item) => userLabel(item),
    },
    {
      id: "customer",
      header: "Selskap",
      accessor: (item) => customerLabel(item),
      cell: (item) => <span className="text-slate-700">{customerLabel(item)}</span>,
      sortValue: (item) => customerLabel(item).toLowerCase(),
      filterValue: (item) => customerLabel(item),
    },
    {
      id: "project",
      header: "Prosjekt",
      accessor: (item) => item.project?.label ?? "-",
      cell: (item) =>
        !item.project ? (
          <span className="text-slate-400">-</span>
        ) : item.project.exists ? (
          <Link
            href={`/prosjekter/${item.project.id}`}
            className="font-semibold text-blue-700 hover:text-blue-900 hover:underline"
          >
            {item.project.label}
          </Link>
        ) : (
          <span className="text-slate-700">
            {item.project.label} <span className="text-xs text-slate-500">(slettet)</span>
          </span>
        ),
      sortValue: (item) => (item.project?.label ?? "").toLowerCase(),
      filterValue: (item) => item.project?.label ?? "-",
    },
    {
      id: "category",
      header: "Type",
      accessor: (item) => item.categoryLabel,
      cell: (item) => (
        <span className={`${pillClass} whitespace-nowrap ${CATEGORY_CLASSES[item.category]}`}>
          {item.categoryLabel}
        </span>
      ),
      sortValue: (item) => item.categoryLabel,
      filterValue: (item) => item.categoryLabel,
    },
    {
      id: "description",
      header: "Hendelse",
      accessor: (item) => item.description,
      cell: (item) => <span className="text-slate-900">{item.description}</span>,
      sortValue: (item) => item.description,
      filterValue: (item) => item.description,
    },
    {
      id: "oldValue",
      header: "Gammel verdi",
      accessor: (item) => item.changes.map((change) => change.from ?? "").join(" "),
      cell: (item) => (
        <ChangeValues
          changes={item.changes}
          side="from"
          expanded={expandedIds.has(item.id)}
          onToggle={() => toggleExpanded(item.id)}
        />
      ),
      plain: true,
      cellClassName: "min-w-[12rem]",
    },
    {
      id: "newValue",
      header: "Ny verdi",
      accessor: (item) => item.changes.map((change) => change.to ?? "").join(" "),
      cell: (item) => <ChangeValues changes={item.changes} side="to" expanded={expandedIds.has(item.id)} />,
      plain: true,
      cellClassName: "min-w-[12rem]",
    },
  ];

  return (
    <>
      <DataTable
        data={items}
        columns={columns}
        getRowId={(item) => item.id}
        defaultSort={{ columnId: "at", direction: "desc" }}
        emptyMessage="Ingen aktivitet funnet."
      />
      <UserAccessDialog
        userId={selectedUser?.id ?? null}
        initialUser={selectedUser ?? undefined}
        onClose={() => setSelectedUser(null)}
      />
    </>
  );
}

// One column of the old/new value pair. Every change takes the same fixed height
// in both columns (a label line and a one-line value), so the old value and the
// new value of a change always sit on the same line. Long values are cut off and
// shown in full on hover.
function ChangeValues({
  changes,
  side,
  expanded,
  onToggle,
}: {
  changes: AuditChange[];
  side: "from" | "to";
  expanded: boolean;
  /** Only the old value column gets the "show more" button. */
  onToggle?: () => void;
}) {
  if (changes.length === 0) return <span className="text-slate-400">-</span>;

  const visible = expanded ? changes : changes.slice(0, VISIBLE_CHANGES);
  const hidden = changes.length - visible.length;

  return (
    <div className="space-y-1.5 text-xs">
      {visible.map((change, index) => {
        const value = change[side];
        return (
          <div key={`${change.label}-${index}`} className="h-10">
            <div className="h-4 max-w-[16rem] truncate text-[11px] font-medium text-slate-500" title={change.label}>
              {change.label}
            </div>
            <div className="flex h-6 items-center">
              {value === null ? (
                <span className="italic text-slate-400">tom</span>
              ) : (
                <span
                  title={value}
                  className={`max-w-[16rem] truncate rounded px-1.5 py-0.5 font-medium ${
                    side === "from" ? "bg-slate-100 text-slate-700" : "bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {value}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {onToggle && changes.length > VISIBLE_CHANGES ? (
        <button
          type="button"
          onClick={onToggle}
          className="cursor-pointer text-xs font-semibold text-blue-700 hover:text-blue-900"
        >
          {expanded ? "Vis færre" : `Vis ${hidden} til`}
        </button>
      ) : null}
    </div>
  );
}

function userLabel(item: ActivityItem) {
  if (item.user) return item.user.name?.trim() || "Ukjent navn";
  return item.userDeleted ? "Slettet bruker" : "System";
}

function customerLabel(item: ActivityItem) {
  if (!item.customer) return "-";
  return item.customer.name?.trim() || `Kunde ${item.customer.id}`;
}
