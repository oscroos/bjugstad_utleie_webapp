// components/ErrorPanel.tsx
"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { AppError, isAppError } from "@/lib/errors";
import { ArrowPathIcon, ArrowLeftEndOnRectangleIcon, ExclamationTriangleIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

export default function ErrorPanel({
    error,
    title = "Noe gikk galt",
    onRetry,
    withSidebar = true,
}: {
    error: unknown;
    title?: string;
    onRetry?: () => void;
    withSidebar?: boolean; // if true, panel sizes for content area (not full-screen)
}) {
    const [open, setOpen] = useState(false);
    const e: AppError | null = isAppError(error) ? error : null;

    const headline = e?.title ?? title;
    const message =
        e?.message ??
        "En uventet feil oppstod. Prøv igjen, eller logg ut og inn på nytt.";

    const hasDetails = Boolean(e?.details) || (!e && error != null);

    return (
        <section
            className={[
                "grid place-items-center",
                withSidebar ? "min-h-[60vh] p-6" : "min-h-screen p-8",
            ].join(" ")}
        >
            <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
                <div className="flex items-start gap-3 p-5 border-b border-slate-100">
                    <div className="rounded-full bg-red-50 p-2 ring-1 ring-red-100">
                        <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-semibold text-slate-900">{headline}</h2>
                        <p className="mt-1 text-sm text-slate-600">{message}</p>

                        {/* Small “reason tip” based on code */}
                        {e?.code === "MACHINES_TIMEOUT" && (
                            <p className="mt-2 text-xs text-slate-500">
                                Tips: sjekk nettverket ditt. Azure kan også ha et kortvarig avbrudd.
                            </p>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="p-5 flex flex-wrap gap-3">
                    {onRetry && (
                        <button
                            onClick={onRetry}
                            className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition"
                        >
                            <ArrowPathIcon className="h-5 w-5" />
                            Prøv igjen
                        </button>
                    )}

                    <button
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className="cursor-pointer inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-slate-800 hover:bg-slate-200 transition"
                    >
                        <ArrowLeftEndOnRectangleIcon className="h-5 w-5" />
                        Logg ut
                    </button>

                    {/* Details toggle */}
                    {hasDetails && (
                        <button
                            onClick={() => setOpen((v) => !v)}
                            className="ml-auto inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 cursor-pointer transition"
                        >
                            <ChevronDownIcon className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
                            Vis detaljer
                        </button>
                    )}
                </div>

                {open && (
                    <pre className="max-h-64 overflow-auto bg-slate-50 border-t border-slate-100 text-xs text-slate-700 p-4 rounded-b-2xl">
                        {JSON.stringify(e?.details ?? error, null, 2)}
                    </pre>
                )}
            </div>
        </section>
    );
}
