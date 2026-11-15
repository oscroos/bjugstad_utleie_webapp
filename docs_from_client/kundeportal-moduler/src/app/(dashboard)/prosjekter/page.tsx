import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listProjectsForOrg } from "@/lib/prosjekter/queries";

const STATUS_TEKST: Record<string, string> = {
  PLANNING: "Planlegging",
  ACTIVE: "Aktiv",
  ON_HOLD: "På vent",
  COMPLETED: "Ferdigstilt",
  ARCHIVED: "Arkivert",
};

export default async function ProsjekterSide() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/login");

  const projects = await listProjectsForOrg(session.user.organizationId);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Prosjekter</h1>
          <p className="text-sm text-slate-500">
            Prosjekter som rapportering og andre moduler knyttes til.
          </p>
        </div>
        <Link
          href="/prosjekter/ny"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Nytt prosjekt
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <p className="text-slate-600">Ingen prosjekter ennå.</p>
          <Link href="/prosjekter/ny" className="mt-2 inline-block text-sm font-medium text-slate-900 underline">
            Opprett ditt første prosjekt
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/prosjekter/${p.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50">
                <div>
                  <p className="font-medium text-slate-900">
                    <span className="text-slate-400">{p.projectNumber}</span> · {p.name}
                  </p>
                  {p.city && <p className="text-sm text-slate-500">{p.city}</p>}
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  {STATUS_TEKST[p.status] ?? p.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
