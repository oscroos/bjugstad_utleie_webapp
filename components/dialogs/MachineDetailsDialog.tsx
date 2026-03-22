"use client";

import { IconCertificate, IconChevronLeft, IconLoader2, IconMinus, IconPlus, IconX } from "@tabler/icons-react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { getOEMLogo } from "@/lib/get_OEM_logo";
import { isYoutubeUrl } from "@/lib/youtube";

export type MachineDetails = {
  machineId: number;
  make?: string | null;
  model?: string | null;
  productionYear?: string | null;
  number?: string | null;
  category?: string | null;
  registrationNumber?: string | null;
  serialNumber?: string | null;
  location?: string | null;
  railControlDate?: string | null;
  controlDate?: string | null;
  trainingVideos?: string[] | null;
  documentedTrainingVideoUri?: string | null;
  englishDocumentedTrainingVideoUri?: string | null;
};

type MachineLocation = {
  id: string | number;
  lat: number | null;
  lng: number | null;
  last_pos_reported_at: string | null;
  name?: string | null;
  oem_name?: string | null;
};

type LocationState = {
  status: "idle" | "loading" | "ready" | "error";
  location: MachineLocation | null;
  error: string | null;
};

type MachineAttachment = {
  id: number | string;
  name: string;
  description: string | null;
  filePath: string;
  internal?: boolean;
};

type AttachmentsState = {
  status: "idle" | "loading" | "ready" | "error";
  attachments: MachineAttachment[];
  error: string | null;
};

type VideoMetadata = {
  title: string | null;
  author: string | null;
  provider: string | null;
  thumbnail: string | null;
};

type MachineAgreementSummary = {
  id: string;
  customerId?: string | number | null;
  customerName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  comment?: string | null;
  projectNumber?: string | null;
  contactPersonName?: string | null;
  contactPersonTelephoneNumber?: string | null;
  contactPersonEmail?: string | null;
  customerContactPersonId?: string | number | null;
  customerContactPersonName?: string | null;
  customerContactPersonTelephoneNumber?: string | null;
  customerContactPersonEmail?: string | null;
  insuranceIncluded?: boolean | null;
  contractPrice?: boolean | null;
  location?: string | null;
  createdBy?: string | null;
  createdByTelephoneNumber?: string | null;
};

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const OEM_COLORS: Record<string, string> = {
  hydrema: "#000000",
  cat: "#F59E0B",
  default: "#3B82F6",
};

export type MachineDialogState = {
  open: boolean;
  loading: boolean;
  error: string | null;
  machine: MachineDetails | null;
  machineId: number | null;
  machineLabel: string;
  currentRenter?: string | null;
  currentRenterId?: string | number | null;
};

export default function MachineDetailsDialog({
  state,
  onClose,
  onBack,
  onCustomerClick,
  onAgreementClick,
  viewerRole,
  breadcrumbs,
}: {
  state: MachineDialogState;
  onClose: () => void;
  onBack?: () => void;
  onCustomerClick?: (customerId?: string | number | null, customerName?: string | null) => void;
  onAgreementClick?: (agreement: MachineAgreementSummary) => void;
  viewerRole?: string | null;
  breadcrumbs?: Array<{ label: string; onClick?: () => void }>;
}) {
  const { open, loading, error, machine, machineId, machineLabel } = state;
  const [localMachine, setLocalMachine] = useState<MachineDetails | null>(machine);
  const [localError, setLocalError] = useState<string | null>(error);
  const locationCacheRef = useRef<Record<number, MachineLocation | null>>({});
  const attachmentsCacheRef = useRef<Record<number, MachineAttachment[]>>({});
  const agreementsCacheRef = useRef<Record<number, MachineAgreementSummary[]>>({});
  const [locationState, setLocationState] = useState<LocationState>({
    status: "idle",
    location: null,
    error: null,
  });
  const [attachmentsState, setAttachmentsState] = useState<AttachmentsState>({
    status: "idle",
    attachments: [],
    error: null,
  });
  const [agreementsState, setAgreementsState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    agreements: MachineAgreementSummary[];
    error: string | null;
  }>({
    status: "idle",
    agreements: [],
    error: null,
  });
  const logoSrc = getOEMLogo(localMachine?.make ?? machineLabel);

  useEffect(() => {
    setLocalMachine(machine);
    setLocalError(error);
  }, [machine, error, open]);

  useEffect(() => {
    if (!open || !machineId) return;
    const currentMachineId = machineId;

    if (currentMachineId in locationCacheRef.current) {
      setLocationState({
        status: "ready",
        location: locationCacheRef.current[currentMachineId],
        error: null,
      });
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    async function fetchLocation() {
      setLocationState({ status: "loading", location: null, error: null });

      try {
        const response = await fetch(`/api/machines/${currentMachineId}/location`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          location?: MachineLocation;
          error?: string;
        };

        if (isCancelled) return;

        if (!response.ok) {
          setLocationState({
            status: "error",
            location: null,
            error: payload.error ?? "Kunne ikke hente lokasjon",
          });
          return;
        }

        locationCacheRef.current[currentMachineId] = payload.location ?? null;
        setLocationState({
          status: "ready",
          location: payload.location ?? null,
          error: null,
        });
      } catch (err) {
        if (isCancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Kunne ikke hente lokasjon";
        setLocationState({ status: "error", location: null, error: message });
      }
    }

    fetchLocation();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [open, machineId]);

  useEffect(() => {
    if (!open || !machineId) return;
    const currentMachineId = machineId;

    if (attachmentsCacheRef.current[currentMachineId]) {
      setAttachmentsState({
        status: "ready",
        attachments: attachmentsCacheRef.current[currentMachineId],
        error: null,
      });
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    async function fetchAttachments() {
      setAttachmentsState({ status: "loading", attachments: [], error: null });
      try {
        const response = await fetch(`/api/machines/${currentMachineId}/attachments`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          attachments?: MachineAttachment[];
          error?: string;
        };

        if (isCancelled) return;

        if (!response.ok) {
          setAttachmentsState({
            status: "error",
            attachments: [],
            error: payload.error ?? "Kunne ikke hente vedlegg",
          });
          return;
        }

        const attachments = (payload.attachments ?? []).sort((a, b) =>
          (a.description || a.name || "").localeCompare(b.description || b.name || "", "nb-NO", {
            sensitivity: "base",
          }),
        );
        attachmentsCacheRef.current[currentMachineId] = attachments;
        setAttachmentsState({
          status: "ready",
          attachments,
          error: null,
        });
      } catch (err) {
        if (isCancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Kunne ikke hente vedlegg";
        setAttachmentsState({ status: "error", attachments: [], error: message });
      }
    }

    fetchAttachments();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [open, machineId]);

  useEffect(() => {
    if (!open || !machineId) return;
    const currentMachineId = machineId;

    if (agreementsCacheRef.current[currentMachineId]) {
      setAgreementsState({
        status: "ready",
        agreements: agreementsCacheRef.current[currentMachineId],
        error: null,
      });
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    async function fetchAgreements() {
      setAgreementsState({ status: "loading", agreements: [], error: null });

      try {
        const response = await fetch("/api/agreements", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          active?: Array<{
            id: string;
            customerId?: number;
            customerName?: string | null;
            startDate?: string | null;
            endDate?: string | null;
            comment?: string | null;
            projectNumber?: string | null;
            contactPersonName?: string | null;
            contactPersonTelephoneNumber?: string | null;
            contactPersonEmail?: string | null;
            customerContactPersonId?: number | null;
            customerContactPersonName?: string | null;
            customerContactPersonTelephoneNumber?: string | null;
            customerContactPersonEmail?: string | null;
            insuranceIncluded?: boolean | null;
            contractPrice?: boolean | null;
            location?: string | null;
            createdBy?: string | null;
            createdByTelephoneNumber?: string | null;
            machines?: Array<{ id?: string; name?: string | null; make?: string | null }>;
          }>;
          historical?: Array<{
            id: string;
            customerId?: number;
            customerName?: string | null;
            startDate?: string | null;
            endDate?: string | null;
            comment?: string | null;
            projectNumber?: string | null;
            contactPersonName?: string | null;
            contactPersonTelephoneNumber?: string | null;
            contactPersonEmail?: string | null;
            customerContactPersonId?: number | null;
            customerContactPersonName?: string | null;
            customerContactPersonTelephoneNumber?: string | null;
            customerContactPersonEmail?: string | null;
            insuranceIncluded?: boolean | null;
            contractPrice?: boolean | null;
            location?: string | null;
            createdBy?: string | null;
            createdByTelephoneNumber?: string | null;
            machines?: Array<{ id?: string; name?: string | null; make?: string | null }>;
          }>;
          error?: string;
        };

        if (isCancelled) return;

        if (!response.ok) {
          setAgreementsState({
            status: "error",
            agreements: [],
            error: payload.error ?? "Kunne ikke hente leieavtaler",
          });
          return;
        }

        const agreements = [
          ...(payload.active ?? []).map((agreement) => ({ ...agreement, isActive: true })),
          ...(payload.historical ?? []).map((agreement) => ({ ...agreement, isActive: false })),
        ]
          .filter((agreement) =>
            (agreement.machines ?? []).some((linkedMachine) => Number(linkedMachine.id) === currentMachineId),
          )
          .map((agreement) => ({
            id: agreement.id,
            customerId: agreement.customerId ?? null,
            customerName: agreement.customerName ?? null,
            startDate: agreement.startDate ?? null,
            endDate: agreement.endDate ?? null,
            isActive: agreement.isActive,
            comment: agreement.comment ?? null,
            projectNumber: agreement.projectNumber ?? null,
            contactPersonName: agreement.contactPersonName ?? null,
            contactPersonTelephoneNumber: agreement.contactPersonTelephoneNumber ?? null,
            contactPersonEmail: agreement.contactPersonEmail ?? null,
            customerContactPersonId: agreement.customerContactPersonId ?? null,
            customerContactPersonName: agreement.customerContactPersonName ?? null,
            customerContactPersonTelephoneNumber: agreement.customerContactPersonTelephoneNumber ?? null,
            customerContactPersonEmail: agreement.customerContactPersonEmail ?? null,
            insuranceIncluded: agreement.insuranceIncluded ?? null,
            contractPrice: agreement.contractPrice ?? null,
            location: agreement.location ?? null,
            createdBy: agreement.createdBy ?? null,
            createdByTelephoneNumber: agreement.createdByTelephoneNumber ?? null,
          }));

        const sortedAgreements = agreements.sort(compareMachineAgreements);
        agreementsCacheRef.current[currentMachineId] = sortedAgreements;
        setAgreementsState({
          status: "ready",
          agreements: sortedAgreements,
          error: null,
        });
      } catch (err) {
        if (isCancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Kunne ikke hente leieavtaler";
        setAgreementsState({ status: "error", agreements: [], error: message });
      }
    }

    fetchAgreements();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [open, machineId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8">
      <div className="flex min-h-[40rem] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
        <div className="relative border-b border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-6 top-4 cursor-pointer rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Lukk dialog"
          >
            <IconX className="h-5 w-5" />
          </button>
          <div className="pointer-events-none absolute right-20 top-[3rem] flex h-16 w-[140px] items-center justify-end">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={(localMachine?.make ?? machineLabel ?? "OEM") + " logo"}
                className="h-16 w-auto max-w-[140px] object-contain"
              />
            ) : null}
          </div>
          <div className="pr-14">
            {breadcrumbs?.length ? (
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <button
                    type="button"
                    onClick={onBack ?? onClose}
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                    aria-label="Tilbake"
                  >
                    <IconChevronLeft className="h-3.5 w-3.5" />
                </button>
                {breadcrumbs.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="flex items-center gap-1">
                    {item.onClick ? (
                      <button
                        type="button"
                        onClick={item.onClick}
                        className="cursor-pointer text-slate-400 transition hover:text-slate-600"
                      >
                        {item.label}
                      </button>
                    ) : (
                      <span className="text-slate-500">{item.label}</span>
                    )}
                    {index < breadcrumbs.length - 1 ? <span>/</span> : null}
                  </div>
                ))}
              </div>
            ) : null}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Maskin</p>
            <h2 className="pr-[180px] text-2xl font-semibold text-slate-900">
              {machineLabel || "Maskin"}
            </h2>
            {machineId ? <p className="text-sm text-slate-500">ID: {machineId}</p> : null}
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          {loading ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <IconLoader2 className="h-5 w-5 animate-spin text-blue-600" />
              Laster maskindetaljer...
            </div>
          ) : localError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {localError}
            </div>
          ) : localMachine ? (
            <>
              <MachineOverview
                machine={localMachine}
              />
              <MachineAgreementsSection
                state={agreementsState}
                viewerRole={viewerRole}
                onCustomerClick={onCustomerClick}
                onAgreementClick={onAgreementClick}
              />
              <TrainingVideosSection machine={localMachine} />
              <AttachmentsSection state={attachmentsState} />
              <LocationMap machineLabel={machineLabel} state={locationState} />
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Fant ikke maskindetaljer.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MachineOverview({
  machine,
}: {
  machine: MachineDetails;
}) {
  const infoRows = [
    { label: "Merke", value: machine.make },
    { label: "Modell", value: machine.model },
    { label: "Årsmodell", value: machine.productionYear },
    { label: "Maskinnummer", value: machine.number },
    { label: "Kategori", value: machine.category },
    { label: "Registreringsnummer", value: machine.registrationNumber },
    { label: "Serienummer", value: machine.serialNumber },
    { label: "Lokasjon (tekst)", value: machine.location },
    { label: "Siste jernbanekontroll", value: formatDateTime(machine.railControlDate) },
    { label: "Kontrolldato", value: formatDateTime(machine.controlDate) },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">Generelt</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {infoRows.map((row) => (
          <div
            key={row.label}
            className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 shadow-sm"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {row.label}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">{formatValue(row.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MachineAgreementsSection({
  state,
  viewerRole,
  onCustomerClick,
  onAgreementClick,
}: {
  state: { status: "idle" | "loading" | "ready" | "error"; agreements: MachineAgreementSummary[]; error: string | null };
  viewerRole?: string | null;
  onCustomerClick?: (customerId?: string | number | null, customerName?: string | null) => void;
  onAgreementClick?: (agreement: MachineAgreementSummary) => void;
}) {
  const isAdmin = viewerRole === "super_admin";
  const agreements = isAdmin
    ? state.agreements
    : state.agreements.filter((agreement) => agreement.isActive).slice(0, 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">Tilknyttede leieavtaler</h3>
      {state.status === "loading" ? (
        <div className="mt-3 min-h-[10.5rem] rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="inline-flex items-center gap-2 text-xs text-slate-500">
            <IconLoader2 className="h-4 w-4 animate-spin text-blue-600" />
            Laster leieavtaler...
          </div>
        </div>
      ) : state.status === "error" ? (
        <p className="mt-1 text-xs text-slate-500">{state.error ?? "Kunne ikke hente leieavtaler"}</p>
      ) : agreements.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          {isAdmin
            ? "Ingen leieavtaler funnet for denne maskinen."
            : "Ingen aktiv leieavtale funnet for denne maskinen."}
        </p>
      ) : (
        <div
          className={agreements.length > 4 ? "mt-3 max-h-[14rem] overflow-y-auto pr-2" : "mt-3"}
        >
          <table className="min-w-full border-separate border-spacing-y-0 text-sm">
              <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Leieavtale</th>
                  <th className="px-3 py-2">Leietaker</th>
                  <th className="py-2 pr-0.5 text-right">Startdato</th>
                  <th className="w-px px-1 py-2" aria-label="Varighet" />
                  <th className="py-2 pl-0.5 text-left">Sluttdato</th>
                </tr>
              </thead>
            <tbody>
              {agreements.map((agreement) => (
                <tr key={agreement.id}>
                    <td className="border-b border-slate-100 bg-white px-3 py-3">
                      <button
                        type="button"
                      onClick={() => onAgreementClick?.(agreement)}
                      className="group inline-flex max-w-full cursor-pointer items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-left text-xs font-medium text-blue-800 transition hover:border-blue-300"
                      >
                        <span className="truncate font-semibold">{agreement.id}</span>
                      </button>
                    </td>
                    <td className="border-b border-slate-100 bg-white px-3 py-3">
                      {agreement.customerId !== null &&
                      agreement.customerId !== undefined &&
                      agreement.customerName &&
                      onCustomerClick ? (
                        <button
                          type="button"
                          onClick={() => onCustomerClick(agreement.customerId, agreement.customerName)}
                          className="group inline-flex max-w-full cursor-pointer items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-left text-xs font-medium text-blue-800 transition hover:border-blue-300"
                        >
                          <span className="truncate font-semibold">{agreement.customerName}</span>
                        </button>
                      ) : (
                        <span className="text-slate-900">{formatValue(agreement.customerName)}</span>
                      )}
                    </td>
                    <td className="border-b border-slate-100 bg-white py-3 pr-0.5 text-right text-slate-700 whitespace-nowrap">
                      {formatDateOnly(agreement.startDate)}
                    </td>
                    <td className="w-px border-b border-slate-100 bg-white px-1 py-3">
                      <AgreementDurationIndicator
                        startDate={agreement.startDate}
                        endDate={agreement.endDate}
                        isActive={agreement.isActive}
                      />
                    </td>
                    <td className="border-b border-slate-100 bg-white py-3 pl-0.5 text-left text-slate-700 whitespace-nowrap">
                      {agreement.endDate ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{formatDateOnly(agreement.endDate)}</span>
                          {agreement.isActive ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                              Aktiv
                          </span>
                        ) : null}
                      </div>
                      ) : agreement.isActive ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                          Aktiv
                        </span>
                      ) : (
                        <span>-</span>
                      )}
                    </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TrainingVideosSection({ machine }: { machine: MachineDetails }) {
  const trainingVideos = useMemo(
    () =>
      [
        ...(machine.trainingVideos ?? []),
        ...(machine.documentedTrainingVideoUri ? [machine.documentedTrainingVideoUri] : []),
        ...(machine.englishDocumentedTrainingVideoUri ? [machine.englishDocumentedTrainingVideoUri] : []),
      ]
        .filter(Boolean)
        .map(String),
    [
      machine.trainingVideos,
      machine.documentedTrainingVideoUri,
      machine.englishDocumentedTrainingVideoUri,
    ],
  );
  const hasVideos = trainingVideos.length > 0;
  const documentedLinks = useMemo(
    () =>
      new Set(
        [machine.documentedTrainingVideoUri, machine.englishDocumentedTrainingVideoUri]
          .filter(Boolean)
          .map(String),
      ),
    [machine.documentedTrainingVideoUri, machine.englishDocumentedTrainingVideoUri],
  );
  const [videoMetadata, setVideoMetadata] = useState<Record<string, VideoMetadata | null>>({});

  useEffect(() => {
    if (!trainingVideos.length) {
      setVideoMetadata({});
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function loadMetadata() {
      const results = await Promise.all(
        trainingVideos.map(async (url) => {
          if (!isYoutubeUrl(url)) return [url, null] as const;
          try {
            const response = await fetch(
              `/api/videos/oembed?url=${encodeURIComponent(url)}`,
              {
                signal: controller.signal,
                cache: "force-cache",
              },
            );
            if (!response.ok) return [url, null] as const;
            const payload = (await response.json()) as {
              title?: string | null;
              author?: string | null;
              provider?: string | null;
              thumbnail?: string | null;
            };
            return [
              url,
              {
                title: payload.title ?? null,
                author: payload.author ?? null,
                provider: payload.provider ?? "YouTube",
                thumbnail: payload.thumbnail ?? null,
              } satisfies VideoMetadata,
            ] as const;
          } catch (error) {
            if (controller.signal.aborted) return [url, null] as const;
            console.error("Failed to fetch video metadata", error);
            return [url, null] as const;
          }
        }),
      );

      if (cancelled) return;
      const mapped: Record<string, VideoMetadata | null> = {};
      for (const [url, meta] of results) {
        mapped[url] = meta;
      }
      setVideoMetadata(mapped);
    }

    loadMetadata();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [trainingVideos]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">Opplæringsvideoer</h3>
      {hasVideos ? (
        <div
          className="mt-2 max-h-[240px] overflow-y-auto pr-3"
        >
          <ul className="divide-y divide-slate-100 text-sm text-blue-700">
            {trainingVideos.map((link, index) => {
              const meta = videoMetadata[link];
              const displayTitle = meta?.title || link;
              const secondary = meta?.provider || getDisplayHost(link);
              const thumbnail = meta?.thumbnail;
              const isDocumented = documentedLinks.has(link);

              return (
                <li key={`training-${index}`}>
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-3 rounded-md px-2 py-1.5 transition hover:bg-blue-50"
                  >
                    <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt={meta?.title || "Videominiatyr"}
                          className="h-full w-full object-cover transition duration-150 group-hover:scale-[1.02]"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Lenke
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-blue-800 group-hover:underline">
                        {displayTitle}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {secondary}
                      </span>
                    </div>
                    {isDocumented ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                        <IconCertificate className="h-4 w-4" aria-hidden />
                        <span>Dokumentert</span>
                      </span>
                    ) : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          Ingen opplæringsvideoer tilgjengelig for denne enheten.
        </p>
      )}
    </div>
  );
}

function AttachmentsSection({ state }: { state: AttachmentsState }) {
  const { status, attachments, error } = state;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">Vedlegg</h3>
      {status === "loading" ? (
        <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500">
          <IconLoader2 className="h-4 w-4 animate-spin text-blue-600" />
          Laster vedlegg...
        </div>
      ) : status === "error" ? (
        <p className="mt-1 text-xs text-slate-500">
          {error ?? "Kunne ikke hente vedlegg"}
        </p>
      ) : attachments.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">Ingen vedlegg tilgjengelig.</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 shadow-sm"
            >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {attachment.description || attachment.name || "Vedlegg"}
                      </p>
                      {attachment.internal ? (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                          Intern
                        </span>
                      ) : null}
                    </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                    {attachment.name || "Ingen navn"}
                  </p>
                </div>
                <a
                  href={attachment.filePath}
                  className="group inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 transition hover:border-blue-300"
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="truncate">Last ned</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LocationMap({
  machineLabel,
  state,
}: {
  machineLabel?: string;
  state: LocationState;
}) {
  const { status, location, error } = state;
  const lat = location?.lat ?? null;
  const lng = location?.lng ?? null;
  const hasCoords =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);
  const effectiveError =
    error === "Maskin ikke funnet"
      ? "Lokasjon ikke tilgjengelig for denne enheten."
      : error ?? "Kunne ikke hente lokasjon";

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">Lokasjon</h3>
      {status === "loading" ? (
        <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500">
          <IconLoader2 className="h-4 w-4 animate-spin text-blue-600" />
          Henter posisjon...
        </div>
      ) : status === "error" ? (
        <p className="mt-1 text-xs text-slate-500">
          {effectiveError}
        </p>
      ) : hasCoords ? (
        <div className="mt-2">
          <div className="h-60 overflow-hidden rounded-lg border border-slate-100 shadow-sm">
            <LocationMiniMap
              lat={lat}
              lng={lng}
              label={machineLabel || location?.name || "Maskin"}
              lastReported={location?.last_pos_reported_at}
              oemName={location?.oem_name}
              machineId={location?.id}
            />
          </div>
        </div>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          {location
            ? "Ingen gyldige koordinater funnet for denne maskinen."
            : "Koordinater ikke tilgjengelig for denne enheten."}
          {machineLabel ? ` (${machineLabel})` : null}
        </p>
      )}
    </div>
  );
}

function LocationMiniMap({
  lat,
  lng,
  label,
  lastReported,
  oemName,
  machineId,
}: {
  lat: number;
  lng: number;
  label?: string;
  lastReported?: string | null;
  oemName?: string | null;
  machineId?: string | number | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const styleUrl = MAPTILER_KEY
      ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
      : "https://demotiles.maplibre.org/style.json";

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [lng, lat],
      zoom: 12,
      attributionControl: false,
      hash: false,
      pitchWithRotate: false,
      dragRotate: false,
    });
    mapRef.current = map;

    map.scrollZoom.disable();
    map.boxZoom.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disableRotation();

    const markerEl = document.createElement("div");
    const markerColor = getOemColor(oemName);
    Object.assign(markerEl.style, {
      width: "16px",
      height: "16px",
      borderRadius: "9999px",
      background: markerColor,
      border: "2px solid #F8FAFC",
      boxShadow: "0 3px 8px rgba(15, 23, 42, 0.15)",
    });

    const marker = new maplibregl.Marker({
      element: markerEl,
      anchor: "bottom",
    })
      .setLngLat([lng, lat])
      .addTo(map);

    const popupContent = buildMiniPopupContent({
      id: machineId ? String(machineId) : "-",
      name: label ? String(label) : "Maskin",
      oemName: oemName ?? "N/A",
      logoSrc: getOEMLogo(oemName ?? undefined),
      lastSeen: lastReported ? formatDateTime(lastReported) : "-",
    });

    const popup = new maplibregl.Popup({
      offset: 12,
      closeButton: false,
      closeOnClick: false,
      className: "machine-popup",
      focusAfterOpen: false,
    });
    popup.setDOMContent(popupContent);
    marker.setPopup(popup).togglePopup();

    popupContent
      .querySelector<HTMLButtonElement>("[data-popup-close]")
      ?.addEventListener("click", () => popup.remove());

    return () => {
      marker.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, label, lastReported, oemName, machineId]);

  const zoomIn = () => {
    const map = mapRef.current;
    if (!map) return;
    map.zoomIn({ duration: 200 });
  };

  const zoomOut = () => {
    const map = mapRef.current;
    if (!map) return;
    map.zoomOut({ duration: 200 });
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button
          type="button"
          onClick={zoomIn}
          className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          aria-label="Zoom inn"
        >
          <IconPlus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={zoomOut}
          className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          aria-label="Zoom ut"
        >
          <IconMinus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function getOemColor(oemName?: string | null) {
  if (!oemName) return OEM_COLORS.default;
  const key = oemName.trim().toLowerCase();
  return OEM_COLORS[key] ?? OEM_COLORS.default;
}

function escapeHtml(s: string) {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return s.replace(/[&<>"']/g, (ch) => map[ch]);
}

function buildMiniPopupContent({
  id,
  name,
  oemName,
  logoSrc,
  lastSeen,
}: {
  id: string;
  name: string;
  oemName: string;
  logoSrc?: string | null;
  lastSeen: string;
}) {
  const container = document.createElement("div");
  const logoMarkup = logoSrc
    ? `<img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(oemName)} logo" class="max-h-8 w-auto object-contain" />`
    : `<span class="text-[10px] font-semibold text-slate-400">OEM</span>`;

  container.className = "min-w-[240px] max-w-[320px]";
  container.dataset.machineId = id;
  container.innerHTML = `
    <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
      <div class="flex items-start justify-between gap-2 border-b border-slate-100 px-2.5 py-2">
        <div class="flex min-w-0 items-stretch gap-2">
          <div class="flex w-9 items-center justify-center rounded-lg border border-slate-200 bg-white p-0.5">
            ${logoMarkup}
          </div>
          <div class="min-w-0">
            <div class="truncate text-[13px] font-semibold text-slate-900">${escapeHtml(name)}</div>
            <div class="mt-0.5 text-[10px] font-semibold tracking-wide text-slate-500">
              ${escapeHtml(lastSeen)}
            </div>
          </div>
        </div>
        <button
          type="button"
          data-popup-close
          class="cursor-pointer rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Lukk"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
      </div>
    </div>
  `;

  return container;
}

function getDisplayHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "lenke";
  }
}

function formatValue(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return value;
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (n: number) => n.toString().padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${day}.${month}.${year} kl. ${hours}:${minutes}`;
}

function formatDateOnly(value?: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function formatAgreementDuration(
  startDate?: string | Date | null,
  endDate?: string | Date | null,
  isActive?: boolean,
) {
  if (!startDate) return null;

  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate
    ? endDate instanceof Date
      ? endDate
      : new Date(endDate)
    : isActive
      ? new Date()
      : null;

  if (Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) return null;

  const startOfDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const diffInDays = Math.max(
    0,
    Math.round((endOfDay.getTime() - startOfDay.getTime()) / millisecondsPerDay),
  );

  const suffix = endDate ? "" : isActive ? "+" : "";
  return `-> ${diffInDays}${suffix} ${diffInDays === 1 ? "dag" : "dager"}`;
}

function AgreementDurationIndicator({
  startDate,
  endDate,
  isActive,
}: {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  isActive?: boolean;
}) {
  const label = formatAgreementDuration(startDate, endDate, isActive);
  const hasDuration = Boolean(label);
  const durationLabel = label?.replace("-> ", "") ?? "";

  return (
    <div className="flex justify-center">
      {hasDuration ? (
        <div className="flex w-[5.5rem] items-center gap-0 text-slate-400">
          <div className="h-px w-2.5 bg-slate-200" />
          <div className="w-[4.1rem] shrink-0 rounded-full border border-slate-100 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            <span className="block truncate text-center">{durationLabel}</span>
          </div>
          <div className="relative h-px w-2.5 bg-slate-200">
            <span className="absolute -right-px -top-[2px] h-0 w-0 border-b-[3px] border-l-[5px] border-t-[3px] border-b-transparent border-l-slate-200 border-t-transparent" />
          </div>
        </div>
      ) : (
        <span />
      )}
    </div>
  );
}

function isAgreementCurrent(agreement: MachineAgreementSummary) {
  return agreement.isActive;
}

function compareMachineAgreements(a: MachineAgreementSummary, b: MachineAgreementSummary) {
  const aCurrent = isAgreementCurrent(a);
  const bCurrent = isAgreementCurrent(b);
  if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;

  const byStart = (toTimestamp(b.startDate, "start") ?? 0) - (toTimestamp(a.startDate, "start") ?? 0);
  if (byStart !== 0) return byStart;

  return (toTimestamp(b.endDate, "end") ?? 0) - (toTimestamp(a.endDate, "end") ?? 0);
}

function toTimestamp(value?: string | Date | null, boundary: "start" | "end" = "start") {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (boundary === "end") {
      date.setHours(23, 59, 59, 999);
    } else {
      date.setHours(0, 0, 0, 0);
    }
  }

  return date.getTime();
}
