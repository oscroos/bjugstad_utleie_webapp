"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { IconAlertTriangle, IconHelp } from "@tabler/icons-react";
import { destructiveButtonClass, standardButtonClass } from "@/lib/buttonStyles";

// The app's own replacement for window.confirm and window.prompt.
//
//   const { confirm, prompt } = useDialogs();
//   if (!(await confirm({ title: "Slette mappen?", tone: "danger", confirmLabel: "Slett" }))) return;
//   const name = await prompt({ title: "Nytt mappenavn", defaultValue: folder.name });
//
// confirm() resolves to true or false. prompt() resolves to the trimmed text, or
// null when the user cancels.

export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for actions that delete or remove something. */
  tone?: "default" | "danger";
};

export type PromptOptions = ConfirmOptions & {
  inputLabel?: string;
  defaultValue?: string;
  placeholder?: string;
  /** Defaults to true: the confirm button stays disabled while the field is empty. */
  required?: boolean;
  maxLength?: number;
};

type DialogsApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
};

type Pending =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

const DialogsContext = createContext<DialogsApi | null>(null);

const cancelButtonClass =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50";
const inputClass =
  "mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

export function useDialogs(): DialogsApi {
  const api = useContext(DialogsContext);
  if (!api) throw new Error("useDialogs must be used inside ConfirmDialogProvider");
  return api;
}

export default function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const open = useCallback((next: Pending) => {
    // A dialog that is still open is cancelled before the next one replaces it.
    const current = pendingRef.current;
    if (current) {
      if (current.kind === "confirm") current.resolve(false);
      else current.resolve(null);
    }
    pendingRef.current = next;
    setPending(next);
  }, []);

  const api = useMemo<DialogsApi>(
    () => ({
      confirm: (options) => new Promise<boolean>((resolve) => open({ kind: "confirm", options, resolve })),
      prompt: (options) => new Promise<string | null>((resolve) => open({ kind: "prompt", options, resolve })),
    }),
    [open],
  );

  const close = useCallback((value: string | boolean | null) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    if (current.kind === "confirm") current.resolve(value === true);
    else current.resolve(typeof value === "string" ? value : null);
  }, []);

  return (
    <DialogsContext.Provider value={api}>
      {children}
      {pending ? <DialogView key={pending.options.title} pending={pending} onClose={close} /> : null}
    </DialogsContext.Provider>
  );
}

function DialogView({
  pending,
  onClose,
}: {
  pending: Pending;
  onClose: (value: string | boolean | null) => void;
}) {
  const { options } = pending;
  const isPrompt = pending.kind === "prompt";
  const promptOptions = isPrompt ? pending.options : null;
  const required = promptOptions?.required ?? true;
  const [value, setValue] = useState(promptOptions?.defaultValue ?? "");
  const titleId = useId();
  const messageId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const danger = options.tone === "danger";

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Text field first; otherwise the safe choice for destructive actions is "cancel".
    if (isPrompt) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (danger) {
      cancelRef.current?.focus();
    } else {
      confirmRef.current?.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose(null);
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [danger, isPrompt, onClose]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isPrompt) {
      onClose(true);
      return;
    }
    const trimmed = value.trim();
    if (required && !trimmed) return;
    onClose(trimmed);
  }

  const Icon = danger ? IconAlertTriangle : IconHelp;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 px-4 py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose(null);
      }}
    >
      <form
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.message ? messageId : undefined}
        onSubmit={submit}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10"
      >
        <div className="px-6 py-5">
          {/* Icon on its own line above the title, aligned left. */}
          <span
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${
              danger ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
            }`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="mt-3 min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {options.title}
            </h2>
            {options.message ? (
              <div id={messageId} className="mt-1 text-sm leading-relaxed text-slate-600">
                {options.message}
              </div>
            ) : null}
            {promptOptions ? (
              <label className="mt-3 block text-sm font-medium text-slate-700">
                {promptOptions.inputLabel ?? ""}
                <input
                  ref={inputRef}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={promptOptions.placeholder}
                  maxLength={promptOptions.maxLength}
                  aria-label={promptOptions.inputLabel ? undefined : options.title}
                  className={inputClass}
                />
              </label>
            ) : null}
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-3">
          <button ref={cancelRef} type="button" className={cancelButtonClass} onClick={() => onClose(null)}>
            {options.cancelLabel ?? "Avbryt"}
          </button>
          <button
            ref={confirmRef}
            type="submit"
            className={danger ? destructiveButtonClass : standardButtonClass}
            disabled={isPrompt && required && !value.trim()}
          >
            {options.confirmLabel ?? (isPrompt ? "Lagre" : "Bekreft")}
          </button>
        </div>
      </form>
    </div>
  );
}
