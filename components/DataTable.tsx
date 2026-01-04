"use client";

import { ArrowUpIcon, FunnelIcon } from "@heroicons/react/20/solid";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type CellValue = string | number | boolean | Date | null | undefined;
type SortableValue = string | number | boolean | Date | null | undefined;

export type DataColumn<T> = {
  id: string;
  header: string;
  accessor: (row: T) => CellValue;
  cell?: (row: T) => ReactNode;
  sortValue?: (row: T) => SortableValue;
  filterValue?: (row: T) => string | string[];
  filterType?: "checkbox" | "date-range";
  dateValue?: (row: T) => Date | string | null | undefined;
  headerClassName?: string;
  cellClassName?: string;
};

type DataTableProps<T> = {
  data: T[];
  columns: DataColumn<T>[];
  getRowId?: (row: T, index: number) => string;
  emptyMessage?: string;
  defaultSort?: { columnId: string; direction: "asc" | "desc" };
  onRowClick?: (row: T) => void;
};

type SortState = {
  columnId: string | null;
  direction: "asc" | "desc" | null;
};

type CheckboxFilter = { kind: "checkbox"; values: Set<string> };
type DateRangeFilter = { kind: "date-range"; from?: string; to?: string };
type FilterState = CheckboxFilter | DateRangeFilter;

const collator = new Intl.Collator("nb-NO", { numeric: true, sensitivity: "base" });

function hasValue(value: SortableValue) {
  return value !== null && value !== undefined && value !== "";
}

function normalizeDisplay(value: CellValue) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Ja" : "Nei";
  if (value instanceof Date) return value.toLocaleString();
  return String(value);
}

function normalizeFilterValue(value: string | undefined) {
  if (value === undefined || value === "") return "-";
  return value;
}

function normalizeSortValue(raw: SortableValue): number | string | boolean {
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "number" || typeof raw === "boolean") return raw;
  if (raw === null || raw === undefined) return "";
  return String(raw);
}

function compareValues(a: SortableValue, b: SortableValue) {
  const left = normalizeSortValue(a);
  const right = normalizeSortValue(b);

  const leftHas = hasValue(a);
  const rightHas = hasValue(b);
  if (!leftHas && rightHas) return 1;
  if (leftHas && !rightHas) return -1;

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    return left === right ? 0 : left ? 1 : -1;
  }

  return collator.compare(String(left), String(right));
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DataTable<T>({
  data,
  columns,
  getRowId,
  emptyMessage = "Ingen rader ? vise.",
  defaultSort,
  onRowClick,
}: DataTableProps<T>) {
  const PAGE_SIZE = 100;
  const [sortState, setSortState] = useState<SortState>({
    columnId: defaultSort?.columnId ?? null,
    direction: defaultSort?.direction ?? null,
  });
  const [filters, setFilters] = useState<Record<string, FilterState>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const filterButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const filterDropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!openFilter) return;
      const target = event.target as Node;
      const button = filterButtonRefs.current[openFilter];
      const dropdown = filterDropdownRefs.current[openFilter];
      if (button?.contains(target) || dropdown?.contains(target)) return;
      setOpenFilter(null);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openFilter]);

  const today = useMemo(() => new Date(), []);

  const dateExtents = useMemo(() => {
    const extents: Record<string, { min: Date | null }> = {};
    for (const column of columns) {
      if (column.filterType !== "date-range" || !column.dateValue) continue;
      let minDate: Date | null = null;
      for (const row of data) {
        const date = toDate(column.dateValue(row));
        if (!date) continue;
        if (!minDate || date < minDate) {
          minDate = date;
        }
      }
      extents[column.id] = { min: minDate };
    }
    return extents;
  }, [columns, data]);

  const filterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const column of columns) {
      if (column.filterType === "date-range") continue;
      const values = new Set<string>();
      for (const row of data) {
        const raw = column.filterValue
          ? column.filterValue(row)
          : normalizeDisplay(column.accessor(row));
        const normalizedValues = Array.isArray(raw)
          ? raw.map(normalizeFilterValue)
          : [normalizeFilterValue(raw)];
        for (const value of normalizedValues) {
          values.add(value);
        }
      }
      options[column.id] = Array.from(values).sort(collator.compare);
    }
    return options;
  }, [columns, data]);

  const filteredRows = useMemo(() => {
    return data.filter((row) => {
      return columns.every((column) => {
        const active = filters[column.id];
        if (!active) return true;

        if (active.kind === "checkbox") {
          if (active.values.size === 0) return true;
          const raw = column.filterValue
            ? column.filterValue(row)
            : normalizeDisplay(column.accessor(row));
          const normalizedValues = Array.isArray(raw)
            ? raw.map(normalizeFilterValue)
            : [normalizeFilterValue(raw)];
          return normalizedValues.some((value) => active.values.has(value));
        }

        if (active.kind === "date-range") {
          if (column.filterType !== "date-range" || !column.dateValue) return true;
          const columnDate = toDate(column.dateValue(row));
          if (!columnDate) return false;
          const minDate = dateExtents[column.id]?.min;
          const defaultFrom = minDate ? formatDateInput(minDate) : undefined;
          const defaultTo = formatDateInput(today);
          const from = active.from ?? defaultFrom;
          const to = active.to ?? defaultTo;
          if (from && columnDate < new Date(from)) return false;
          if (to) {
            const toDateVal = new Date(to);
            toDateVal.setHours(23, 59, 59, 999);
            if (columnDate > toDateVal) return false;
          }
          return true;
        }

        return true;
      });
    });
  }, [columns, data, filters, dateExtents, today]);

  const sortedRows = useMemo(() => {
    if (!sortState.columnId || !sortState.direction) return filteredRows;
    const column = columns.find((col) => col.id === sortState.columnId);
    if (!column) return filteredRows;

    const direction = sortState.direction === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const aValue = column.sortValue ? column.sortValue(a) : column.accessor(a);
      const bValue = column.sortValue ? column.sortValue(b) : column.accessor(b);
      return compareValues(aValue, bValue) * direction;
    });
  }, [columns, filteredRows, sortState.columnId, sortState.direction]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
    setCurrentPage((prev) => (prev > totalPages ? totalPages : prev));
  }, [sortedRows.length]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, data, columns]);

  const totalRows = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalRows);
  const paginatedRows = sortedRows.slice(startIndex, endIndex);

  function toggleSort(columnId: string, direction: "asc" | "desc") {
    setSortState((prev) => {
      if (prev.columnId === columnId) {
        const nextDirection = prev.direction === "asc" ? "desc" : "asc";
        return { columnId, direction: nextDirection };
      }
      return { columnId, direction };
    });
  }

  function toggleFilterValue(columnId: string, value: string) {
    setFilters((prev) => {
      const current = prev[columnId];
      const values = current && current.kind === "checkbox" ? new Set(current.values) : new Set<string>();
      if (values.has(value)) {
        values.delete(value);
      } else {
        values.add(value);
      }
      return { ...prev, [columnId]: { kind: "checkbox", values } };
    });
  }

  function toggleAllCheckboxes(columnId: string, options: string[]) {
    setFilters((prev) => {
      const current = prev[columnId];
      const currentValues = current && current.kind === "checkbox" ? current.values : new Set<string>();
      const allChecked = options.length > 0 && currentValues.size === options.length;
      const nextValues = allChecked ? new Set<string>() : new Set(options);
      return { ...prev, [columnId]: { kind: "checkbox", values: nextValues } };
    });
  }

  function setDateRangeFilter(columnId: string, from?: string, to?: string) {
    setFilters((prev) => ({
      ...prev,
      [columnId]: { kind: "date-range", from, to },
    }));
  }

  function clearFilter(columnId: string) {
    setFilters((prev) => {
      if (!prev[columnId]) return prev;
      const next = { ...prev };
      delete next[columnId];
      return next;
    });
    setOpenFilter(null);
  }

  function renderCell(row: T, column: DataColumn<T>) {
    if (column.cell) return column.cell(row);
    return normalizeDisplay(column.accessor(row));
  }

  function isFilterActive(column: DataColumn<T>) {
    const state = filters[column.id];
    if (!state) return false;
    if (state.kind === "checkbox") {
      return state.values.size > 0;
    }
    if (state.kind === "date-range") {
      const minDate = dateExtents[column.id]?.min;
      const defaultFrom = minDate ? formatDateInput(minDate) : undefined;
      const defaultTo = formatDateInput(today);
      return (state.from && state.from !== defaultFrom) || (state.to && state.to !== defaultTo);
    }
    return false;
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-x-auto overflow-y-visible rounded-t-2xl">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              {columns.map((column, index) => {
                const hasActiveFilter = isFilterActive(column);
                const isAscending = sortState.columnId === column.id && sortState.direction === "asc";
                const isDescending = sortState.columnId === column.id && sortState.direction === "desc";
                const first = index === 0;
                const last = index === columns.length - 1;
                const alignLeft = index === 0;
                const isSorted = sortState.columnId === column.id && sortState.direction !== null;
                const filterType = column.filterType ?? "checkbox";
                const minDate = filterType === "date-range" ? dateExtents[column.id]?.min : null;
                const defaultFrom = minDate ? formatDateInput(minDate) : undefined;
                const defaultTo = formatDateInput(today);
                const dateState = (filters[column.id] as DateRangeFilter | undefined)?.kind === "date-range"
                  ? (filters[column.id] as DateRangeFilter)
                  : undefined;
                const checkboxOptions = filterOptions[column.id] ?? [];
                const selectedCheckboxValues =
                  filters[column.id]?.kind === "checkbox"
                    ? (filters[column.id] as CheckboxFilter).values
                    : new Set<string>();
                const allCheckboxesChecked =
                  checkboxOptions.length > 0 && selectedCheckboxValues.size === checkboxOptions.length;

                return (
                  <th
                    key={column.id}
                    scope="col"
                    className={cx(
                      "px-4 py-3",
                      column.headerClassName,
                      first && "rounded-tl-2xl",
                      last && "rounded-tr-2xl",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span>{column.header}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`${column.header} sorter`}
                          onClick={() => toggleSort(column.id, "asc")}
                          className={cx(
                            "flex h-6 w-7 cursor-pointer items-center justify-center rounded border border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-700",
                            isSorted && "border-blue-300 bg-blue-100 text-blue-700",
                          )}
                        >
                          <ArrowUpIcon
                            className={cx(
                              "h-3.5 w-3.5 transition-transform",
                              isAscending && "rotate-180",
                              isDescending && "rotate-0",
                            )}
                          />
                        </button>

                        <div className="relative">
                          <button
                            type="button"
                            aria-label={`${column.header} filter`}
                            onClick={() => setOpenFilter((prev) => (prev === column.id ? null : column.id))}
                            className={cx(
                              "flex h-6 w-7 cursor-pointer items-center justify-center rounded border border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-700",
                              hasActiveFilter && "border-blue-300 bg-blue-100 text-blue-700",
                            )}
                            ref={(node) => {
                              filterButtonRefs.current[column.id] = node;
                            }}
                          >
                            <FunnelIcon className="h-4 w-4" />
                          </button>

                          {openFilter === column.id && (
                            <div
                              className={cx(
                                "absolute z-20 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl",
                                alignLeft ? "left-0" : "right-0",
                              )}
                            ref={(node) => {
                              filterDropdownRefs.current[column.id] = node;
                            }}
                          >
                            <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              <span>Filter</span>
                              <button
                                type="button"
                                onClick={() =>
                                  filterType === "date-range"
                                    ? clearFilter(column.id)
                                    : toggleAllCheckboxes(column.id, checkboxOptions)
                                }
                                disabled={filterType !== "date-range" && checkboxOptions.length === 0}
                                className="cursor-pointer text-blue-600 hover:text-blue-700 disabled:text-slate-300 disabled:cursor-not-allowed"
                              >
                                {filterType === "date-range"
                                  ? "Nullstill"
                                  : allCheckboxesChecked
                                    ? "Fjern alle"
                                    : "Merk alle"}
                              </button>
                            </div>

                            {filterType === "date-range" ? (
                              <div className="space-y-3 border-t border-slate-100 px-3 py-3 text-xs text-slate-700">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[11px] uppercase tracking-wide text-slate-500">
                                      Fra
                                    </label>
                                    <input
                                      type="date"
                                      min={minDate ? formatDateInput(minDate) : undefined}
                                      max={defaultTo}
                                      value={dateState?.from ?? defaultFrom ?? ""}
                                      onChange={(e) => setDateRangeFilter(column.id, e.target.value || undefined, dateState?.to)}
                                      className="h-9 rounded-lg border border-slate-200 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[11px] uppercase tracking-wide text-slate-500">
                                      Til
                                    </label>
                                    <input
                                      type="date"
                                      min={minDate ? formatDateInput(minDate) : undefined}
                                      max={defaultTo}
                                      value={dateState?.to ?? defaultTo}
                                      onChange={(e) => setDateRangeFilter(column.id, dateState?.from ?? defaultFrom, e.target.value || undefined)}
                                      className="h-9 rounded-lg border border-slate-200 px-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="max-h-60 overflow-y-auto border-t border-slate-100">
                                  {filterOptions[column.id]?.map((option) => (
                                    <label
                                      key={`${column.id}-${option}`}
                                      className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-normal normal-case text-slate-700 hover:bg-slate-50"
                                    >
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                        checked={
                                          filters[column.id]?.kind === "checkbox"
                                            ? (filters[column.id] as CheckboxFilter).values.has(option)
                                            : false
                                        }
                                        onChange={() => toggleFilterValue(column.id, option)}
                                      />
                                      <span className="truncate" title={option}>
                                        {option}
                                      </span>
                                    </label>
                                  ))}
                                  {(!filterOptions[column.id] || filterOptions[column.id].length === 0) && (
                                    <div className="px-3 py-2 text-sm text-slate-500">Ingen verdier</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-sm">
            {paginatedRows.map((row, rowIndex) => (
              <tr
                key={getRowId ? getRowId(row, startIndex + rowIndex) : startIndex + rowIndex}
                className={cx("hover:bg-slate-50", onRowClick && "cursor-pointer")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.id} className={cx("px-4 py-3 align-top text-slate-700", column.cellClassName)}>
                    {renderCell(row, column)}
                  </td>
                ))}
              </tr>
            ))}

            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-md border border-slate-100 bg-white px-4 py-3 text-sm text-slate-600">
        <span>
          {(() => {
            const displayStart = totalRows === 0 ? 0 : startIndex + 1;
            const displayEnd = totalRows === 0 ? 0 : endIndex;
            return `Viser ${displayStart}–${displayEnd} av ${totalRows}`;
          })()}
        </span>
        {totalRows > PAGE_SIZE && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className={cx(
                "rounded border px-3 py-1 text-sm font-medium cursor-pointer",
                currentPage === 1
                  ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              Forrige
            </button>
            <span className="text-xs text-slate-500">
              Side {currentPage} av {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className={cx(
                "rounded border px-3 py-1 text-sm font-medium cursor-pointer",
                currentPage === totalPages
                  ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              Neste
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default DataTable;
