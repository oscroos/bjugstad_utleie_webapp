"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { IconCheck, IconLoader2, IconPencil } from "@tabler/icons-react";
import { useDialogs } from "@/components/dialogs/ConfirmDialog";
import { standardButtonClass } from "@/lib/buttonStyles";
import { formatDate } from "@/lib/formatters";
import {
  CLIENT_TYPE_LABELS,
  CONTRACT_TYPE_LABELS,
  type ClientTypeValue,
  type ContractTypeValue,
} from "@/lib/project-status";
import type { ProjectWorkspace } from "@/lib/projects";
import {
  isDecimalInput,
  optionalDecimalDisplay,
  optionalDecimalInputValue,
  toDateInput,
} from "../ProjectSetupForm";

// The "Om prosjektet" box. The pencil turns the box itself into a form: the same
// rows, now editable, with Avbryt and Lagre underneath.
//
// While it is being edited, the rest of the page is dimmed and cannot be used.
// Clicking anywhere outside the box (a tab, the sidebar, another button) asks
// what to do with unsaved changes, and then carries on to what was clicked.

type AboutDraft = {
  name: string;
  description: string;
  addressLine: string;
  postalCode: string;
  city: string;
  contractType: string;
  contractSizeNok: string;
  startDate: string;
  endDate: string;
  clientName: string;
  clientType: string;
  clientAddress: string;
  clientEmail: string;
  clientContactName: string;
  clientContactPhone: string;
  clientContactEmail: string;
};

// If the reloaded project has not arrived this long after a save, stop waiting.
const REFRESH_TIMEOUT_MS = 8_000;

const cardClass = "rounded-2xl border border-slate-200 bg-white shadow-sm";
// Without a width, for fields that share a row (postal code and city).
const inputBaseClass =
  "h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50 disabled:text-slate-500";
const inputClass = `${inputBaseClass} w-full`;
const secondaryButtonClass =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const iconButtonClass =
  "inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50";

export default function ProjectAboutSection({
  project,
  canEdit,
  onSaved,
}: {
  project: ProjectWorkspace;
  canEdit: boolean;
  /** Called after a successful save; the page should reload the project. */
  onSaved: () => void;
}) {
  const { confirm, choose } = useDialogs();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AboutDraft>(() => toDraft(project));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  // Set while a save is waiting for the reloaded project: the value `updatedAt` had before the save.
  const savedFromRef = useRef<string | null>(null);
  // What to do once editing has ended, for example click the tab the user was heading for.
  const afterLeaveRef = useRef<(() => void) | null>(null);
  const idPrefix = useId();

  const original = useMemo(() => toDraft(project), [project]);
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(original);

  const validationError = useMemo(() => {
    if (!draft.name.trim()) return "Prosjektnavn må fylles ut.";
    if (!/^\d*$/.test(draft.postalCode.trim())) return "Postnummer kan bare inneholde tall.";
    const sum = draft.contractSizeNok.trim();
    if (sum && (!isDecimalInput(sum) || Number(sum.replace(",", ".")) < 0)) {
      return "Kontraktssum må være et tall, 0 eller høyere.";
    }
    if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
      return "Sluttfrist kan ikke være før oppstart.";
    }
    return null;
  }, [draft.contractSizeNok, draft.endDate, draft.name, draft.postalCode, draft.startDate]);

  function startEditing() {
    setDraft(toDraft(project));
    setError(null);
    setEditing(true);
  }

  /** Back to the read view, then do whatever was waiting (if anything). */
  const leave = useCallback(() => {
    savedFromRef.current = null;
    setEditing(false);
    setSaving(false);
    setError(null);
    const next = afterLeaveRef.current;
    afterLeaveRef.current = null;
    // After this render, so the dimming is gone before the click is passed on.
    if (next) window.setTimeout(next, 0);
  }, []);

  // A save is finished when the reloaded project arrives, so the box never
  // flashes the old values between "saved" and "reloaded".
  useEffect(() => {
    if (savedFromRef.current !== null && project.updatedAt !== savedFromRef.current) leave();
  }, [leave, project.updatedAt]);

  async function save(): Promise<boolean> {
    if (saving) return false;
    if (!dirty) {
      leave();
      return true;
    }
    if (validationError) {
      setError(validationError);
      return false;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/prosjekter/${project.id}/oppsett`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Only this box's fields are sent; the server leaves everything else as it is.
        body: JSON.stringify({ ...draft, contractSizeNok: optionalDecimalInputValue(draft.contractSizeNok) }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Kunne ikke lagre endringene");

      savedFromRef.current = project.updatedAt;
      onSaved();
      window.setTimeout(() => {
        if (savedFromRef.current !== null) leave();
      }, REFRESH_TIMEOUT_MS);
      return true;
    } catch (saveError) {
      setSaving(false);
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke lagre endringene");
      return false;
    }
  }

  /** "Avbryt" and Escape: drop the changes, after asking if there are any. */
  async function cancel() {
    if (saving) return;
    if (dirty) {
      const discard = await confirm({
        title: "Forkaste endringene?",
        message: "Endringene i «Om prosjektet» er ikke lagret.",
        confirmLabel: "Forkast",
        cancelLabel: "Fortsett å redigere",
        closeInCorner: true,
        tone: "danger",
      });
      if (!discard) return;
    }
    leave();
  }

  /** The user is heading somewhere else on the page. `next` carries on to it afterwards. */
  async function leaveFor(next: (() => void) | null) {
    if (saving) return;
    if (!dirty) {
      afterLeaveRef.current = next;
      leave();
      return;
    }

    const answer = await choose({
      title: "Du har endringer som ikke er lagret",
      message: "Går du videre uten å lagre, blir endringene i «Om prosjektet» slettet.",
      cancelLabel: "Fortsett å redigere",
      closeInCorner: true,
      actions: [
        { value: "discard", label: "Forkast endringer", tone: "danger" },
        { value: "save", label: "Lagre og gå videre", tone: "primary" },
      ],
    });

    if (answer === "discard") {
      afterLeaveRef.current = next;
      leave();
    } else if (answer === "save") {
      afterLeaveRef.current = next;
      const saved = await save();
      // A failed save keeps the user in the box, with the error shown.
      if (!saved) afterLeaveRef.current = null;
    }
  }

  // A click on the dimmed area: find what is underneath, so it can be clicked for the user afterwards.
  function onBackdropClick(event: MouseEvent<HTMLDivElement>) {
    const target = clickableBelow(event.clientX, event.clientY, backdropRef.current);
    void leaveFor(target ? () => target.isConnected && target.click() : null);
  }

  // Keep the keyboard inside the box, so Tab cannot reach the page behind the dimming.
  function onBoxKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!editing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      void cancel();
      return;
    }
    if (event.key !== "Tab" || !boxRef.current) return;
    const focusable = Array.from(
      boxRef.current.querySelectorAll<HTMLElement>("input, select, textarea, button, a[href]"),
    ).filter((element) => !element.hasAttribute("disabled"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    if (!editing) return;
    boxRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    boxRef.current?.querySelector<HTMLElement>("textarea, input, select")?.focus({ preventScroll: true });
  }, [editing]);

  // Closing the tab or reloading with unsaved changes: the browser's own warning.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function set<K extends keyof AboutDraft>(key: K, value: AboutDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  const id = (name: string) => `${idPrefix}-${name}`;

  if (!editing) {
    return (
      <section className={cardClass}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Om prosjektet</h2>
          {canEdit ? (
            <button
              type="button"
              onClick={startEditing}
              aria-label="Rediger om prosjektet"
              title="Rediger om prosjektet"
              className={iconButtonClass}
            >
              <IconPencil className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {project.description ? (
          <p className="whitespace-pre-wrap border-b border-slate-100 px-6 py-4 text-sm leading-relaxed text-slate-700">
            {project.description}
          </p>
        ) : null}

        <dl className="divide-y divide-slate-100">
          <InfoRow label="Prosjektnavn">{project.name}</InfoRow>
          <InfoRow label="Kunde">{project.customerName ?? `Kunde ${project.customerId}`}</InfoRow>
          <InfoRow label="Sted">{formatAddressInline(project)}</InfoRow>
          <InfoRow label="Kontrakt">
            {project.contractType ? CONTRACT_TYPE_LABELS[project.contractType as ContractTypeValue] : "Ikke satt"}
          </InfoRow>
          <InfoRow label="Kontraktssum">{formatCurrency(project.contractSizeNok)}</InfoRow>
          <InfoRow label="Oppstart">{formatDate(project.startDate, { showTime: false }) ?? "Ikke satt"}</InfoRow>
          <InfoRow label="Sluttfrist">{formatDate(project.endDate, { showTime: false }) ?? "Ikke satt"}</InfoRow>
          <InfoRow label="Byggherre">{project.clientName ?? "Ikke registrert"}</InfoRow>
          <InfoRow label="Byggherretype">
            {project.clientType ? CLIENT_TYPE_LABELS[project.clientType as ClientTypeValue] : "Ikke satt"}
          </InfoRow>
          <InfoRow label="Byggherre adresse">{project.clientAddress ?? "-"}</InfoRow>
          <InfoRow label="Byggherre e-post">
            {project.clientEmail ? (
              <a href={`mailto:${project.clientEmail}`} className="text-blue-700 hover:underline">
                {project.clientEmail}
              </a>
            ) : (
              "-"
            )}
          </InfoRow>
          <InfoRow label="Byggherre kontaktperson">{project.clientContactName ?? "-"}</InfoRow>
          <InfoRow label="Kontaktperson telefon">
            {project.clientContactPhone ? (
              <a href={`tel:${project.clientContactPhone}`} className="hover:underline">
                {project.clientContactPhone}
              </a>
            ) : (
              "-"
            )}
          </InfoRow>
          <InfoRow label="Kontaktperson e-post">
            {project.clientContactEmail ? (
              <a href={`mailto:${project.clientContactEmail}`} className="text-blue-700 hover:underline">
                {project.clientContactEmail}
              </a>
            ) : (
              "-"
            )}
          </InfoRow>
        </dl>

        <p className="border-t border-slate-100 px-6 py-3 text-right text-xs text-slate-400">
          Sist oppdatert {formatDate(project.updatedAt) ?? "-"}
        </p>
      </section>
    );
  }

  return (
    <>
      {/* Dims everything else and catches clicks on it. */}
      <div
        ref={backdropRef}
        onClick={onBackdropClick}
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-slate-900/50"
      />

      <section
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label="Rediger om prosjektet"
        onKeyDown={onBoxKeyDown}
        className={`${cardClass} relative z-50 ring-2 ring-blue-500`}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Om prosjektet</h2>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Redigerer</span>
          </div>

          <div className="border-b border-slate-100 px-6 py-4">
            <label htmlFor={id("description")} className="text-sm text-slate-500">
              Beskrivelse
            </label>
            <textarea
              id={id("description")}
              value={draft.description}
              onChange={(event) => set("description", event.target.value)}
              disabled={saving}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:bg-slate-50"
            />
          </div>

          <div className="divide-y divide-slate-100">
            <EditRow label="Prosjektnavn" htmlFor={id("name")}>
              <input
                id={id("name")}
                value={draft.name}
                onChange={(event) => set("name", event.target.value)}
                disabled={saving}
                required
                className={inputClass}
              />
            </EditRow>
            <div className="flex items-baseline justify-between gap-4 px-6 py-2.5">
              <span className="shrink-0 text-sm text-slate-500">Kunde</span>
              <span className="min-w-0 truncate text-right text-sm font-semibold text-slate-900">
                {project.customerName ?? `Kunde ${project.customerId}`}
              </span>
            </div>
            <EditRow label="Adresse" htmlFor={id("addressLine")}>
              <input
                id={id("addressLine")}
                value={draft.addressLine}
                onChange={(event) => set("addressLine", event.target.value)}
                disabled={saving}
                className={inputClass}
              />
            </EditRow>
            <EditRow label="Postnummer og sted" htmlFor={id("postalCode")}>
              <div className="flex min-w-0 gap-2">
                <input
                  id={id("postalCode")}
                  value={draft.postalCode}
                  onChange={(event) => set("postalCode", event.target.value)}
                  disabled={saving}
                  inputMode="numeric"
                  aria-label="Postnummer"
                  placeholder="Postnr."
                  className={`${inputBaseClass} w-24 shrink-0`}
                />
                <input
                  value={draft.city}
                  onChange={(event) => set("city", event.target.value)}
                  disabled={saving}
                  aria-label="Poststed"
                  placeholder="Poststed"
                  className={`${inputBaseClass} min-w-0 flex-1`}
                />
              </div>
            </EditRow>
            <EditRow label="Kontrakt" htmlFor={id("contractType")}>
              <select
                id={id("contractType")}
                value={draft.contractType}
                onChange={(event) => set("contractType", event.target.value)}
                disabled={saving}
                className={inputClass}
              >
                <option value="">Ikke satt</option>
                {Object.entries(CONTRACT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </EditRow>
            <EditRow label="Kontraktssum (kr)" htmlFor={id("contractSizeNok")}>
              <input
                id={id("contractSizeNok")}
                value={draft.contractSizeNok}
                onChange={(event) => set("contractSizeNok", event.target.value)}
                disabled={saving}
                inputMode="decimal"
                className={inputClass}
              />
            </EditRow>
            <EditRow label="Oppstart" htmlFor={id("startDate")}>
              <input
                id={id("startDate")}
                type="date"
                value={draft.startDate}
                onChange={(event) => set("startDate", event.target.value)}
                disabled={saving}
                className={inputClass}
              />
            </EditRow>
            <EditRow label="Sluttfrist" htmlFor={id("endDate")}>
              <input
                id={id("endDate")}
                type="date"
                value={draft.endDate}
                min={draft.startDate || undefined}
                onChange={(event) => set("endDate", event.target.value)}
                disabled={saving}
                className={inputClass}
              />
            </EditRow>
            <EditRow label="Byggherre" htmlFor={id("clientName")}>
              <input
                id={id("clientName")}
                value={draft.clientName}
                onChange={(event) => set("clientName", event.target.value)}
                disabled={saving}
                className={inputClass}
              />
            </EditRow>
            <EditRow label="Byggherretype" htmlFor={id("clientType")}>
              <select
                id={id("clientType")}
                value={draft.clientType}
                onChange={(event) => set("clientType", event.target.value)}
                disabled={saving}
                className={inputClass}
              >
                <option value="">Ikke satt</option>
                {Object.entries(CLIENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </EditRow>
            <EditRow label="Byggherre adresse" htmlFor={id("clientAddress")}>
              <input
                id={id("clientAddress")}
                value={draft.clientAddress}
                onChange={(event) => set("clientAddress", event.target.value)}
                disabled={saving}
                className={inputClass}
              />
            </EditRow>
            <EditRow label="Byggherre e-post" htmlFor={id("clientEmail")}>
              <input
                id={id("clientEmail")}
                type="email"
                value={draft.clientEmail}
                onChange={(event) => set("clientEmail", event.target.value)}
                disabled={saving}
                className={inputClass}
              />
            </EditRow>
            <EditRow label="Byggherre kontaktperson" htmlFor={id("clientContactName")}>
              <input
                id={id("clientContactName")}
                value={draft.clientContactName}
                onChange={(event) => set("clientContactName", event.target.value)}
                disabled={saving}
                className={inputClass}
              />
            </EditRow>
            <EditRow label="Kontaktperson telefon" htmlFor={id("clientContactPhone")}>
              <input
                id={id("clientContactPhone")}
                type="tel"
                value={draft.clientContactPhone}
                onChange={(event) => set("clientContactPhone", event.target.value)}
                disabled={saving}
                className={inputClass}
              />
            </EditRow>
            <EditRow label="Kontaktperson e-post" htmlFor={id("clientContactEmail")}>
              <input
                id={id("clientContactEmail")}
                type="email"
                value={draft.clientContactEmail}
                onChange={(event) => set("clientContactEmail", event.target.value)}
                disabled={saving}
                className={inputClass}
              />
            </EditRow>
          </div>

          <div className="space-y-3 rounded-b-2xl border-t border-slate-100 bg-slate-50 px-6 py-4">
            {error ?? validationError ? (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error ?? validationError}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => void cancel()} disabled={saving} className={secondaryButtonClass}>
                Avbryt
              </button>
              <button type="submit" disabled={saving || Boolean(validationError)} className={standardButtonClass}>
                {saving ? (
                  <>
                    <IconLoader2 className="h-5 w-5 animate-spin" />
                    Lagrer...
                  </>
                ) : (
                  <>
                    <IconCheck className="h-5 w-5" />
                    Lagre
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </section>
    </>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-6 py-2.5">
      <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-semibold text-slate-900">{children}</dd>
    </div>
  );
}

function EditRow({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-2">
      <label htmlFor={htmlFor} className="w-2/5 shrink-0 text-sm text-slate-500">
        {label}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function toDraft(project: ProjectWorkspace): AboutDraft {
  return {
    name: project.name,
    description: project.description ?? "",
    addressLine: project.addressLine ?? "",
    postalCode: project.postalCode ?? "",
    city: project.city ?? "",
    contractType: project.contractType ?? "",
    contractSizeNok: optionalDecimalDisplay(project.contractSizeNok),
    startDate: toDateInput(project.startDate),
    endDate: toDateInput(project.endDate),
    clientName: project.clientName ?? "",
    clientType: project.clientType ?? "",
    clientAddress: project.clientAddress ?? "",
    clientEmail: project.clientEmail ?? "",
    clientContactName: project.clientContactName ?? "",
    clientContactPhone: project.clientContactPhone ?? "",
    clientContactEmail: project.clientContactEmail ?? "",
  };
}

/** The link, button or field under a point, ignoring the dimming layer itself. */
function clickableBelow(x: number, y: number, backdrop: HTMLElement | null): HTMLElement | null {
  for (const element of document.elementsFromPoint(x, y)) {
    if (element === backdrop) continue;
    const target = element.closest<HTMLElement>("a[href], button, [role='button'], [role='tab'], summary");
    return target && !target.hasAttribute("disabled") ? target : null;
  }
  return null;
}

function formatAddressInline(project: ProjectWorkspace) {
  const cityLine = [project.postalCode, project.city].filter(Boolean).join(" ");
  return [project.addressLine, cityLine].filter(Boolean).join(", ") || "-";
}

function formatCurrency(value: number | null) {
  if (value === null) return "-";
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(value);
}
