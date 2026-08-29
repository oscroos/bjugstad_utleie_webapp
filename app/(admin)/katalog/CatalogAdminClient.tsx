"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  IconCheck,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  destructiveButtonCompactClass,
  standardButtonClass,
  standardButtonCompactClass,
} from "@/lib/buttonStyles";

export type FieldTypeValue = "TEXT" | "NUMBER" | "DATE" | "SELECT" | "BOOLEAN";

export type MassTypeRow = {
  id: string;
  name: string;
  unit: string;
  defaultClassification: string;
  tonnPerM3: number;
  swellFactor: number;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type FieldDefinitionRow = {
  id: string;
  label: string;
  fieldType: FieldTypeValue;
  options: string[];
  required: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type CatalogAdminClientProps = {
  initialMassTypes: MassTypeRow[];
  initialFieldDefinitions: FieldDefinitionRow[];
};

type MassTypeForm = {
  name: string;
  unit: string;
  defaultClassification: string;
  tonnPerM3: string;
  swellFactor: string;
  sortOrder: string;
};

type FieldDefinitionForm = {
  label: string;
  fieldType: FieldTypeValue;
  options: string;
  required: boolean;
  sortOrder: string;
};

type ToastState = {
  type: "success" | "error";
  message: string;
};

type CatalogResponse = {
  massTypes?: MassTypeRow[];
  fieldDefinitions?: FieldDefinitionRow[];
  massType?: MassTypeRow;
  fieldDefinition?: FieldDefinitionRow;
  mode?: "deleted" | "deactivated";
  error?: string;
};

const FIELD_TYPE_LABELS: Record<FieldTypeValue, string> = {
  TEXT: "Tekst",
  NUMBER: "Tall",
  DATE: "Dato",
  SELECT: "Valgliste",
  BOOLEAN: "Ja/nei",
};

const FIELD_TYPES = Object.keys(FIELD_TYPE_LABELS) as FieldTypeValue[];

const emptyMassForm: MassTypeForm = {
  name: "",
  unit: "m3",
  defaultClassification: "UNKNOWN",
  tonnPerM3: "1.6",
  swellFactor: "1.0",
  sortOrder: "0",
};

const emptyFieldForm: FieldDefinitionForm = {
  label: "",
  fieldType: "TEXT",
  options: "",
  required: false,
  sortOrder: "0",
};

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const textareaClass =
  "min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const secondaryButtonClass =
  "cursor-pointer inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function CatalogAdminClient({
  initialMassTypes,
  initialFieldDefinitions,
}: CatalogAdminClientProps) {
  const [massTypes, setMassTypes] = useState(initialMassTypes);
  const [fieldDefinitions, setFieldDefinitions] = useState(initialFieldDefinitions);
  const [massForm, setMassForm] = useState<MassTypeForm>(emptyMassForm);
  const [fieldForm, setFieldForm] = useState<FieldDefinitionForm>(emptyFieldForm);
  const [editingMassTypeId, setEditingMassTypeId] = useState<string | null>(null);
  const [editingFieldDefinitionId, setEditingFieldDefinitionId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const massTypeStats = useMemo(
    () => ({
      active: massTypes.filter((row) => row.active).length,
      inactive: massTypes.filter((row) => !row.active).length,
    }),
    [massTypes],
  );

  const fieldStats = useMemo(
    () => ({
      active: fieldDefinitions.filter((row) => row.active).length,
      required: fieldDefinitions.filter((row) => row.active && row.required).length,
    }),
    [fieldDefinitions],
  );

  async function reloadCatalog() {
    setBusyKey("reload");
    try {
      const payload = await requestCatalog("GET");
      setMassTypes(sortMassTypes(payload.massTypes ?? []));
      setFieldDefinitions(sortFieldDefinitions(payload.fieldDefinitions ?? []));
      setToast({ type: "success", message: "Katalogene er oppdatert" });
    } catch (error) {
      setToast({ type: "error", message: getErrorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  async function saveMassType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = editingMassTypeId ? `mass-save-${editingMassTypeId}` : "mass-create";
    setBusyKey(key);

    try {
      const payload = await requestCatalog(editingMassTypeId ? "PATCH" : "POST", {
        kind: "massType",
        id: editingMassTypeId,
        name: massForm.name,
        unit: massForm.unit,
        defaultClassification: massForm.defaultClassification,
        tonnPerM3: decimalInputValue(massForm.tonnPerM3),
        swellFactor: decimalInputValue(massForm.swellFactor),
        sortOrder: Number(massForm.sortOrder || 0),
      });

      if (!payload.massType) throw new Error("Responsen mangler massetype");
      const massType = payload.massType;
      setMassTypes((current) => upsertMassType(current, massType));
      setMassForm(emptyMassForm);
      setEditingMassTypeId(null);
      setToast({ type: "success", message: "Massetype lagret" });
    } catch (error) {
      setToast({ type: "error", message: getErrorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  async function saveFieldDefinition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = editingFieldDefinitionId
      ? `field-save-${editingFieldDefinitionId}`
      : "field-create";
    setBusyKey(key);

    try {
      const payload = await requestCatalog(editingFieldDefinitionId ? "PATCH" : "POST", {
        kind: "fieldDefinition",
        id: editingFieldDefinitionId,
        label: fieldForm.label,
        fieldType: fieldForm.fieldType,
        options: fieldForm.options,
        required: fieldForm.required,
        sortOrder: Number(fieldForm.sortOrder || 0),
      });

      if (!payload.fieldDefinition) throw new Error("Responsen mangler feltdefinisjon");
      const fieldDefinition = payload.fieldDefinition;
      setFieldDefinitions((current) => upsertFieldDefinition(current, fieldDefinition));
      setFieldForm(emptyFieldForm);
      setEditingFieldDefinitionId(null);
      setToast({ type: "success", message: "Prosjektfelt lagret" });
    } catch (error) {
      setToast({ type: "error", message: getErrorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleMassType(row: MassTypeRow) {
    setBusyKey(`mass-active-${row.id}`);
    try {
      const payload = await requestCatalog("PATCH", {
        kind: "massType",
        id: row.id,
        active: !row.active,
      });
      if (!payload.massType) throw new Error("Responsen mangler massetype");
      const massType = payload.massType;
      setMassTypes((current) => upsertMassType(current, massType));
    } catch (error) {
      setToast({ type: "error", message: getErrorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleFieldDefinition(row: FieldDefinitionRow) {
    setBusyKey(`field-active-${row.id}`);
    try {
      const payload = await requestCatalog("PATCH", {
        kind: "fieldDefinition",
        id: row.id,
        active: !row.active,
      });
      if (!payload.fieldDefinition) throw new Error("Responsen mangler feltdefinisjon");
      const fieldDefinition = payload.fieldDefinition;
      setFieldDefinitions((current) => upsertFieldDefinition(current, fieldDefinition));
    } catch (error) {
      setToast({ type: "error", message: getErrorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteMassType(row: MassTypeRow) {
    if (!window.confirm(`Slette massetypen "${row.name}"?`)) return;
    setBusyKey(`mass-delete-${row.id}`);
    try {
      const payload = await requestCatalog("DELETE", { kind: "massType", id: row.id });
      if (payload.mode === "deleted") {
        setMassTypes((current) => current.filter((item) => item.id !== row.id));
        setToast({ type: "success", message: "Massetype slettet" });
      } else if (payload.massType) {
        const massType = payload.massType;
        setMassTypes((current) => upsertMassType(current, massType));
        setToast({ type: "success", message: "Massetype er i bruk og ble deaktivert" });
      }
    } catch (error) {
      setToast({ type: "error", message: getErrorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteFieldDefinition(row: FieldDefinitionRow) {
    if (!window.confirm(`Slette prosjektfeltet "${row.label}"?`)) return;
    setBusyKey(`field-delete-${row.id}`);
    try {
      const payload = await requestCatalog("DELETE", { kind: "fieldDefinition", id: row.id });
      if (payload.mode === "deleted") {
        setFieldDefinitions((current) => current.filter((item) => item.id !== row.id));
        setToast({ type: "success", message: "Prosjektfelt slettet" });
      } else if (payload.fieldDefinition) {
        const fieldDefinition = payload.fieldDefinition;
        setFieldDefinitions((current) => upsertFieldDefinition(current, fieldDefinition));
        setToast({ type: "success", message: "Prosjektfeltet er i bruk og ble deaktivert" });
      }
    } catch (error) {
      setToast({ type: "error", message: getErrorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  function startEditingMassType(row: MassTypeRow) {
    setEditingMassTypeId(row.id);
    setMassForm({
      name: row.name,
      unit: row.unit,
      defaultClassification: row.defaultClassification,
      tonnPerM3: String(row.tonnPerM3),
      swellFactor: String(row.swellFactor),
      sortOrder: String(row.sortOrder),
    });
  }

  function startEditingFieldDefinition(row: FieldDefinitionRow) {
    setEditingFieldDefinitionId(row.id);
    setFieldForm({
      label: row.label,
      fieldType: row.fieldType,
      options: row.options.join("\n"),
      required: row.required,
      sortOrder: String(row.sortOrder),
    });
  }

  function cancelMassEdit() {
    setEditingMassTypeId(null);
    setMassForm(emptyMassForm);
  }

  function cancelFieldEdit() {
    setEditingFieldDefinitionId(null);
    setFieldForm(emptyFieldForm);
  }

  const canSaveMassType =
    massForm.name.trim().length > 0 &&
    Number.isFinite(Number(decimalInputValue(massForm.tonnPerM3))) &&
    Number(decimalInputValue(massForm.tonnPerM3)) > 0 &&
    Number.isFinite(Number(decimalInputValue(massForm.swellFactor))) &&
    Number(decimalInputValue(massForm.swellFactor)) > 0;

  const canSaveFieldDefinition =
    fieldForm.label.trim().length > 0 &&
    (fieldForm.fieldType !== "SELECT" || fieldForm.options.trim().length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <StatusPill label="Aktive massetyper" value={massTypeStats.active} />
          <StatusPill label="Inaktive massetyper" value={massTypeStats.inactive} />
          <StatusPill label="Aktive prosjektfelt" value={fieldStats.active} />
          <StatusPill label="Påkrevde felt" value={fieldStats.required} />
        </div>
        <button
          type="button"
          onClick={reloadCatalog}
          disabled={busyKey === "reload"}
          className={secondaryButtonClass}
        >
          {busyKey === "reload" ? (
            <IconLoader2 className="h-5 w-5 animate-spin" />
          ) : (
            <IconRefresh className="h-5 w-5" />
          )}
          Oppdater
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-900">Massetyper</h2>
          <p className="mt-1 text-sm text-slate-600">
            Global katalog for masseplaner og senere lasslister.
          </p>
        </div>

        <form onSubmit={saveMassType} className="grid gap-4 border-b border-slate-100 p-6 lg:grid-cols-[1.4fr_0.8fr_0.9fr_0.8fr_0.8fr_0.6fr_auto]">
          <label className="text-sm font-medium text-slate-700">
            Navn
            <input
              value={massForm.name}
              onChange={(event) => setMassForm((current) => ({ ...current, name: event.target.value }))}
              className={`${inputClass} mt-1`}
              placeholder="Sprengstein"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Enhet
            <select
              value={massForm.unit}
              onChange={(event) => setMassForm((current) => ({ ...current, unit: event.target.value }))}
              className={`${inputClass} mt-1`}
            >
              <option value="m3">m3</option>
              <option value="tonn">tonn</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Klassifisering
            <select
              value={massForm.defaultClassification}
              onChange={(event) =>
                setMassForm((current) => ({ ...current, defaultClassification: event.target.value }))
              }
              className={`${inputClass} mt-1`}
            >
              <option value="UNKNOWN">Uklassifisert</option>
              <option value="CLEAN">Ren</option>
              <option value="CONTAMINATED">Forurenset</option>
              <option value="HAZARDOUS">Farlig avfall</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Tonn/m3
            <input
              value={massForm.tonnPerM3}
              onChange={(event) => setMassForm((current) => ({ ...current, tonnPerM3: event.target.value }))}
              className={`${inputClass} mt-1`}
              inputMode="decimal"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Svellefaktor
            <input
              value={massForm.swellFactor}
              onChange={(event) => setMassForm((current) => ({ ...current, swellFactor: event.target.value }))}
              className={`${inputClass} mt-1`}
              inputMode="decimal"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Sortering
            <input
              value={massForm.sortOrder}
              onChange={(event) => setMassForm((current) => ({ ...current, sortOrder: event.target.value }))}
              className={`${inputClass} mt-1`}
              inputMode="numeric"
            />
          </label>
          <div className="flex items-end gap-2">
            {editingMassTypeId && (
              <button type="button" onClick={cancelMassEdit} className={secondaryButtonClass}>
                <IconX className="h-5 w-5" />
                Avbryt
              </button>
            )}
            <button
              type="submit"
              disabled={!canSaveMassType || busyKey === "mass-create"}
              className={standardButtonClass}
            >
              {busyKey?.startsWith("mass-save") || busyKey === "mass-create" ? (
                <IconLoader2 className="h-5 w-5 animate-spin" />
              ) : editingMassTypeId ? (
                <IconCheck className="h-5 w-5" />
              ) : (
                <IconPlus className="h-5 w-5" />
              )}
              {editingMassTypeId ? "Lagre" : "Legg til"}
            </button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Navn</th>
                <th className="px-4 py-3">Enhet</th>
                <th className="px-4 py-3">Tonn/m3</th>
                <th className="px-4 py-3">Svellefaktor</th>
                <th className="px-4 py-3">Klassifisering</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-6 py-3 text-right">Handlinger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {massTypes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Ingen massetyper er opprettet.
                  </td>
                </tr>
              ) : (
                massTypes.map((row) => (
                  <tr key={row.id} className={row.active ? "" : "bg-slate-50 text-slate-500"}>
                    <td className="px-6 py-3 font-medium text-slate-900">{row.name}</td>
                    <td className="px-4 py-3">{row.unit}</td>
                    <td className="px-4 py-3 tabular-nums">{row.tonnPerM3}</td>
                    <td className="px-4 py-3 tabular-nums">{row.swellFactor}</td>
                    <td className="px-4 py-3">{classificationLabel(row.defaultClassification)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge active={row.active} />
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEditingMassType(row)}
                          className={secondaryButtonClass}
                        >
                          <IconPencil className="h-4 w-4" />
                          Rediger
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleMassType(row)}
                          disabled={busyKey === `mass-active-${row.id}`}
                          className={standardButtonCompactClass}
                        >
                          {busyKey === `mass-active-${row.id}` ? (
                            <IconLoader2 className="h-4 w-4 animate-spin" />
                          ) : row.active ? (
                            <IconX className="h-4 w-4" />
                          ) : (
                            <IconCheck className="h-4 w-4" />
                          )}
                          {row.active ? "Deaktiver" : "Aktiver"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMassType(row)}
                          disabled={busyKey === `mass-delete-${row.id}`}
                          className={destructiveButtonCompactClass}
                        >
                          {busyKey === `mass-delete-${row.id}` ? (
                            <IconLoader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <IconTrash className="h-4 w-4" />
                          )}
                          Slett
                        </button>
                      </div>
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
          <h2 className="text-xl font-semibold text-slate-900">Egendefinerte prosjektfelt</h2>
          <p className="mt-1 text-sm text-slate-600">
            Felt som legges inn i prosjektoppsettet for alle nye prosjekter.
          </p>
        </div>

        <form onSubmit={saveFieldDefinition} className="grid gap-4 border-b border-slate-100 p-6 lg:grid-cols-[1.5fr_0.9fr_1.5fr_0.7fr_auto]">
          <label className="text-sm font-medium text-slate-700">
            Etikett
            <input
              value={fieldForm.label}
              onChange={(event) => setFieldForm((current) => ({ ...current, label: event.target.value }))}
              className={`${inputClass} mt-1`}
              placeholder="SHA-koordinator"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Type
            <select
              value={fieldForm.fieldType}
              onChange={(event) =>
                setFieldForm((current) => ({ ...current, fieldType: event.target.value as FieldTypeValue }))
              }
              className={`${inputClass} mt-1`}
            >
              {FIELD_TYPES.map((fieldType) => (
                <option key={fieldType} value={fieldType}>
                  {FIELD_TYPE_LABELS[fieldType]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Valg
            <textarea
              value={fieldForm.options}
              onChange={(event) => setFieldForm((current) => ({ ...current, options: event.target.value }))}
              disabled={fieldForm.fieldType !== "SELECT"}
              className={`${textareaClass} mt-1 disabled:bg-slate-50 disabled:text-slate-400`}
              placeholder="Ett valg per linje"
            />
          </label>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Sortering
              <input
                value={fieldForm.sortOrder}
                onChange={(event) => setFieldForm((current) => ({ ...current, sortOrder: event.target.value }))}
                className={`${inputClass} mt-1`}
                inputMode="numeric"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={fieldForm.required}
                onChange={(event) =>
                  setFieldForm((current) => ({ ...current, required: event.target.checked }))
                }
                className="h-4 w-4 rounded border-slate-300"
              />
              Påkrevd
            </label>
          </div>
          <div className="flex items-end gap-2">
            {editingFieldDefinitionId && (
              <button type="button" onClick={cancelFieldEdit} className={secondaryButtonClass}>
                <IconX className="h-5 w-5" />
                Avbryt
              </button>
            )}
            <button
              type="submit"
              disabled={!canSaveFieldDefinition || busyKey === "field-create"}
              className={standardButtonClass}
            >
              {busyKey?.startsWith("field-save") || busyKey === "field-create" ? (
                <IconLoader2 className="h-5 w-5 animate-spin" />
              ) : editingFieldDefinitionId ? (
                <IconCheck className="h-5 w-5" />
              ) : (
                <IconPlus className="h-5 w-5" />
              )}
              {editingFieldDefinitionId ? "Lagre" : "Legg til"}
            </button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Etikett</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Valg</th>
                <th className="px-4 py-3">Påkrevd</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-6 py-3 text-right">Handlinger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {fieldDefinitions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Ingen prosjektfelt er opprettet.
                  </td>
                </tr>
              ) : (
                fieldDefinitions.map((row) => (
                  <tr key={row.id} className={row.active ? "" : "bg-slate-50 text-slate-500"}>
                    <td className="px-6 py-3 font-medium text-slate-900">{row.label}</td>
                    <td className="px-4 py-3">{FIELD_TYPE_LABELS[row.fieldType]}</td>
                    <td className="px-4 py-3">
                      {row.options.length ? row.options.join(", ") : "-"}
                    </td>
                    <td className="px-4 py-3">{row.required ? "Ja" : "Nei"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge active={row.active} />
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEditingFieldDefinition(row)}
                          className={secondaryButtonClass}
                        >
                          <IconPencil className="h-4 w-4" />
                          Rediger
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFieldDefinition(row)}
                          disabled={busyKey === `field-active-${row.id}`}
                          className={standardButtonCompactClass}
                        >
                          {busyKey === `field-active-${row.id}` ? (
                            <IconLoader2 className="h-4 w-4 animate-spin" />
                          ) : row.active ? (
                            <IconX className="h-4 w-4" />
                          ) : (
                            <IconCheck className="h-4 w-4" />
                          )}
                          {row.active ? "Deaktiver" : "Aktiver"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteFieldDefinition(row)}
                          disabled={busyKey === `field-delete-${row.id}`}
                          className={destructiveButtonCompactClass}
                        >
                          {busyKey === `field-delete-${row.id}` ? (
                            <IconLoader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <IconTrash className="h-4 w-4" />
                          )}
                          Slett
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 w-80 rounded-xl border px-4 py-3 shadow-lg ${
            toast.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold">
              {toast.type === "success" ? "Lagret" : "Feil"}
            </p>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="rounded p-0.5 text-current opacity-70 hover:opacity-100"
              aria-label="Lukk melding"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-sm leading-relaxed">{toast.message}</p>
        </div>
      )}
    </div>
  );
}

async function requestCatalog(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  payload?: Record<string, unknown>,
): Promise<CatalogResponse> {
  const response = await fetch("/api/admin/katalog", {
    method,
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });

  const body = (await response.json().catch(() => ({}))) as CatalogResponse;
  if (!response.ok) throw new Error(body.error ?? "Kunne ikke lagre katalog");
  return body;
}

function upsertMassType(rows: MassTypeRow[], next: MassTypeRow) {
  const found = rows.some((row) => row.id === next.id);
  return sortMassTypes(found ? rows.map((row) => (row.id === next.id ? next : row)) : [...rows, next]);
}

function upsertFieldDefinition(rows: FieldDefinitionRow[], next: FieldDefinitionRow) {
  const found = rows.some((row) => row.id === next.id);
  return sortFieldDefinitions(found ? rows.map((row) => (row.id === next.id ? next : row)) : [...rows, next]);
}

function sortMassTypes(rows: MassTypeRow[]) {
  return [...rows].sort((a, b) => sortCatalogRows(a, b, "name"));
}

function sortFieldDefinitions(rows: FieldDefinitionRow[]) {
  return [...rows].sort((a, b) => sortCatalogRows(a, b, "label"));
}

function sortCatalogRows<T extends { active: boolean; sortOrder: number }>(
  a: T,
  b: T,
  labelKey: T extends MassTypeRow ? "name" : "label",
) {
  if (a.active !== b.active) return a.active ? -1 : 1;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const left = String(a[labelKey as keyof T] ?? "");
  const right = String(b[labelKey as keyof T] ?? "");
  return left.localeCompare(right, "nb-NO", { sensitivity: "base" });
}

function decimalInputValue(value: string) {
  return value.replace(",", ".").trim();
}

function classificationLabel(value: string) {
  switch (value) {
    case "CLEAN":
      return "Ren";
    case "CONTAMINATED":
      return "Forurenset";
    case "HAZARDOUS":
      return "Farlig avfall";
    default:
      return "Uklassifisert";
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Noe gikk galt";
}

function StatusPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 shadow-sm">
      <span>{label}</span>
      <span className="font-semibold text-slate-950">{value}</span>
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"
      }`}
    >
      {active ? "Aktiv" : "Inaktiv"}
    </span>
  );
}
