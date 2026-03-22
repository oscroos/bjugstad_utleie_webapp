"use client";

import { destructiveButtonClass, standardButtonClass } from "@/lib/buttonStyles";

export default function ProfileActions() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
      <button
        onClick={() => alert("TODO: Implement functionality")}
        className={standardButtonClass}
      >
        Be om innsyn i lagrede data
      </button>

      <button
        onClick={() => alert("TODO: Implement functionality")}
        className={destructiveButtonClass}
      >
        Slett bruker
      </button>
    </div>
  );
}
