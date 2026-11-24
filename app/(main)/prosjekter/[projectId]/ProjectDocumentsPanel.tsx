"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import {
  IconChevronRight,
  IconDots,
  IconFileText,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconLoader2,
  IconPencil,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { formatDate } from "@/lib/formatters";
import { useContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import { useDialogs } from "@/components/dialogs/ConfirmDialog";

// The Dokumenter tab on a project: a folder tree on the left and the content of
// the open folder on the right, like a file explorer.
//
// There are no action buttons. Everything that can be done to a folder is in
// its right-click menu. The same menu opens from the "…" button on each row, so
// it also works on touch screens and with the keyboard.

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

const primaryButtonClass =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60";
// Tall enough that a project with a single folder does not look collapsed.
const sectionMinHeightClass = "min-h-[30rem]";
const emptyStateClass = `flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500 ${sectionMinHeightClass}`;
const moreButtonBaseClass =
  "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-slate-400 transition hover:bg-slate-200 hover:text-slate-700";
// On a row the button appears on hover or keyboard focus. Touch screens have no hover, so there it is always shown.
const moreButtonClass = `${moreButtonBaseClass} opacity-0 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100`;

export default function ProjectDocumentsPanel({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const { confirm, prompt } = useDialogs();
  const menu = useContextMenu();
  const [tree, setTree] = useState<DocumentFolderNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  // The folder whose menu is open, so its row can be marked while the menu is up.
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // What is being saved right now ("Oppretter mappe..."), or null. While it is set, a
  // spinner covers the folders and nothing else changes on screen.
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = busyLabel !== null;
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedFolder = useMemo(
    () => (selectedFolderId ? findFolderById(tree, selectedFolderId) : null),
    [selectedFolderId, tree],
  );
  const selectedPath = useMemo(
    () => (selectedFolderId ? findFolderPath(tree, selectedFolderId) : []),
    [selectedFolderId, tree],
  );

  const fetchTree = useCallback(
    async () => (await requestJson<DocumentsPayload>(`/api/dokumenter?projectId=${projectId}`)).tree,
    [projectId],
  );

  /**
   * Shows a freshly loaded tree. `open` names the folder to show afterwards;
   * without it the folder that was open stays open if it still exists.
   */
  const applyTree = useCallback((nextTree: DocumentFolderNode[], open?: string | null) => {
    setTree(nextTree);
    // Top-level folders start open; folders the user opened stay open across reloads.
    setExpandedIds((current) => {
      const next = new Set([...current].filter((id) => findFolderById(nextTree, id)));
      for (const folder of nextTree) next.add(folder.id);
      if (open && findFolderById(nextTree, open)) next.add(open);
      return next;
    });
    setSelectedFolderId((current) => {
      const wanted = open === undefined ? current : open;
      return wanted && findFolderById(nextTree, wanted) ? wanted : nextTree[0]?.id ?? null;
    });
    if (open !== undefined) setSelectedFileId(null);
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      applyTree(await fetchTree());
    } catch (loadError) {
      setError(errorMessage(loadError, "Kunne ikke laste prosjektdokumenter."));
    } finally {
      setLoading(false);
    }
  }, [applyTree, fetchTree]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  function openFolder(folderId: string) {
    setSelectedFolderId(folderId);
    setSelectedFileId(null);
    setExpandedIds((current) => (current.has(folderId) ? current : new Set(current).add(folderId)));
  }

  function toggleFolder(folderId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  /**
   * Saves a change and reloads the folders. The spinner stays up until both are
   * done; the new folder list, the open folder and the message then appear in
   * the same instant, instead of one after the other.
   */
  async function runAction(
    label: string,
    successMessage: string,
    action: () => Promise<unknown>,
    openAfter?: string | null,
  ) {
    setBusyLabel(label);
    setError(null);
    setMessage(null);

    try {
      await action();
      let nextTree: DocumentFolderNode[];
      try {
        nextTree = await fetchTree();
      } catch {
        throw new Error("Endringen ble lagret, men mappene kunne ikke lastes på nytt. Last siden på nytt.");
      }
      applyTree(nextTree, openAfter);
      setMessage(successMessage);
    } catch (actionError) {
      setError(errorMessage(actionError, "Handlingen feilet."));
    } finally {
      setBusyLabel(null);
    }
  }

  async function createProjectFolder() {
    await runAction("Oppretter prosjektmappe...", "Prosjektmappen ble opprettet.", async () => {
      await requestJson("/api/dokumenter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createProjectFolder", projectId }),
      });
    });
  }

  async function createSubfolder(parent: DocumentFolderNode) {
    const name = await prompt({
      title: "Ny mappe",
      message: `Mappen opprettes i «${parent.name}».`,
      inputLabel: "Mappenavn",
      confirmLabel: "Opprett",
    });
    if (!name) return;

    await runAction(
      "Oppretter mappe...",
      `Mappen «${name}» ble opprettet.`,
      () =>
        requestJson("/api/dokumenter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "createFolder", parentId: parent.id, name }),
        }),
      // Show the parent afterwards, so the new folder is visible.
      parent.id,
    );
  }

  async function renameFolder(folder: DocumentFolderNode) {
    const name = await prompt({
      title: "Gi mappen nytt navn",
      inputLabel: "Mappenavn",
      defaultValue: folder.name,
    });
    if (!name || name === folder.name) return;

    await runAction("Lagrer nytt navn...", `Mappen heter nå «${name}».`, () =>
      requestJson("/api/dokumenter", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: folder.id, name }),
      }),
    );
  }

  async function deleteFolder(folder: DocumentFolderNode) {
    const confirmed = await confirm({
      title: "Slette mappen?",
      message: `Mappen «${folder.name}»${describeContents(folder)} blir slettet. Dette kan ikke angres.`,
      confirmLabel: "Slett",
      tone: "danger",
    });
    if (!confirmed) return;

    // Step out to the parent afterwards if this folder, or one inside it, is the one being shown.
    const showingDeleted = Boolean(selectedFolderId && findFolderById([folder], selectedFolderId));
    await runAction(
      "Sletter mappe...",
      `Mappen «${folder.name}» ble slettet.`,
      () =>
        requestJson("/api/dokumenter", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: folder.id }),
        }),
      showingDeleted ? folder.parentId : undefined,
    );
  }

  /** Everything that can be done to a folder. `includeOpen` is left out for the folder already shown. */
  function folderMenuItems(folder: DocumentFolderNode, includeOpen = true): ContextMenuItem[] {
    // Only folders the user created can be renamed or deleted; the project's main folder is fixed.
    const fixed = folder.kind !== "CUSTOM";
    const items: ContextMenuItem[] = [];
    if (includeOpen) {
      items.push(
        { label: "Åpne", icon: <IconFolderOpen className="h-5 w-5" />, onSelect: () => openFolder(folder.id) },
        { separator: true },
      );
    }
    items.push(
      {
        label: "Ny mappe",
        icon: <IconFolderPlus className="h-5 w-5" />,
        onSelect: () => void createSubfolder(folder),
        disabled: busy,
      },
      {
        label: "Last opp fil",
        icon: <IconUpload className="h-5 w-5" />,
        onSelect: () => {},
        disabled: true,
        hint: "Kommer senere",
      },
      { separator: true },
      {
        label: "Gi nytt navn",
        icon: <IconPencil className="h-5 w-5" />,
        onSelect: () => void renameFolder(folder),
        disabled: fixed || busy,
        hint: fixed ? "Fast mappe" : undefined,
      },
      {
        label: "Slett",
        icon: <IconTrash className="h-5 w-5" />,
        onSelect: () => void deleteFolder(folder),
        disabled: fixed || busy,
        hint: fixed ? "Fast mappe" : undefined,
        tone: "danger",
      },
    );
    return items;
  }

  // Right-click on a folder. Users without edit rights keep the browser's own menu.
  function onFolderContextMenu(event: MouseEvent, folder: DocumentFolderNode, includeOpen = true) {
    if (!canEdit) return;
    setMenuFolderId(folder.id);
    menu.open(event, folderMenuItems(folder, includeOpen));
  }

  // The "…" button: the same menu, for touch screens and the keyboard.
  function onFolderMoreClick(anchor: HTMLElement, folder: DocumentFolderNode, includeOpen = true) {
    setMenuFolderId(folder.id);
    menu.openFrom(anchor, folderMenuItems(folder, includeOpen));
  }

  const markedFolderId = menu.isOpen ? menuFolderId : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-xl font-semibold text-slate-900">Dokumenter</h2>
        <p className="mt-1 text-sm text-slate-600">
          Mapper og filer for prosjektet.
          {canEdit && tree.length > 0
            ? " Høyreklikk for å lage ny mappe, gi nytt navn eller slette."
            : ""}
        </p>
      </div>

      <div className="space-y-5 p-6">
        {error ? (
          <StatusBanner tone="error" onClose={() => setError(null)}>
            {error}
          </StatusBanner>
        ) : null}
        {message ? (
          <StatusBanner tone="success" onClose={() => setMessage(null)}>
            {message}
          </StatusBanner>
        ) : null}

        {loading && tree.length === 0 ? (
          <div className={`${emptyStateClass} gap-3`}>
            <IconLoader2 className="h-5 w-5 animate-spin text-blue-600" />
            Laster prosjektdokumenter...
          </div>
        ) : tree.length === 0 ? (
          <div className={`${emptyStateClass} relative flex-col gap-4`}>
            {busy ? <BusyOverlay label={busyLabel} /> : null}
            <IconFileText className="mx-auto h-8 w-8 text-slate-400" />
            <div>Prosjektet har ingen dokumentmappe ennå.</div>
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
          <div className={`relative grid gap-5 xl:grid-cols-[20rem_1fr] ${sectionMinHeightClass}`} aria-busy={busy}>
            {busy ? <BusyOverlay label={busyLabel} /> : null}
            {/* Right-click anywhere in the box, also below the last folder, gives the menu for the project's main folder. */}
            <div
              className="rounded-xl border border-slate-200 p-3"
              onContextMenu={(event) => onFolderContextMenu(event, tree[0], false)}
            >
              <FolderTree
                nodes={tree}
                selectedFolderId={selectedFolderId}
                selectedFileId={selectedFileId}
                markedFolderId={markedFolderId}
                expandedIds={expandedIds}
                canEdit={canEdit}
                onToggle={toggleFolder}
                onSelectFolder={openFolder}
                onSelectFile={(folderId, fileId) => {
                  setSelectedFolderId(folderId);
                  setSelectedFileId(fileId);
                }}
                onFolderContextMenu={onFolderContextMenu}
                onFolderMoreClick={onFolderMoreClick}
              />
            </div>

            {selectedFolder ? (
              <FolderContents
                folder={selectedFolder}
                path={selectedPath}
                canEdit={canEdit}
                selectedFileId={selectedFileId}
                markedFolderId={markedFolderId}
                onOpenFolder={openFolder}
                onSelectFile={setSelectedFileId}
                onFolderContextMenu={onFolderContextMenu}
                onFolderMoreClick={onFolderMoreClick}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                Velg en mappe i listen til venstre.
              </div>
            )}
          </div>
        )}
      </div>

      {menu.element}
    </section>
  );
}

type FolderMenuHandlers = {
  onFolderContextMenu: (event: MouseEvent, folder: DocumentFolderNode, includeOpen?: boolean) => void;
  onFolderMoreClick: (anchor: HTMLElement, folder: DocumentFolderNode, includeOpen?: boolean) => void;
};

function FolderTree({
  nodes,
  selectedFolderId,
  selectedFileId,
  markedFolderId,
  expandedIds,
  canEdit,
  onToggle,
  onSelectFolder,
  onSelectFile,
  onFolderContextMenu,
  onFolderMoreClick,
  depth = 0,
}: FolderMenuHandlers & {
  nodes: DocumentFolderNode[];
  selectedFolderId: string | null;
  selectedFileId: string | null;
  markedFolderId: string | null;
  expandedIds: Set<string>;
  canEdit: boolean;
  onToggle: (folderId: string) => void;
  onSelectFolder: (folderId: string) => void;
  onSelectFile: (folderId: string, fileId: string) => void;
  depth?: number;
}) {
  return (
    <ul role={depth === 0 ? "tree" : "group"} className="space-y-0.5">
      {nodes.map((folder) => {
        const selected = folder.id === selectedFolderId && !selectedFileId;
        const marked = folder.id === markedFolderId;
        const isEmpty = folder.children.length === 0 && folder.files.length === 0;
        const expanded = expandedIds.has(folder.id);
        const FolderIcon = expanded ? IconFolderOpen : IconFolder;

        return (
          <li key={folder.id} role="treeitem" aria-expanded={expanded} aria-selected={selected}>
            <div
              onContextMenu={(event) => onFolderContextMenu(event, folder)}
              className={`group flex items-center gap-1 rounded-lg pr-1 text-sm transition ${
                selected ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-700 hover:bg-slate-50"
              } ${marked ? "ring-2 ring-blue-300" : ""}`}
              style={{ paddingLeft: `${4 + depth * 16}px` }}
            >
              {/* Every folder has the arrow, also an empty one; opened, it then says that it is empty. */}
              <button
                type="button"
                onClick={() => onToggle(folder.id)}
                aria-label={expanded ? `Lukk ${folder.name}` : `Åpne ${folder.name}`}
                className="flex h-7 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-slate-400 hover:text-slate-700"
              >
                <IconChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
              </button>
              <button
                type="button"
                onClick={() => onSelectFolder(folder.id)}
                onDoubleClick={() => onToggle(folder.id)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 text-left"
              >
                <FolderIcon className="h-5 w-5 shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                {folder.files.length > 0 ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                    {folder.files.length}
                  </span>
                ) : null}
              </button>
              {canEdit ? (
                <button
                  type="button"
                  aria-label={`Valg for ${folder.name}`}
                  aria-haspopup="menu"
                  onClick={(event) => onFolderMoreClick(event.currentTarget, folder)}
                  className={moreButtonClass}
                >
                  <IconDots className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {expanded ? (
              <div className="mt-0.5">
                {isEmpty ? (
                  <p
                    className="py-1 pr-2 text-xs italic text-slate-400"
                    style={{ paddingLeft: `${4 + (depth + 1) * 16 + 28}px` }}
                  >
                    Mappen er tom
                  </p>
                ) : null}
                {folder.children.length > 0 ? (
                  <FolderTree
                    nodes={folder.children}
                    selectedFolderId={selectedFolderId}
                    selectedFileId={selectedFileId}
                    markedFolderId={markedFolderId}
                    expandedIds={expandedIds}
                    canEdit={canEdit}
                    onToggle={onToggle}
                    onSelectFolder={onSelectFolder}
                    onSelectFile={onSelectFile}
                    onFolderContextMenu={onFolderContextMenu}
                    onFolderMoreClick={onFolderMoreClick}
                    depth={depth + 1}
                  />
                ) : null}
                {folder.files.length > 0 ? (
                  <ul role="group" className="space-y-0.5">
                    {folder.files.map((file) => {
                      const fileSelected = file.id === selectedFileId;
                      return (
                        <li
                          key={file.id}
                          role="treeitem"
                          aria-selected={fileSelected}
                          onContextMenu={(event) => onFolderContextMenu(event, folder)}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectFile(folder.id, file.id)}
                            title={file.name}
                            className={`flex w-full cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm transition ${
                              fileSelected ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-600 hover:bg-slate-50"
                            }`}
                            style={{ paddingLeft: `${4 + (depth + 1) * 16 + 28}px` }}
                          >
                            <IconFileText className="h-4 w-4 shrink-0 text-slate-400" />
                            <span className="min-w-0 flex-1 truncate">{file.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The open folder: where it is (breadcrumb), then its subfolders and files in one list. */
function FolderContents({
  folder,
  path,
  canEdit,
  selectedFileId,
  markedFolderId,
  onOpenFolder,
  onSelectFile,
  onFolderContextMenu,
  onFolderMoreClick,
}: FolderMenuHandlers & {
  folder: DocumentFolderNode;
  path: DocumentFolderNode[];
  canEdit: boolean;
  selectedFileId: string | null;
  markedFolderId: string | null;
  onOpenFolder: (folderId: string) => void;
  onSelectFile: (fileId: string) => void;
}) {
  const isEmpty = folder.children.length === 0 && folder.files.length === 0;
  const columnCount = canEdit ? 6 : 5;

  return (
    // Right-click on the list or the empty space below it gives the menu for the open folder.
    <div className="h-full min-w-0 space-y-3" onContextMenu={(event) => onFolderContextMenu(event, folder, false)}>
      <div className="group flex items-center gap-2">
        <nav aria-label="Mappesti" className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
          {path.map((step, index) => {
            const last = index === path.length - 1;
            return (
              <span key={step.id} className="flex min-w-0 items-center gap-1">
                {index > 0 ? <IconChevronRight className="h-4 w-4 shrink-0 text-slate-300" /> : null}
                {last ? (
                  <span className="truncate text-lg font-semibold text-slate-900">{step.name}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenFolder(step.id)}
                    className="cursor-pointer truncate text-slate-500 hover:text-blue-700 hover:underline"
                  >
                    {step.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
        {canEdit ? (
          <button
            type="button"
            aria-label={`Valg for ${folder.name}`}
            aria-haspopup="menu"
            onClick={(event) => onFolderMoreClick(event.currentTarget, folder, false)}
            className={moreButtonBaseClass}
          >
            <IconDots className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Navn</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Størrelse</th>
              <th className="px-4 py-3">Dato</th>
              <th className="px-4 py-3">Av</th>
              {canEdit ? <th className="w-10 px-2 py-3" aria-label="Valg" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {isEmpty ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-10 text-center text-slate-500">
                  Mappen er tom.
                  {canEdit ? " Høyreklikk her for å lage en mappe." : ""}
                </td>
              </tr>
            ) : null}

            {folder.children.map((child) => (
              <tr
                key={child.id}
                // Stop here, so the row's own menu opens and not the one for the open folder.
                onContextMenu={(event) => onFolderContextMenu(event, child)}
                className={`group hover:bg-slate-50 ${child.id === markedFolderId ? "bg-blue-50/60" : ""}`}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onOpenFolder(child.id)}
                    className="flex max-w-full cursor-pointer items-center gap-2 text-left font-semibold text-slate-900 hover:text-blue-700"
                  >
                    <IconFolder className="h-5 w-5 shrink-0 text-slate-500" />
                    <span className="truncate">{child.name}</span>
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-700">Mappe</td>
                <td className="px-4 py-3 text-slate-500">{describeFolderSize(child)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                  {formatDate(child.createdAt, { showTime: false }) ?? "-"}
                </td>
                <td className="px-4 py-3 text-slate-500">-</td>
                {canEdit ? (
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      aria-label={`Valg for ${child.name}`}
                      aria-haspopup="menu"
                      onClick={(event) => onFolderMoreClick(event.currentTarget, child)}
                      className={moreButtonClass}
                    >
                      <IconDots className="h-4 w-4" />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}

            {folder.files.map((file) => (
              <tr
                key={file.id}
                onClick={() => onSelectFile(file.id)}
                className={`cursor-default ${file.id === selectedFileId ? "bg-blue-50" : "hover:bg-slate-50"}`}
              >
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2 font-semibold text-slate-900">
                    <IconFileText className="h-5 w-5 shrink-0 text-slate-400" />
                    <span className="truncate">{file.name}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-700">{file.contentType ?? "-"}</td>
                <td className="px-4 py-3 text-slate-700">{formatFileSize(file.sizeBytes)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                  {formatDate(file.createdAt, { showTime: false }) ?? "-"}
                </td>
                <td className="px-4 py-3 text-slate-700">{file.uploadedByName ?? "-"}</td>
                {canEdit ? <td className="px-2 py-3" /> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Covers the folders while a change is being saved, so nothing updates halfway. */
function BusyOverlay({ label }: { label: string | null }) {
  return (
    <div
      role="status"
      className="absolute inset-0 z-10 flex items-center justify-center gap-3 rounded-xl bg-white/75 text-sm font-medium text-slate-700"
    >
      <IconLoader2 className="h-6 w-6 animate-spin text-blue-600" />
      {label ?? "Lagrer..."}
    </div>
  );
}

function StatusBanner({
  tone,
  onClose,
  children,
}: {
  tone: "success" | "error";
  onClose: () => void;
  children: ReactNode;
}) {
  const className =
    tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-xl border py-3 pl-4 pr-2 text-sm ${className}`}
    >
      <div className="min-w-0 flex-1 py-0.5">{children}</div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Lukk melding"
        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded opacity-70 transition hover:bg-black/5 hover:opacity-100"
      >
        <IconX className="h-4 w-4" />
      </button>
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

/** The folders from the top level down to the given folder, inclusive. */
function findFolderPath(nodes: DocumentFolderNode[], folderId: string): DocumentFolderNode[] {
  for (const node of nodes) {
    if (node.id === folderId) return [node];
    const rest = findFolderPath(node.children, folderId);
    if (rest.length > 0) return [node, ...rest];
  }
  return [];
}

function countContents(folder: DocumentFolderNode): { folders: number; files: number } {
  return folder.children.reduce(
    (total, child) => {
      const inner = countContents(child);
      return { folders: total.folders + 1 + inner.folders, files: total.files + inner.files };
    },
    { folders: 0, files: folder.files.length },
  );
}

/** " og alt innholdet (2 mapper og 3 filer)", or nothing for an empty folder. */
function describeContents(folder: DocumentFolderNode) {
  const { folders, files } = countContents(folder);
  const parts = [
    folders > 0 ? `${folders} ${folders === 1 ? "mappe" : "mapper"}` : null,
    files > 0 ? `${files} ${files === 1 ? "fil" : "filer"}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? ` og alt innholdet (${parts.join(" og ")})` : "";
}

function describeFolderSize(folder: DocumentFolderNode) {
  const count = folder.children.length + folder.files.length;
  return count === 0 ? "Tom" : `${count} ${count === 1 ? "element" : "elementer"}`;
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
