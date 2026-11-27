"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconLoader2, IconX } from "@tabler/icons-react";
import { useDialogs } from "@/components/dialogs/ConfirmDialog";
import ProjectSetupForm, {
  type ProjectSetupCustomer,
  type ProjectSetupFieldDefinition,
  type ProjectSetupInitialProject,
  type ProjectSetupMassType,
  type ProjectSetupSection,
} from "../ProjectSetupForm";

// Editing a project in an overlay on top of the project page, instead of on a
// page of its own. `sections` decides how much of the setup form is shown: the
// whole project, or only the part behind the edit button that was clicked.

type SetupPayload = {
  project: ProjectSetupInitialProject & {
    customer: { customer_id: number; name: string | null; organization_number: string | null };
  };
  fieldDefinitions: ProjectSetupFieldDefinition[];
  massTypes: ProjectSetupMassType[];
};

type LoadedSetup = {
  customer: ProjectSetupCustomer;
  project: ProjectSetupInitialProject;
  fieldDefinitions: ProjectSetupFieldDefinition[];
  massTypes: ProjectSetupMassType[];
};

export default function ProjectEditOverlay({
  projectId,
  title,
  subtitle,
  sections,
  onClose,
  onSaved,
}: {
  projectId: string;
  title: string;
  subtitle: string;
  sections: ProjectSetupSection[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { confirm } = useDialogs();
  const [setup, setSetup] = useState<LoadedSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // The form needs the project's current values and the active catalogues.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/prosjekter/${projectId}/oppsett`, { cache: "no-store" });
        const body = (await response.json().catch(() => ({}))) as Partial<SetupPayload> & { error?: string };
        if (!response.ok || !body.project) throw new Error(body.error ?? "Kunne ikke hente prosjektet");
        if (cancelled) return;
        setSetup(toLoadedSetup(body as SetupPayload));
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente prosjektet");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Closing with unsaved changes asks first.
  const requestClose = useCallback(async () => {
    if (dirtyRef.current) {
      const discard = await confirm({
        title: "Forkaste endringene?",
        message: "Du har endringer som ikke er lagret.",
        confirmLabel: "Forkast",
        cancelLabel: "Fortsett å redigere",
        closeInCorner: true,
        tone: "danger",
      });
      if (!discard) return;
    }
    onClose();
  }, [confirm, onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    // The page behind must not scroll while the overlay is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      // The confirm dialog handles its own Escape first (it listens in the capture phase).
      if (event.key === "Escape" && !event.defaultPrevented) void requestClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [requestClose]);

  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 py-8">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // Never taller than the window: the form scrolls inside, between the title and the buttons.
        className="flex max-h-full w-full max-w-5xl flex-col rounded-2xl bg-slate-50 shadow-2xl outline-none ring-1 ring-slate-900/10"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 rounded-t-2xl border-b border-slate-200 bg-white px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
            <p className="mt-0.5 truncate text-sm text-slate-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            aria-label="Lukk"
            className="cursor-pointer rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {error ? (
            <div role="alert" className="m-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : !setup ? (
            <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-slate-600">
              <IconLoader2 className="h-5 w-5 animate-spin text-blue-600" />
              Laster prosjektet...
            </div>
          ) : (
            <ProjectSetupForm
              mode="edit"
              customers={[setup.customer]}
              fieldDefinitions={setup.fieldDefinitions}
              massTypes={setup.massTypes}
              project={setup.project}
              sections={sections}
              onSaved={onSaved}
              onCancel={() => void requestClose()}
              onDirtyChange={onDirtyChange}
              stickyFooter
            />
          )}
        </div>
      </div>
    </div>
  );
}

function toLoadedSetup(payload: SetupPayload): LoadedSetup {
  const { customer, ...project } = payload.project;
  return {
    customer: {
      id: customer.customer_id,
      name: customer.name,
      organizationNumber: customer.organization_number,
    },
    project: {
      ...project,
      fieldValues: project.fieldValues.map((row) => ({ definitionId: row.definitionId, value: row.value })),
      massTypes: project.massTypes.map((row) => ({
        massTypeId: row.massTypeId,
        plannedIn: row.plannedIn,
        plannedOut: row.plannedOut,
      })),
      kpis: project.kpis.map((kpi) => ({
        id: kpi.id,
        metric: kpi.metric,
        label: kpi.label,
        targetValue: kpi.targetValue,
        currentValue: kpi.currentValue,
        unit: kpi.unit,
        contractRef: kpi.contractRef,
      })),
    },
    fieldDefinitions: payload.fieldDefinitions,
    massTypes: payload.massTypes,
  };
}
