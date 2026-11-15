"use client";

import { useEffect, useState } from "react";

interface Participant {
  id: string;
  role: string;
  user: { id: string; name: string | null; email: string };
}
interface OrgUser {
  id: string;
  name: string | null;
  email: string;
}

const ROLLER: Record<string, string> = {
  OWNER: "Eier",
  PROJECT_MANAGER: "Prosjektleder",
  MEMBER: "Deltaker",
  VIEWER: "Lesetilgang",
};

export default function DeltakerListe({
  projectId,
  initial,
}: {
  projectId: string;
  initial: Participant[];
}) {
  const [participants, setParticipants] = useState<Participant[]>(initial);
  const [available, setAvailable] = useState<OrgUser[]>([]);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("MEMBER");

  async function lastLedige() {
    const r = await fetch(`/api/prosjekter/${projectId}/deltakere?ledige=1`);
    const d = await r.json();
    setAvailable(d.users ?? []);
  }
  useEffect(() => {
    lastLedige();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function leggTil() {
    if (!userId) return;
    const r = await fetch(`/api/prosjekter/${projectId}/deltakere`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    if (r.ok) {
      const { participant } = await r.json();
      setParticipants((p) => [...p, participant]);
      setUserId("");
      lastLedige();
    }
  }

  async function fjern(uid: string) {
    const r = await fetch(`/api/prosjekter/${projectId}/deltakere?userId=${uid}`, {
      method: "DELETE",
    });
    if (r.ok) {
      setParticipants((p) => p.filter((x) => x.user.id !== uid));
      lastLedige();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-4">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-slate-700">Bruker i din organisasjon</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Velg bruker…</option>
            {available.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Rolle</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {Object.entries(ROLLER).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={leggTil}
          disabled={!userId}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Legg til
        </button>
      </div>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {participants.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">{p.user.name ?? p.user.email}</p>
              <p className="text-xs text-slate-500">{p.user.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                {ROLLER[p.role] ?? p.role}
              </span>
              {p.role !== "OWNER" && (
                <button onClick={() => fjern(p.user.id)} className="text-sm text-red-600 hover:underline">
                  Fjern
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
