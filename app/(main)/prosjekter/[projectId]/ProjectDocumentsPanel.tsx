"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  IconFileText,
  IconFolder,
  IconFolderPlus,
  IconPencil,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { formatDate } from "@/lib/formatters";

type FolderKindValue = "SYSTEM" | "PROJECT" | "CUSTOM";

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
  projectId: string;
  tree: DocumentFolderNode[];
  storageConfigured: boolean;
};

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60";
const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

export default function ProjectDocumentsPanel({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const [tree, setTree] = useState<DocumentFolderNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [storageConfigured, setStorageConfigured] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedFolder = useMemo(
    () => (selectedFolderId ? findFolderById(tree, selectedFolderId) : null),
    [selectedFolderId, tree],
  );

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = await requestJson<DocumentsPayload>(`/api/dokumenter?projectId=${projectId}`);
      setTree(payload.tree);
      setStorageConfigured(payload.storageConfigured);
      setSelectedFolderId((current) =>
        current && findFolderById(payload.tree, current) ? current : payload.tree[0]?.id ?? null,
      );
    } catch (loadError) {
      setError(errorMessage(loadError, "Kunne ikke laste prosjektdokumenter."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  async function createProjectFolder() {
    await runAction("Prosjektmappen ble opprettet.", async () => {
      await requestJson("/api/dokumenter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createProjectFolder", projectId }),
      });
    });
  }

  async function createSubfolder() {
    if (!selectedFolder || !newFolderName.trim()) return;

    await runAction("Mappen ble opprettet.", async () => {
      await requestJson("/api/dokumenter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createFolder",
          parentId: selectedFolder.id,
          name: newFolderName,
        }),
      });
    });
    setNewFolderName("");
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

  async function runAction(successMessage: string, action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      await action();
      setMessage(successMessage);
      await loadDocuments();
    } catch (actionError) {
      setError(errorMessage(actionError, "Handlingen feilet."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Dokumenter</h2>
          <p className="mt-1 text-sm text-slate-600">
            Prosjektmappen speiles med dokumenthotellet.
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => void createProjectFolder()}
            >
              <IconFolderPlus className="h-5 w-5" />
              Opprett prosjektmappe
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={!selectedFolder || !newFolderName.trim() || busy}
              onClick={() => void createSubfolder()}
            >
              <IconFolderPlus className="h-5 w-5" />
              Ny undermappe
            </button>
            {selectedFolder?.kind === "CUSTOM" ? (
              <>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => {
                    const name = window.prompt("Nytt mappenavn", selectedFolder.name);
                    if (name?.trim()) void renameFolder(selectedFolder.id, name);
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
                    if (confirmed) void deleteFolder(selectedFolder.id);
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
        ) : null}
      </div>

      <div className="space-y-5 p-6">
        {error ? <StatusBanner tone="error">{error}</StatusBanner> : null}
        {message ? <StatusBanner tone="success">{message}</StatusBanner> : null}
        <StatusBanner tone="info">
          Filopplasting og signert PDF-arkiv er placeholders frem til Azure Blob og PDF-rendering er konfigurert.
          {storageConfigured ? " Azure-miljøvariabler finnes, men opplastingsruten er fortsatt bevisst sperret." : ""}
        </StatusBanner>

        {loading ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            Laster prosjektdokumenter...
          </div>
        ) : tree.length === 0 ? (
          <div className="space-y-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            <IconFileText className="mx-auto h-8 w-8 text-slate-400" />
            <div>Ingen prosjektmappe er opprettet ennå.</div>
            {canEdit ? (
              <button
                type="button"
                className={primaryButtonClass}
                disabled={busy}
                onClick={() => void createProjectFolder()}
              >
                <IconFolderPlus className="h-5 w-5" />
                Opprett prosjektmappe
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[20rem_1fr]">
            <div className="rounded-xl border border-slate-200 p-3">
              <FolderTree
                nodes={tree}
                selectedFolderId={selectedFolderId}
                onSelectFolder={setSelectedFolderId}
              />
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {selectedFolder?.name ?? "Velg mappe"}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedFolder?.kind === "PROJECT"
                    ? "Hovedmappe for prosjektet."
                    : "Undermappe i prosjektets dokumentstruktur."}
                </p>
              </div>
              {canEdit && selectedFolder ? (
                <div>
                  <label className="text-sm font-medium text-slate-700" htmlFor="project-subfolder">
                    Ny undermappe
                  </label>
                  <input
                    id="project-subfolder"
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    placeholder="Skriv mappenavn og trykk Ny undermappe"
                    className={`${inputClass} mt-1 max-w-xl`}
                  />
                </div>
              ) : null}
              <FilesTable files={selectedFolder?.files ?? []} />
            </div>
          </div>
        )}
      </div>
    </section>
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

function findFolderById(nodes: DocumentFolderNode[], folderId: string): DocumentFolderNode | null {
  for (const node of nodes) {
    if (node.id === folderId) return node;
    const match = findFolderById(node.children, folderId);
    if (match) return match;
  }
  return null;
}

function formatFileSize(bytes: number | null) {
  if (bytes === null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
