// components/TermsDialog.tsx
"use client";

import { standardButtonClass } from "@/lib/buttonStyles";

export default function TermsDialog({
  open,
  onClose,
}: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-900">Vilkår og betingelser</h2>
        </div>

        {/* Scrollable viewer */}
        <div className="p-0 max-h-[70vh]">
          <object
            data="/terms.pdf"
            type="application/pdf"
            className="w-full h-[70vh]"
          >
            {/* Fallback link */}
            <div className="p-5 text-sm">
              Kan ikke vise PDF i nettleseren.{" "}
              <a href="terms.pdf" className="underline text-blue-600 cursor-pointer">
                Last ned vilkårene
              </a>
              .
            </div>
          </object>
        </div>

        <div className="px-5 py-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className={standardButtonClass}
          >
            Lukk
          </button>
        </div>
      </div>
    </div>
  );
}
