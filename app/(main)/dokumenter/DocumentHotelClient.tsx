"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  IconCheck,
  IconCircleX,
  IconFileText,
  IconFolder,
  IconFolderPlus,
  IconPencil,
  IconPlus,
  IconSend,
  IconSignature,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { formatDate } from "@/lib/formatters";

type FolderKindValue = "SYSTEM" | "PROJECT" | "CUSTOM";
type CallOffStatusValue =
  | "DRAFT"
  | "SENT"
  | "PRICED_BY_LESSOR"
  | "ACTIVE"
  | "REJECTED"
  | "CANCELLED";

type CustomerOption = {
  id: number;
  name: string | null;
  organizationNumber: string | null;
};

type ProjectOption = {
  id: string;
  projectNumber: string;
  name: string;
  clientName?: string | null;
  city?: string | null;
};

type DocumentFileItem = {
  id: string;
  name: string;
  storageKey: string | null;
  sizeBytes: number | null;
  contentType: string | null;
  uploadedByName: string | null;
  createdAt: string;
};

type DocumentFolderNode = {
  id: string;
  customerId: number;
  parentId: string | null;
  name: string;
  kind: FolderKindValue;
  systemKey: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  files: DocumentFileItem[];
  children: DocumentFolderNode[];
};

type DocumentsPayload = {
  activeCustomerId: number | null;
  customers: CustomerOption[];
  projects: ProjectOption[];
  tree: DocumentFolderNode[];
  storageConfigured: boolean;
};

type CallOffLineItem = {
  id: string;
  description: string;
  quantity: number;
  wantedFrom: string | null;
  wantedTo: string | null;
  projectId: string | null;
  projectLabel: string | null;
  machineNumber: string | null;
  priceText: string | null;
};

type CallOffItem = {
  id: string;
  number: string | null;
  frameAgreementRef: string;
  status: CallOffStatusValue;
  sentAt: string | null;
  lessorSignedAt: string | null;
  lessorSignedBy: string | null;
  customerSignedAt: string | null;
  customerSignedBy: string | null;
  rejectReason: string | null;
  externalRef: string | null;
  pdfDocFileId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  lines: CallOffLineItem[];
};

type CallOffPayload = {
  activeCustomerId: number | null;
  customers: CustomerOption[];
  projects: ProjectOption[];
  callOffs: CallOffItem[];
  integrationConfigured: boolean;
};

type DraftLine = {
  key: string;
  description: string;
  quantity: string;
  wantedFrom: string;
  wantedTo: string;
  projectId: string;
};

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60";
const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30";
const textareaClass =
  "min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const STATUS_LABELS: Record<CallOffStatusValue, string> = {
  DRAFT: "Utkast",
  SENT: "Sendt",
  PRICED_BY_LESSOR: "Priset av utleier",
  ACTIVE: "Aktivt",
  REJECTED: "Avslått",
  CANCELLED: "Kansellert",
};

const STATUS_CLASSES: Record<CallOffStatusValue, string> = {
  DRAFT: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
  SENT: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
  PRICED_BY_LESSOR: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  REJECTED: "bg-red-50 text-red-700 ring-1 ring-red-100",
  CANCELLED: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

export default function DocumentHotelClient() {
  const [activeView, setActiveView] = useState<"documents" | "calloffs">("documents");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [activeCustomerId, setActiveCustomerId] = useState<number | null>(null);
  const [tree, setTree] = useState<DocumentFolderNode[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [storageConfigured, setStorageConfigured] = useState(false);
  const [callOffs, setCallOffs] = useState<CallOffItem[]>([]);
  const [integrationConfigured, setIntegrationConfigured] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedFolder = useMemo(
    () => (selectedFolderId ? findFolderById(tree, selectedFolderId) : null),
    [selectedFolderId, tree],
  );

  const loadPage = useCallback(async (customerId: number | null) => {
    setLoading(true);
    setError(null);

    try {
      const query = customerId ? `?customerId=${customerId}` : "";
      const [documentsData, callOffData] = await Promise.all([
        requestJson<DocumentsPayload>(`/api/dokumenter${query}`),
        requestJson<CallOffPayload>(`/api/avrop${query}`),
      ]);

      const nextCustomerId = documentsData.activeCustomerId ?? callOffData.activeCustomerId;
      setCustomers(documentsData.customers.length ? documentsData.customers : callOffData.customers);
      setActiveCustomerId(nextCustomerId);
      setTree(documentsData.tree);
      setProjects(documentsData.projects.length ? documentsData.projects : callOffData.projects);
      setStorageConfigured(documentsData.storageConfigured);
      setCallOffs(callOffData.callOffs);
      setIntegrationConfigured(callOffData.integrationConfigured);
      setSelectedFolderId((current) =>
        current && findFolderById(documentsData.tree, current)
          ? current
          : documentsData.tree[0]?.id ?? null,
      );
    } catch (loadError) {
      setError(errorMessage(loadError, "Kunne ikke laste dokumenter og avrop."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage(null);
  }, [loadPage]);

  async function createFolder(parentId: string, name: string) {
    await runAction("Mappen ble opprettet.", async () => {
      await requestJson("/api/dokumenter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createFolder", parentId, name }),
      });
    });
  }

  async function createProjectFolder(projectId: string) {
    await runAction("Prosjektmappen ble opprettet.", async () => {
      await requestJson("/api/dokumenter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createProjectFolder", projectId }),
      });
    });
  }

  async function renameFolder(folderId: string, name: string) {
    await runAction("Mappen ble omdøpt.", async () => {
      await requestJson("/api/dokumenter", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, name }),
      });
    });
  }

  async function deleteFolder(folderId: string) {
    await runAction("Mappen ble slettet.", async () => {
      await requestJson("/api/dokumenter", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
    });
  }

  async function createCallOff(form: { frameAgreementRef: string; lines: DraftLine[] }) {
    if (!activeCustomerId) return;

    await runAction("Avropet ble lagret som utkast.", async () => {
      await requestJson("/api/avrop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: activeCustomerId,
          frameAgreementRef: form.frameAgreementRef,
          lines: form.lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            wantedFrom: line.wantedFrom,
            wantedTo: line.wantedTo,
            projectId: line.projectId,
          })),
        }),
      });
    });
  }

  async function updateCallOff(
    callOffId: string,
    action: "send" | "sign" | "reject" | "cancel",
    reason?: string,
  ) {
    if (!activeCustomerId) return;

    await runAction(actionSuccessMessage(action), async () => {
      await requestJson("/api/avrop", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: activeCustomerId, callOffId, action, reason }),
      });
    });
  }

  async function runAction(successMessage: string, action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      await action();
      setMessage(successMessage);
      await loadPage(activeCustomerId);
    } catch (actionError) {
      setError(errorMessage(actionError, "Handlingen feilet."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="space-y-6 p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Dokumenter</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Dokumenthotell, prosjektmapper og avrop samlet per kunde.
          </p>
        </div>
        <div className="w-full max-w-sm">
          <label className="text-sm font-medium text-slate-700" htmlFor="document-customer">
            Kunde
          </label>
          <select
            id="document-customer"
            value={activeCustomerId ?? ""}
            onChange={(event) => {
              const nextCustomerId = Number(event.target.value);
              setActiveCustomerId(nextCustomerId);
              void loadPage(nextCustomerId);
            }}
            disabled={loading || customers.length === 0}
            className={`${inputClass} mt-1`}
          >
            {customers.length === 0 ? <option value="">Ingen kunder</option> : null}
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name ?? `Kunde ${customer.id}`}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200" aria-label="Dokumentfaner">
        <button
          type="button"
          onClick={() => setActiveView("documents")}
          className={tabClass(activeView === "documents")}
        >
          <IconFolder className="h-5 w-5" />
          Dokumenthotell
        </button>
        <button
          type="button"
          onClick={() => setActiveView("calloffs")}
          className={tabClass(activeView === "calloffs")}
        >
          <IconFileText className="h-5 w-5" />
          Avrop
        </button>
      </div>

      {error ? (
        <StatusBanner tone="error">
          {error}
        </StatusBanner>
      ) : null}
      {message ? (
        <StatusBanner tone="success">
          {message}
        </StatusBanner>
      ) : null}

      {loading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          Laster dokumenter og avrop...
        </section>
      ) : activeCustomerId ? (
        activeView === "documents" ? (
          <DocumentHotelPanel
            tree={tree}
            selectedFolder={selectedFolder}
            selectedFolderId={selectedFolderId}
            projects={projects}
            storageConfigured={storageConfigured}
            busy={busy}
            onSelectFolder={setSelectedFolderId}
            onCreateFolder={createFolder}
            onCreateProjectFolder={createProjectFolder}
            onRenameFolder={renameFolder}
            onDeleteFolder={deleteFolder}
            onOpenCallOffs={() => setActiveView("calloffs")}
          />
        ) : (
          <CallOffPanel
            callOffs={callOffs}
            projects={projects}
            integrationConfigured={integrationConfigured}
            busy={busy}
            onCreateCallOff={createCallOff}
            onUpdateCallOff={updateCallOff}
          />
        )
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
          Du har ikke tilgang til noen kunder ennå.
        </section>
      )}
    </main>
  );
}

function DocumentHotelPanel({
  tree,
  selectedFolder,
  selectedFolderId,
  projects,
  storageConfigured,
  busy,
  onSelectFolder,
  onCreateFolder,
  onCreateProjectFolder,
  onRenameFolder,
  onDeleteFolder,
  onOpenCallOffs,
}: {
  tree: DocumentFolderNode[];
  selectedFolder: DocumentFolderNode | null;
  selectedFolderId: string | null;
  projects: ProjectOption[];
  storageConfigured: boolean;
  busy: boolean;
  onSelectFolder: (folderId: string) => void;
  onCreateFolder: (parentId: string, name: string) => Promise<void>;
  onCreateProjectFolder: (projectId: string) => Promise<void>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onOpenCallOffs: () => void;
}) {
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const canCreateSubfolder = Boolean(selectedFolder && selectedFolder.systemKey !== "PROSJEKT");

  return (
    <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Mapper</h2>
        </div>
        <div className="max-h-[42rem] overflow-auto p-3">
          {tree.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              Ingen mapper funnet.
            </div>
          ) : (
            <FolderTree
              nodes={tree}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
            />
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {selectedFolder ? (
          <>
            <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-slate-900">{selectedFolder.name}</h2>
                  <FolderBadge folder={selectedFolder} />
                </div>
                <p className="mt-2 text-sm text-slate-600">{folderDescription(selectedFolder)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!canCreateSubfolder || !newFolderName.trim() || busy}
                  onClick={() => {
                    if (!newFolderName.trim()) return;
                    void onCreateFolder(selectedFolder.id, newFolderName).then(() => {
                      setNewFolderName("");
                    });
                  }}
                >
                  <IconFolderPlus className="h-5 w-5" />
                  Ny mappe
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => {
                    if (!selectedProjectId) return;
                    void onCreateProjectFolder(selectedProjectId).then(() => {
                      setSelectedProjectId("");
                    });
                  }}
                >
                  <IconFolderPlus className="h-5 w-5" />
                  Ny prosjektmappe
                </button>
                {selectedFolder.kind === "CUSTOM" ? (
                  <>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy}
                      onClick={() => {
                        const name = window.prompt("Nytt mappenavn", selectedFolder.name);
                        if (name?.trim()) void onRenameFolder(selectedFolder.id, name);
                      }}
                    >
                      <IconPencil className="h-5 w-5" />
                      Omdøp
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy}
                      onClick={() => {
                        const confirmed = window.confirm(`Slette mappen "${selectedFolder.name}"?`);
                        if (confirmed) void onDeleteFolder(selectedFolder.id);
                      }}
                    >
                      <IconTrash className="h-5 w-5" />
                      Slett
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className={buttonClass}
                  disabled
                  title="Filopplasting kobles på når Azure Blob-lagring er konfigurert."
                >
                  <IconUpload className="h-5 w-5" />
                  Last opp
                </button>
              </div>
            </div>

            <div className="space-y-6 p-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700" htmlFor="new-folder-name">
                    Ny undermappe
                  </label>
                  <input
                    id="new-folder-name"
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    disabled={!canCreateSubfolder || busy}
                    placeholder={
                      canCreateSubfolder
                        ? "Skriv mappenavn og trykk Ny mappe"
                        : "Velg en mappe under Prosjektdokumenter"
                    }
                    className={`${inputClass} mt-1`}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700" htmlFor="project-folder">
                    Prosjektmappe
                  </label>
                  <select
                    id="project-folder"
                    value={selectedProjectId}
                    onChange={(event) => setSelectedProjectId(event.target.value)}
                    disabled={busy || projects.length === 0}
                    className={`${inputClass} mt-1`}
                  >
                    <option value="">Velg prosjekt</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.projectNumber} {project.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <StatusBanner tone="info">
                Filopplasting og signert PDF-arkiv er lagt inn som placeholders. Når Azure Blob og PDF-rendering er konfigurert, kobles lagring til denne mappen og Avropsdokumenter.
                {storageConfigured ? " Azure-miljøvariabler finnes, men opplastingsruten er fortsatt bevisst sperret." : ""}
              </StatusBanner>

              {selectedFolder.systemKey === "AVROP" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Avropsdokumenter er klar som arkivmappe. Signerte avrops-PDFer legges her når PDF-generering og Azure-lagring er koblet på.
                  <button
                    type="button"
                    onClick={onOpenCallOffs}
                    className="ml-3 font-semibold text-amber-950 underline"
                  >
                    Åpne avrop
                  </button>
                </div>
              ) : null}

              <FilesTable files={selectedFolder.files} />
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-sm text-slate-600">
            Velg en mappe for å se innhold.
          </div>
        )}
      </section>
    </div>
  );
}

function FolderTree({
  nodes,
  selectedFolderId,
  onSelectFolder,
  depth = 0,
}: {
  nodes: DocumentFolderNode[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string) => void;
  depth?: number;
}) {
  return (
    <div className={depth === 0 ? "space-y-1" : "mt-1 space-y-1"}>
      {nodes.map((folder) => {
        const selected = folder.id === selectedFolderId;
        return (
          <div key={folder.id}>
            <button
              type="button"
              onClick={() => onSelectFolder(folder.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                selected
                  ? "bg-blue-50 font-semibold text-blue-800"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
              style={{ paddingLeft: `${12 + depth * 16}px` }}
            >
              <IconFolder className="h-5 w-5 shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              {folder.files.length > 0 ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                  {folder.files.length}
                </span>
              ) : null}
            </button>
            {folder.children.length > 0 ? (
              <FolderTree
                nodes={folder.children}
                selectedFolderId={selectedFolderId}
                onSelectFolder={onSelectFolder}
                depth={depth + 1}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FilesTable({ files }: { files: DocumentFileItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Fil</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Størrelse</th>
            <th className="px-4 py-3">Lastet opp</th>
            <th className="px-4 py-3">Av</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {files.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                Ingen filer i mappen ennå.
              </td>
            </tr>
          ) : (
            files.map((file) => (
              <tr key={file.id}>
                <td className="px-4 py-4 font-semibold text-slate-900">{file.name}</td>
                <td className="px-4 py-4 text-slate-700">{file.contentType ?? "-"}</td>
                <td className="px-4 py-4 text-slate-700">{formatFileSize(file.sizeBytes)}</td>
                <td className="px-4 py-4 text-slate-700">
                  {formatDate(file.createdAt, { showTime: false }) ?? "-"}
                </td>
                <td className="px-4 py-4 text-slate-700">{file.uploadedByName ?? "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CallOffPanel({
  callOffs,
  projects,
  integrationConfigured,
  busy,
  onCreateCallOff,
  onUpdateCallOff,
}: {
  callOffs: CallOffItem[];
  projects: ProjectOption[];
  integrationConfigured: boolean;
  busy: boolean;
  onCreateCallOff: (form: { frameAgreementRef: string; lines: DraftLine[] }) => Promise<void>;
  onUpdateCallOff: (
    callOffId: string,
    action: "send" | "sign" | "reject" | "cancel",
    reason?: string,
  ) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      {!integrationConfigured ? (
        <StatusBanner tone="info">
          Avrop kan lagres som utkast nå. Sending til Bjugstad-registeret aktiveres når BJUGSTAD_REGISTER_URL og BJUGSTAD_REGISTER_API_KEY er satt.
        </StatusBanner>
      ) : null}

      <CallOffForm projects={projects} busy={busy} onCreateCallOff={onCreateCallOff} />
      <CallOffList
        callOffs={callOffs}
        integrationConfigured={integrationConfigured}
        busy={busy}
        onUpdateCallOff={onUpdateCallOff}
      />
    </div>
  );
}

function CallOffForm({
  projects,
  busy,
  onCreateCallOff,
}: {
  projects: ProjectOption[];
  busy: boolean;
  onCreateCallOff: (form: { frameAgreementRef: string; lines: DraftLine[] }) => Promise<void>;
}) {
  const [frameAgreementRef, setFrameAgreementRef] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyDraftLine()]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreateCallOff({ frameAgreementRef, lines });
    setFrameAgreementRef("");
    setLines([emptyDraftLine()]);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-xl font-semibold text-slate-900">Nytt avrop</h2>
      </div>
      <form onSubmit={submit} className="space-y-5 p-6">
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="frameAgreementRef">
            Rammeavtale/referanse
          </label>
          <input
            id="frameAgreementRef"
            value={frameAgreementRef}
            onChange={(event) => setFrameAgreementRef(event.target.value)}
            className={`${inputClass} mt-1`}
            placeholder="For eksempel rammeavtalenummer eller kontraktsreferanse"
          />
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div
              key={line.key}
              className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1.4fr_6rem_10rem_10rem_1fr_auto]"
            >
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Beskrivelse
                </label>
                <textarea
                  value={line.description}
                  onChange={(event) =>
                    setLines((current) =>
                      replaceLine(current, line.key, { description: event.target.value }),
                    )
                  }
                  className={`${textareaClass} mt-1`}
                  placeholder="Gravemaskin 25-30 t med rototilt"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Antall
                </label>
                <input
                  value={line.quantity}
                  type="number"
                  min="1"
                  onChange={(event) =>
                    setLines((current) =>
                      replaceLine(current, line.key, { quantity: event.target.value }),
                    )
                  }
                  className={`${inputClass} mt-1 px-2`}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Fra
                </label>
                <input
                  value={line.wantedFrom}
                  type="date"
                  onChange={(event) =>
                    setLines((current) =>
                      replaceLine(current, line.key, { wantedFrom: event.target.value }),
                    )
                  }
                  className={`${inputClass} mt-1 px-2`}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Til
                </label>
                <input
                  value={line.wantedTo}
                  type="date"
                  onChange={(event) =>
                    setLines((current) =>
                      replaceLine(current, line.key, { wantedTo: event.target.value }),
                    )
                  }
                  className={`${inputClass} mt-1 px-2`}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Prosjekt
                </label>
                <select
                  value={line.projectId}
                  onChange={(event) =>
                    setLines((current) =>
                      replaceLine(current, line.key, { projectId: event.target.value }),
                    )
                  }
                  className={`${inputClass} mt-1`}
                >
                  <option value="">Ikke valgt</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.projectNumber} {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() =>
                  setLines((current) =>
                    current.length === 1
                      ? [emptyDraftLine()]
                      : current.filter((candidate) => candidate.key !== line.key),
                  )
                }
                className="mt-6 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100"
                aria-label={`Fjern linje ${index + 1}`}
              >
                <IconTrash className="h-5 w-5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-between gap-3">
          <button
            type="button"
            className={buttonClass}
            onClick={() => setLines((current) => [...current, emptyDraftLine()])}
          >
            <IconPlus className="h-5 w-5" />
            Legg til linje
          </button>
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            <IconCheck className="h-5 w-5" />
            Lagre utkast
          </button>
        </div>
      </form>
    </section>
  );
}

function CallOffList({
  callOffs,
  integrationConfigured,
  busy,
  onUpdateCallOff,
}: {
  callOffs: CallOffItem[];
  integrationConfigured: boolean;
  busy: boolean;
  onUpdateCallOff: (
    callOffId: string,
    action: "send" | "sign" | "reject" | "cancel",
    reason?: string,
  ) => Promise<void>;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Avrop</h2>
        <span className="text-sm text-slate-500">{callOffs.length} registrert</span>
      </div>
      <div className="divide-y divide-slate-100">
        {callOffs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Ingen avrop registrert.
          </div>
        ) : (
          callOffs.map((callOff) => (
            <article key={callOff.id} className="space-y-4 p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {callOff.number ?? "Utkast uten avropsnummer"}
                    </h3>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[callOff.status]}`}>
                      {STATUS_LABELS[callOff.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Rammeavtale: {callOff.frameAgreementRef}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Opprettet {formatDate(callOff.createdAt, { showTime: false }) ?? "-"}
                    {callOff.createdByName ? ` av ${callOff.createdByName}` : ""}
                  </p>
                </div>
                <CallOffActions
                  callOff={callOff}
                  integrationConfigured={integrationConfigured}
                  busy={busy}
                  onUpdateCallOff={onUpdateCallOff}
                />
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Beskrivelse</th>
                      <th className="px-4 py-3">Antall</th>
                      <th className="px-4 py-3">Periode</th>
                      <th className="px-4 py-3">Prosjekt</th>
                      <th className="px-4 py-3">Maskin</th>
                      <th className="px-4 py-3">Pris</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {callOff.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-4 font-medium text-slate-900">{line.description}</td>
                        <td className="px-4 py-4 tabular-nums text-slate-700">{line.quantity}</td>
                        <td className="px-4 py-4 text-slate-700">
                          {formatPeriod(line.wantedFrom, line.wantedTo)}
                        </td>
                        <td className="px-4 py-4 text-slate-700">{line.projectLabel ?? "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{line.machineNumber ?? "-"}</td>
                        <td className="px-4 py-4 text-slate-700">{line.priceText ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                <SignatureInfo label="Sendt" value={callOff.sentAt} />
                <SignatureInfo
                  label="Utleier signert"
                  value={callOff.lessorSignedAt}
                  by={callOff.lessorSignedBy}
                />
                <SignatureInfo
                  label="Kunde signert"
                  value={callOff.customerSignedAt}
                  by={callOff.customerSignedBy}
                />
              </div>

              {callOff.status === "ACTIVE" && !callOff.pdfDocFileId ? (
                <StatusBanner tone="info">
                  Signert PDF er ikke generert ennå. Arkivering i Avropsdokumenter kobles på når Azure Blob og PDF-rendering er konfigurert.
                </StatusBanner>
              ) : null}
              {callOff.rejectReason ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  Begrunnelse: {callOff.rejectReason}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function CallOffActions({
  callOff,
  integrationConfigured,
  busy,
  onUpdateCallOff,
}: {
  callOff: CallOffItem;
  integrationConfigured: boolean;
  busy: boolean;
  onUpdateCallOff: (
    callOffId: string,
    action: "send" | "sign" | "reject" | "cancel",
    reason?: string,
  ) => Promise<void>;
}) {
  if (callOff.status === "DRAFT") {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButtonClass}
          disabled={busy || !integrationConfigured}
          onClick={() => void onUpdateCallOff(callOff.id, "send")}
          title={!integrationConfigured ? "Bjugstad-registeret er ikke konfigurert." : undefined}
        >
          <IconSend className="h-5 w-5" />
          Send
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={() => void onUpdateCallOff(callOff.id, "cancel")}
        >
          <IconCircleX className="h-5 w-5" />
          Kanseller
        </button>
      </div>
    );
  }

  if (callOff.status === "PRICED_BY_LESSOR") {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButtonClass}
          disabled={busy}
          onClick={() => void onUpdateCallOff(callOff.id, "sign")}
        >
          <IconSignature className="h-5 w-5" />
          Signer
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={() => {
            const reason = window.prompt("Hvorfor avslås avropet?");
            if (reason) void onUpdateCallOff(callOff.id, "reject", reason);
          }}
        >
          <IconCircleX className="h-5 w-5" />
          Avslå
        </button>
      </div>
    );
  }

  return null;
}

function SignatureInfo({
  label,
  value,
  by,
}: {
  label: string;
  value: string | null;
  by?: string | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-medium text-slate-800">
        {formatDate(value, { showTime: true }) ?? "-"}
      </div>
      {by ? <div className="mt-1 text-xs text-slate-500">{by}</div> : null}
    </div>
  );
}

function StatusBanner({
  tone,
  children,
}: {
  tone: "info" | "success" | "error";
  children: ReactNode;
}) {
  const className =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-sky-200 bg-sky-50 text-sky-800";

  return (
    <div className={`rounded-xl border p-4 text-sm ${className}`}>
      {children}
    </div>
  );
}

function FolderBadge({ folder }: { folder: DocumentFolderNode }) {
  if (folder.kind === "SYSTEM") {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
        Fast mappe
      </span>
    );
  }

  if (folder.kind === "PROJECT") {
    return (
      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
        Prosjektmappe
      </span>
    );
  }

  return (
    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
      Egendefinert
    </span>
  );
}

function folderDescription(folder: DocumentFolderNode) {
  if (folder.systemKey === "PROSJEKT") {
    return "Prosjektmapper opprettes ved å velge et eksisterende prosjekt. Prosjektmapper vises også inne på prosjektet.";
  }
  if (folder.systemKey === "AVROP") {
    return "Arkiv for avropsdokumenter. Signerte PDFer legges hit når PDF-generering er aktivert.";
  }
  if (folder.kind === "SYSTEM") {
    return "Fast struktur fra dokumenthotellet. Mappen kan brukes, men ikke omdøpes eller slettes.";
  }
  if (folder.kind === "PROJECT") {
    return "Prosjektmappe koblet til prosjektfanen Dokumenter.";
  }
  return "Kundens egen mappe.";
}

function findFolderById(nodes: DocumentFolderNode[], folderId: string): DocumentFolderNode | null {
  for (const node of nodes) {
    if (node.id === folderId) return node;
    const match = findFolderById(node.children, folderId);
    if (match) return match;
  }
  return null;
}

function replaceLine(lines: DraftLine[], key: string, patch: Partial<DraftLine>) {
  return lines.map((line) => (line.key === key ? { ...line, ...patch } : line));
}

function emptyDraftLine(): DraftLine {
  return {
    key: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now()),
    description: "",
    quantity: "1",
    wantedFrom: "",
    wantedTo: "",
    projectId: "",
  };
}

function actionSuccessMessage(action: "send" | "sign" | "reject" | "cancel") {
  if (action === "send") return "Avropet ble sendt til utleier.";
  if (action === "sign") return "Avropet ble signert.";
  if (action === "reject") return "Avropet ble avslått.";
  return "Avropet ble kansellert.";
}

function tabClass(active: boolean) {
  return `flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
    active
      ? "border-blue-700 text-blue-700"
      : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
  }`;
}

function formatFileSize(bytes: number | null) {
  if (bytes === null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPeriod(start: string | null, end: string | null) {
  const from = formatDate(start, { showTime: false }) ?? "-";
  const to = formatDate(end, { showTime: false }) ?? "-";
  return `${from} til ${to}`;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      isRecord(body) && typeof body.error === "string"
        ? body.error
        : "Kunne ikke fullføre forespørselen.";
    const details =
      isRecord(body) && typeof body.details === "string" ? ` ${body.details}` : "";
    throw new Error(`${message}${details}`);
  }
  return body as T;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
