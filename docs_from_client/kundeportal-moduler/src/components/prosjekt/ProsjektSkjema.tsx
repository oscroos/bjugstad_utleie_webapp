"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const felt =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

export default function ProsjektSkjema() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    projectNumber: "",
    name: "",
    description: "",
    addressLine: "",
    postalCode: "",
    city: "",
    clientName: "",
    clientContactName: "",
    clientContactEmail: "",
    clientContactPhone: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setError(null);
    setSaving(true);
    const res = await fetch("/api/prosjekter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Kunne ikke opprette prosjekt.");
      return;
    }
    const { project } = await res.json();
    router.push(`/prosjekter/${project.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Prosjektinformasjon
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Prosjektnummer *</label>
            <input className={felt} value={form.projectNumber} onChange={set("projectNumber")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Prosjektnavn *</label>
            <input className={felt} value={form.name} onChange={set("name")} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Beskrivelse</label>
            <textarea className={felt} rows={2} value={form.description} onChange={set("description")} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Adresse</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Gateadresse</label>
            <input className={felt} value={form.addressLine} onChange={set("addressLine")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Postnr.</label>
            <input className={felt} value={form.postalCode} onChange={set("postalCode")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Sted</label>
            <input className={felt} value={form.city} onChange={set("city")} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Byggherre</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Byggherre</label>
            <input className={felt} value={form.clientName} onChange={set("clientName")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Kontaktperson</label>
            <input className={felt} value={form.clientContactName} onChange={set("clientContactName")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">E-post</label>
            <input className={felt} value={form.clientContactEmail} onChange={set("clientContactEmail")} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Telefon</label>
            <input className={felt} value={form.clientContactPhone} onChange={set("clientContactPhone")} />
          </div>
        </div>
      </section>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={submit}
          disabled={saving || !form.projectNumber || !form.name}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Oppretter…" : "Opprett prosjekt"}
        </button>
        <button
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Avbryt
        </button>
      </div>
    </div>
  );
}
