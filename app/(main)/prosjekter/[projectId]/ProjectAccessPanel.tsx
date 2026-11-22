"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { IconAlertTriangle, IconLoader2, IconUserPlus, IconUsers } from "@tabler/icons-react";
import { useDialogs } from "@/components/dialogs/ConfirmDialog";
import { destructiveButtonCompactClass, standardButtonClass } from "@/lib/buttonStyles";
import { formatDate, formatPhone } from "@/lib/formatters";
import type { ProjectAccessCandidate, ProjectAccessKind, ProjectAccessMember } from "@/lib/project-access";

type AccessPayload = {
  members: ProjectAccessMember[];
  hasLead: boolean;
  candidates: ProjectAccessCandidate[];
  canManage: boolean;
  viewerId: string;
};

const KIND_LABELS: Record<ProjectAccessKind, string> = {
  LEAD: "Prosjektleder",
  PARTICIPANT: "Deltaker",
  COMPANY_ADMIN: "Selskapsadmin",
};

const KIND_CLASSES: Record<ProjectAccessKind, string> = {
  LEAD: "border-violet-200 bg-violet-50 text-violet-800",
  PARTICIPANT: "border-blue-200 bg-blue-50 text-blue-800",
  COMPANY_ADMIN: "border-amber-200 bg-amber-50 text-amber-800",
};

const secondaryButtonCompactClass =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";
const selectClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-50";

export default function ProjectAccessPanel({
  projectId,
  customerName,
}: {
  projectId: string;
  customerName: string;
}) {
  const [data, setData] = useState<AccessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const { confirm } = useDialogs();

  const load = useCallback(async () => {
    try {
      setData(await requestJson<AccessPayload>(`/api/prosjekter/${projectId}/tilganger`));
    } catch (loadError) {
      setError(errorMessage(loadError, "Kunne ikke hente brukertilganger."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(successMessage: string, action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(successMessage);
    } catch (actionError) {
      setError(errorMessage(actionError, "Kunne ikke lagre endringen."));
    } finally {
      // Reload in both cases, so the list never shows something the server rejected.
      await load();
      setBusy(false);
    }
  }

  async function addParticipant() {
    const candidate = data?.candidates.find((entry) => entry.userId === selectedUserId);
    if (!candidate) return;
    await runAction(`${displayName(candidate.name)} har fått tilgang til prosjektet.`, () =>
      requestJson(`/api/prosjekter/${projectId}/tilganger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: candidate.userId }),
      }),
    );
    setSelectedUserId("");
  }

  async function makeLead(member: ProjectAccessMember) {
    const currentLeads = (data?.members ?? []).filter((entry) => entry.kind === "LEAD");
    const currentNames = currentLeads
      .map((entry) => (entry.userId === data?.viewerId ? `${displayName(entry.name)} (deg)` : displayName(entry.name)))
      .join(" og ");
    const confirmed = await confirm({
      title: "Bytte prosjektleder?",
      message: (
        <>
          <p>
            Ny prosjektleder: <strong>{displayName(member.name)}</strong>
          </p>
          <p className="mt-1">
            {currentLeads.length > 0 ? (
              <>
                Nåværende prosjektleder: <strong>{currentNames}</strong>, som blir vanlig deltaker.
              </>
            ) : (
              "Prosjektet har ingen prosjektleder i dag."
            )}
          </p>
        </>
      ),
      confirmLabel: "Gjør til prosjektleder",
    });
    if (!confirmed) return;

    await runAction(`${displayName(member.name)} er nå prosjektleder.`, () =>
      requestJson(`/api/prosjekter/${projectId}/tilganger/${encodeURIComponent(member.userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "OWNER" }),
      }),
    );
  }

  async function removeParticipant(member: ProjectAccessMember) {
    const confirmed = await confirm({
      title: "Fjerne fra prosjektet?",
      message: `${displayName(member.name)} mister tilgangen til prosjektet.`,
      confirmLabel: "Fjern",
      tone: "danger",
    });
    if (!confirmed) return;
    await runAction(`${displayName(member.name)} er fjernet fra prosjektet.`, () =>
      requestJson(`/api/prosjekter/${projectId}/tilganger/${encodeURIComponent(member.userId)}`, {
        method: "DELETE",
      }),
    );
  }

  const canManage = data?.canManage ?? false;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-xl font-semibold text-slate-900">Brukertilganger</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Brukere i {customerName} som har tilgang til prosjektet. Systemadministratorer har tilgang til alle
          prosjekter og vises bare her hvis de er prosjektleder.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 px-6 py-8 text-sm text-slate-600">
          <IconLoader2 className="h-5 w-5 animate-spin text-blue-600" />
          Laster brukertilganger...
        </div>
      ) : !data ? (
        <div className="p-6">
          <Notice tone="error">{error ?? "Kunne ikke hente brukertilganger."}</Notice>
        </div>
      ) : (
        <div className="space-y-5 p-6">
          {error ? <Notice tone="error">{error}</Notice> : null}
          {message ? <Notice tone="success">{message}</Notice> : null}

          {!data.hasLead ? (
            <Notice tone="warning">
              <IconAlertTriangle className="h-5 w-5 shrink-0" />
              <span>
                Prosjektet har ingen prosjektleder.
                {canManage ? " Velg «Gjør til prosjektleder» på en bruker i listen." : ""}
              </span>
            </Notice>
          ) : null}

          {canManage ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <label htmlFor="access-candidate" className="text-sm font-semibold text-slate-900">
                Legg til deltaker
              </label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <select
                  id="access-candidate"
                  className={`${selectClass} sm:max-w-md`}
                  value={selectedUserId}
                  disabled={busy || data.candidates.length === 0}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                >
                  <option value="">
                    {data.candidates.length === 0 ? "Ingen brukere å legge til" : "Velg bruker"}
                  </option>
                  {data.candidates.map((candidate) => (
                    <option key={candidate.userId} value={candidate.userId}>
                      {displayName(candidate.name)}
                      {candidate.phone ? ` (${formatPhone(candidate.phone)})` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={standardButtonClass}
                  disabled={busy || !selectedUserId}
                  onClick={() => void addParticipant()}
                >
                  <IconUserPlus className="h-4 w-4" />
                  Legg til
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {data.candidates.length === 0
                  ? `Listen viser brukere som er knyttet til ${customerName} og ikke har tilgang til prosjektet fra før. Akkurat nå er det ingen. Nye brukere må først knyttes til selskapet.`
                  : "Deltakere kan se prosjektet, men ikke endre det."}
              </p>
            </div>
          ) : null}

          {data.members.length === 0 ? (
            <div className="rounded-xl border border-slate-200 p-10 text-center">
              <IconUsers className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">Ingen brukere har tilgang ennå</p>
              <p className="mt-1 text-sm text-slate-500">
                {canManage
                  ? "Legg til deltakere fra selskapet for å gi dem tilgang til prosjektet."
                  : "Prosjektleder kan legge til deltakere."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Navn</th>
                    <th className="px-4 py-3">Kontakt</th>
                    <th className="px-4 py-3">Rolle</th>
                    <th className="px-4 py-3">Lagt til</th>
                    {canManage ? <th className="px-4 py-3" aria-label="Handlinger" /> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {data.members.map((member) => {
                    const isViewer = member.userId === data.viewerId;
                    const canMakeLead = member.kind !== "LEAD" && member.hasAccess;
                    // The lead hands the role over before leaving, so a project is not left without one by accident.
                    const canRemove = member.isParticipant && !(member.kind === "LEAD" && isViewer);

                    return (
                      <tr key={member.userId}>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {displayName(member.name)}
                          {isViewer ? <span className="ml-1 font-normal text-slate-500">(deg)</span> : null}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <div>{formatPhone(member.phone)}</div>
                          {member.email ? <div className="text-xs text-slate-500">{member.email}</div> : null}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${KIND_CLASSES[member.kind]}`}
                          >
                            {KIND_LABELS[member.kind]}
                          </span>
                          <div className="mt-1 text-xs text-slate-500">{accessNote(member)}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {member.addedAt ? formatDate(member.addedAt, { showTime: false }) ?? "-" : "-"}
                        </td>
                        {canManage ? (
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              {canMakeLead ? (
                                <button
                                  type="button"
                                  className={secondaryButtonCompactClass}
                                  disabled={busy}
                                  onClick={() => void makeLead(member)}
                                >
                                  Gjør til prosjektleder
                                </button>
                              ) : null}
                              {canRemove ? (
                                <button
                                  type="button"
                                  className={destructiveButtonCompactClass}
                                  disabled={busy}
                                  onClick={() => void removeParticipant(member)}
                                >
                                  Fjern
                                </button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function accessNote(member: ProjectAccessMember) {
  if (!member.hasAccess) return "Har ikke tilgang: er ikke lenger knyttet til selskapet";
  if (member.kind === "LEAD") return "Kan endre prosjektet og tilganger";
  if (member.kind === "COMPANY_ADMIN") return "Tilgang til alle prosjekter i selskapet";
  return member.canEditProject ? "Kan se og endre prosjektet" : "Kan se prosjektet";
}

function Notice({ tone, children }: { tone: "error" | "success" | "warning"; children: ReactNode }) {
  const toneClass =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${toneClass}`}
    >
      {children}
    </div>
  );
}

function displayName(name: string | null) {
  return name?.trim() || "Ukjent bruker";
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : "Kunne ikke fullføre forespørselen.";
    throw new Error(message);
  }
  return body as T;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
