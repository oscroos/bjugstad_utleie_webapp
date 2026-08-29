"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconLoader2, IconPlus, IconX } from "@tabler/icons-react";
import { standardButtonClass } from "@/lib/buttonStyles";
import {
  CLIENT_TYPE_LABELS,
  CONTRACT_TYPE_LABELS,
  KPI_METRIC_OPTIONS,
  PROJECT_STATUS_LABELS,
  type ClientTypeValue,
  type ContractTypeValue,
  type KpiMetricValue,
  type ProjectStatusValue,
} from "@/lib/project-status";

type FieldTypeValue = "TEXT" | "NUMBER" | "DATE" | "SELECT" | "BOOLEAN";

export type ProjectSetupCustomer = {
  id: number;
  name: string | null;
  organizationNumber: string | null;
};

export type ProjectSetupFieldDefinition = {
  id: string;
  label: string;
  fieldType: FieldTypeValue;
  options: string[];
  required: boolean;
  sortOrder: number;
};

export type ProjectSetupMassType = {
  id: string;
  name: string;
  unit: string;
  defaultClassification: string;
  tonnPerM3: number;
  swellFactor: number;
  sortOrder: number;
};

export type ProjectSetupInitialProject = {
  id: string;
  customerId: number;
  projectNumber: string;
  name: string;
  description: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  contractType: ContractTypeValue | null;
  contractSizeNok: number | null;
  clientType: ClientTypeValue | null;
  clientName: string | null;
  clientAddress: string | null;
  clientEmail: string | null;
  clientContactName: string | null;
  clientContactEmail: string | null;
  clientContactPhone: string | null;
  status: ProjectStatusValue;
  startDate: string | null;
  endDate: string | null;
  fieldValues: Array<{ definitionId: string; value: string }>;
  massTypes: Array<{ massTypeId: string; plannedIn: number; plannedOut: number }>;
  kpis: Array<{
    id: string;
    metric: KpiMetricValue;
    label: string;
    targetValue: number;
    currentValue: number | null;
    unit: string;
    contractRef: string | null;
  }>;
};

type ProjectSetupFormProps = {
  mode: "create" | "edit";
  customers: ProjectSetupCustomer[];
  fieldDefinitions: ProjectSetupFieldDefinition[];
  massTypes: ProjectSetupMassType[];
  project?: ProjectSetupInitialProject;
};

type CoreForm = {
  customerId: string;
  projectNumber: string;
  name: string;
  description: string;
  addressLine: string;
  postalCode: string;
  city: string;
  contractType: string;
  contractSizeNok: string;
  clientType: string;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  clientContactName: string;
  clientContactEmail: string;
  clientContactPhone: string;
  status: ProjectStatusValue;
  startDate: string;
  endDate: string;
};

type MassTypeSelection = {
  selected: boolean;
  plannedIn: string;
  plannedOut: string;
};

type KpiFormRow = {
  id: string;
  metric: KpiMetricValue;
  label: string;
  targetValue: string;
  currentValue: string;
  unit: string;
  contractRef: string;
};

type ApiResponse = {
  ok?: boolean;
  project?: { id: string };
  error?: string;
};

const FIELD_TYPE_LABELS: Record<FieldTypeValue, string> = {
  TEXT: "Tekst",
  NUMBER: "Tall",
  DATE: "Dato",
  SELECT: "Valgliste",
  BOOLEAN: "Ja/nei",
};

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50 disabled:text-slate-500";

const textareaClass =
  "min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const secondaryButtonClass =
  "cursor-pointer inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function ProjectSetupForm({
  mode,
  customers,
  fieldDefinitions,
  massTypes,
  project,
}: ProjectSetupFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<CoreForm>(() => ({
    customerId: project ? String(project.customerId) : customers[0] ? String(customers[0].id) : "",
    projectNumber: project?.projectNumber ?? "",
    name: project?.name ?? "",
    description: project?.description ?? "",
    addressLine: project?.addressLine ?? "",
    postalCode: project?.postalCode ?? "",
    city: project?.city ?? "",
    contractType: project?.contractType ?? "",
    contractSizeNok: optionalDecimalDisplay(project?.contractSizeNok),
    clientType: project?.clientType ?? "",
    clientName: project?.clientName ?? "",
    clientAddress: project?.clientAddress ?? "",
    clientEmail: project?.clientEmail ?? "",
    clientContactName: project?.clientContactName ?? "",
    clientContactEmail: project?.clientContactEmail ?? "",
    clientContactPhone: project?.clientContactPhone ?? "",
    status: project?.status ?? "ACTIVE",
    startDate: toDateInput(project?.startDate),
    endDate: toDateInput(project?.endDate),
  }));
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const initial = new Map(project?.fieldValues.map((row) => [row.definitionId, row.value]) ?? []);
    return Object.fromEntries(
      fieldDefinitions.map((definition) => [definition.id, initial.get(definition.id) ?? ""]),
    );
  });
  const [massSelections, setMassSelections] = useState<Record<string, MassTypeSelection>>(() => {
    const initial = new Map(project?.massTypes.map((row) => [row.massTypeId, row]) ?? []);
    return Object.fromEntries(
      massTypes.map((massType) => {
        const current = initial.get(massType.id);
        return [
          massType.id,
          {
            selected: Boolean(current),
            plannedIn: current ? String(current.plannedIn) : "0",
            plannedOut: current ? String(current.plannedOut) : "0",
          },
        ];
      }),
    );
  });
  const [kpis, setKpis] = useState<KpiFormRow[]>(() =>
    project?.kpis.map((kpi) => ({
      id: kpi.id,
      metric: kpi.metric,
      label: kpi.label,
      targetValue: optionalDecimalDisplay(kpi.targetValue),
      currentValue: optionalDecimalDisplay(kpi.currentValue),
      unit: kpi.unit,
      contractRef: kpi.contractRef ?? "",
    })) ?? [],
  );

  const requiredFieldsComplete = useMemo(
    () =>
      fieldDefinitions.every(
        (definition) => !definition.required || Boolean((fieldValues[definition.id] ?? "").trim()),
      ),
    [fieldDefinitions, fieldValues],
  );
  const kpisComplete = useMemo(
    () =>
      kpis.every(
        (kpi) =>
          Boolean(kpi.label.trim()) &&
          Boolean(kpi.unit.trim()) &&
          isDecimalInput(kpi.targetValue) &&
          (kpi.currentValue.trim() === "" || isDecimalInput(kpi.currentValue)),
      ),
    [kpis],
  );

  const canSubmit =
    !submitting &&
    Boolean(form.customerId) &&
    Boolean(form.projectNumber.trim()) &&
    Boolean(form.name.trim()) &&
    requiredFieldsComplete &&
    kpisComplete;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    setSaved(false);

    const payload = {
      customerId: Number(form.customerId),
      projectNumber: form.projectNumber,
      name: form.name,
      description: form.description,
      addressLine: form.addressLine,
      postalCode: form.postalCode,
      city: form.city,
      contractType: form.contractType,
      contractSizeNok: optionalDecimalInputValue(form.contractSizeNok),
      clientType: form.clientType,
      clientName: form.clientName,
      clientAddress: form.clientAddress,
      clientEmail: form.clientEmail,
      clientContactName: form.clientContactName,
      clientContactEmail: form.clientContactEmail,
      clientContactPhone: form.clientContactPhone,
      status: form.status,
      startDate: form.startDate,
      endDate: form.endDate,
      fieldValues: fieldDefinitions.map((definition) => ({
        definitionId: definition.id,
        value: fieldValues[definition.id] ?? "",
      })),
      massTypes: Object.entries(massSelections)
        .filter(([, value]) => value.selected)
        .map(([massTypeId, value]) => ({
          massTypeId,
          plannedIn: decimalInputValue(value.plannedIn),
          plannedOut: decimalInputValue(value.plannedOut),
        })),
      kpis: kpis.map((kpi) => ({
        metric: kpi.metric,
        label: kpi.label,
        targetValue: decimalInputValue(kpi.targetValue),
        currentValue: optionalDecimalInputValue(kpi.currentValue),
        unit: kpi.unit,
        contractRef: kpi.contractRef,
      })),
    };

    const url = mode === "create" ? "/api/prosjekter" : `/api/prosjekter/${project?.id}/oppsett`;
    const method = mode === "create" ? "POST" : "PUT";

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => ({}))) as ApiResponse;
      if (!response.ok) {
        throw new Error(body.error ?? "Kunne ikke lagre prosjektet");
      }

      if (mode === "create" && body.project?.id) {
        router.push(`/prosjekter/${body.project.id}`);
        router.refresh();
        return;
      }

      setSaved(true);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Kunne ikke lagre prosjektet");
    } finally {
      setSubmitting(false);
    }
  }

  function setCoreValue<K extends keyof CoreForm>(key: K, value: CoreForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setMassSelection(id: string, patch: Partial<MassTypeSelection>) {
    setMassSelections((current) => {
      const existing = current[id] ?? {
        selected: false,
        plannedIn: "0",
        plannedOut: "0",
      };

      return {
        ...current,
        [id]: {
          ...existing,
          ...patch,
        },
      };
    });
  }

  function setKpiValue(id: string, patch: Partial<KpiFormRow>) {
    setKpis((current) =>
      current.map((kpi) => (kpi.id === id ? { ...kpi, ...patch } : kpi)),
    );
  }

  function addKpi() {
    const metric = KPI_METRIC_OPTIONS[0];
    setKpis((current) => [
      ...current,
      {
        id: `new-${Date.now()}-${current.length}`,
        metric: metric.value,
        label: metric.label,
        targetValue: "",
        currentValue: "",
        unit: metric.defaultUnit,
        contractRef: "",
      },
    ]);
  }

  function removeKpi(id: string) {
    setKpis((current) => current.filter((kpi) => kpi.id !== id));
  }

  function setKpiMetric(id: string, metricValue: KpiMetricValue) {
    const metric = KPI_METRIC_OPTIONS.find((option) => option.value === metricValue);
    setKpis((current) =>
      current.map((kpi) =>
        kpi.id === id
          ? {
              ...kpi,
              metric: metricValue,
              label: kpi.label.trim() ? kpi.label : metric?.label ?? kpi.label,
              unit: kpi.unit.trim() ? kpi.unit : metric?.defaultUnit ?? kpi.unit,
            }
          : kpi,
      ),
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-900">Prosjektinformasjon</h2>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Kunde
            <select
              value={form.customerId}
              onChange={(event) => setCoreValue("customerId", event.target.value)}
              disabled={mode === "edit"}
              required
              className={`${inputClass} mt-1`}
            >
              <option value="">Velg kunde</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {formatCustomerLabel(customer)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Prosjektnummer
            <input
              value={form.projectNumber}
              onChange={(event) => setCoreValue("projectNumber", event.target.value)}
              disabled={mode === "edit"}
              required
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Prosjektnavn
            <input
              value={form.name}
              onChange={(event) => setCoreValue("name", event.target.value)}
              required
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Beskrivelse
            <textarea
              value={form.description}
              onChange={(event) => setCoreValue("description", event.target.value)}
              className={`${textareaClass} mt-1`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Adresse
            <input
              value={form.addressLine}
              onChange={(event) => setCoreValue("addressLine", event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Postnummer
            <input
              value={form.postalCode}
              onChange={(event) => setCoreValue("postalCode", event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Sted
            <input
              value={form.city}
              onChange={(event) => setCoreValue("city", event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Status
            <select
              value={form.status}
              onChange={(event) => setCoreValue("status", event.target.value as ProjectStatusValue)}
              className={`${inputClass} mt-1`}
            >
              {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 md:col-span-2 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Startdato
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => setCoreValue("startDate", event.target.value)}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Sluttdato
              <input
                type="date"
                value={form.endDate}
                onChange={(event) => setCoreValue("endDate", event.target.value)}
                className={`${inputClass} mt-1`}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-900">Kontrakt og byggherre</h2>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Kontraktstype
            <select
              value={form.contractType}
              onChange={(event) => setCoreValue("contractType", event.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">Velg kontraktstype</option>
              {Object.entries(CONTRACT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Kontraktsstørrelse NOK
            <input
              value={form.contractSizeNok}
              onChange={(event) => setCoreValue("contractSizeNok", event.target.value)}
              inputMode="decimal"
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Byggherretype
            <select
              value={form.clientType}
              onChange={(event) => setCoreValue("clientType", event.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">Velg byggherretype</option>
              {Object.entries(CLIENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Byggherre
            <input
              value={form.clientName}
              onChange={(event) => setCoreValue("clientName", event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Byggherreadresse
            <input
              value={form.clientAddress}
              onChange={(event) => setCoreValue("clientAddress", event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Byggherre e-post
            <input
              type="email"
              value={form.clientEmail}
              onChange={(event) => setCoreValue("clientEmail", event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Kontaktperson
            <input
              value={form.clientContactName}
              onChange={(event) => setCoreValue("clientContactName", event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Kontakt e-post
            <input
              type="email"
              value={form.clientContactEmail}
              onChange={(event) => setCoreValue("clientContactEmail", event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Kontakt telefon
            <input
              value={form.clientContactPhone}
              onChange={(event) => setCoreValue("clientContactPhone", event.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Kontraktsmål</h2>
          <button type="button" onClick={addKpi} className={secondaryButtonClass}>
            <IconPlus className="h-5 w-5" />
            Legg til mål
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Type</th>
                <th className="px-4 py-3">Navn</th>
                <th className="px-4 py-3">Målverdi</th>
                <th className="px-4 py-3">Målt verdi</th>
                <th className="px-4 py-3">Enhet</th>
                <th className="px-4 py-3">Kontraktspunkt</th>
                <th className="px-6 py-3 text-right">Handling</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {kpis.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Ingen kontraktsmål er lagt inn.
                  </td>
                </tr>
              ) : (
                kpis.map((kpi) => (
                  <tr key={kpi.id}>
                    <td className="min-w-44 px-6 py-3">
                      <select
                        value={kpi.metric}
                        onChange={(event) => setKpiMetric(kpi.id, event.target.value as KpiMetricValue)}
                        className={inputClass}
                      >
                        {KPI_METRIC_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="min-w-48 px-4 py-3">
                      <input
                        value={kpi.label}
                        onChange={(event) => setKpiValue(kpi.id, { label: event.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="min-w-32 px-4 py-3">
                      <input
                        value={kpi.targetValue}
                        onChange={(event) => setKpiValue(kpi.id, { targetValue: event.target.value })}
                        inputMode="decimal"
                        className={inputClass}
                      />
                    </td>
                    <td className="min-w-32 px-4 py-3">
                      <input
                        value={kpi.currentValue}
                        onChange={(event) => setKpiValue(kpi.id, { currentValue: event.target.value })}
                        inputMode="decimal"
                        className={inputClass}
                      />
                    </td>
                    <td className="min-w-28 px-4 py-3">
                      <input
                        value={kpi.unit}
                        onChange={(event) => setKpiValue(kpi.id, { unit: event.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="min-w-40 px-4 py-3">
                      <input
                        value={kpi.contractRef}
                        onChange={(event) => setKpiValue(kpi.id, { contractRef: event.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => removeKpi(kpi.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <IconX className="h-4 w-4" />
                        Fjern
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-900">Egendefinerte felt</h2>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-2">
          {fieldDefinitions.length === 0 ? (
            <p className="text-sm text-slate-500 md:col-span-2">
              Ingen egendefinerte prosjektfelt er aktive.
            </p>
          ) : (
            fieldDefinitions.map((definition) => (
              <CustomFieldControl
                key={definition.id}
                definition={definition}
                value={fieldValues[definition.id] ?? ""}
                onChange={(value) =>
                  setFieldValues((current) => ({ ...current, [definition.id]: value }))
                }
              />
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-900">Masseoppsett</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Massetype</th>
                <th className="px-4 py-3">Enhet</th>
                <th className="px-4 py-3">Tonn/m3</th>
                <th className="px-4 py-3">Plan inn</th>
                <th className="px-4 py-3">Plan ut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {massTypes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Ingen massetyper er aktive.
                  </td>
                </tr>
              ) : (
                massTypes.map((massType) => {
                  const selection = massSelections[massType.id] ?? {
                    selected: false,
                    plannedIn: "0",
                    plannedOut: "0",
                  };
                  return (
                    <tr key={massType.id}>
                      <td className="px-6 py-3">
                        <label className="flex items-center gap-3 font-medium text-slate-900">
                          <input
                            type="checkbox"
                            checked={selection.selected}
                            onChange={(event) =>
                              setMassSelection(massType.id, { selected: event.target.checked })
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          {massType.name}
                        </label>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{massType.unit}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{massType.tonnPerM3}</td>
                      <td className="px-4 py-3">
                        <input
                          value={selection.plannedIn}
                          onChange={(event) =>
                            setMassSelection(massType.id, { plannedIn: event.target.value })
                          }
                          disabled={!selection.selected}
                          inputMode="decimal"
                          className={inputClass}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={selection.plannedOut}
                          onChange={(event) =>
                            setMassSelection(massType.id, { plannedOut: event.target.value })
                          }
                          disabled={!selection.selected}
                          inputMode="decimal"
                          className={inputClass}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Lukk feil">
            <IconX className="h-4 w-4" />
          </button>
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          <IconCheck className="h-4 w-4" />
          Prosjektoppsettet er lagret.
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => router.back()} className={standardButtonClass}>
          Avbryt
        </button>
        <button type="submit" disabled={!canSubmit} className={standardButtonClass}>
          {submitting ? (
            <>
              <IconLoader2 className="h-5 w-5 animate-spin" />
              Lagrer...
            </>
          ) : mode === "create" ? (
            <>
              <IconPlus className="h-5 w-5" />
              Opprett prosjekt
            </>
          ) : (
            <>
              <IconCheck className="h-5 w-5" />
              Lagre oppsett
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function CustomFieldControl({
  definition,
  value,
  onChange,
}: {
  definition: ProjectSetupFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  const label = (
    <>
      {definition.label}
      {definition.required ? <span className="ml-1 text-red-600">*</span> : null}
    </>
  );

  if (definition.fieldType === "SELECT") {
    return (
      <label className="text-sm font-medium text-slate-700">
        {label}
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={definition.required}
          className={`${inputClass} mt-1`}
        >
          <option value="">Velg</option>
          {definition.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (definition.fieldType === "BOOLEAN") {
    return (
      <label className="text-sm font-medium text-slate-700">
        {label}
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={definition.required}
          className={`${inputClass} mt-1`}
        >
          <option value="">Velg</option>
          <option value="true">Ja</option>
          <option value="false">Nei</option>
        </select>
      </label>
    );
  }

  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        type={definition.fieldType === "DATE" ? "date" : definition.fieldType === "NUMBER" ? "number" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={definition.required}
        className={`${inputClass} mt-1`}
      />
      <span className="mt-1 block text-xs text-slate-400">
        {FIELD_TYPE_LABELS[definition.fieldType]}
      </span>
    </label>
  );
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function decimalInputValue(value: string) {
  return value.replace(",", ".").trim() || "0";
}

function optionalDecimalInputValue(value: string) {
  return value.trim() ? value.replace(",", ".").trim() : "";
}

function optionalDecimalDisplay(value?: number | null) {
  return value === null || value === undefined ? "" : String(value);
}

function isDecimalInput(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return false;
  return Number.isFinite(Number(normalized));
}

function formatCustomerLabel(customer: ProjectSetupCustomer) {
  const name = customer.name?.trim() || `Kunde ${customer.id}`;
  return customer.organizationNumber ? `${name} (${customer.organizationNumber})` : name;
}
