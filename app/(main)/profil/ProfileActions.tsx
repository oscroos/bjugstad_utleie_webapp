"use client";

export default function ProfileActions() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
      <button
        onClick={() => alert("TODO: Implement functionality")}
        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 cursor-pointer"
      >
        Be om innsyn i lagrede data
      </button>

      <button
        onClick={() => alert("TODO: Implement functionality")}
        className="cursor-pointer rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
      >
        Slett bruker
      </button>
    </div>
  );
}
