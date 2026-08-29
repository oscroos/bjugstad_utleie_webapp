import Link from "next/link";
import { redirect } from "next/navigation";
import ErrorPanel from "@/components/ErrorPanel";
import { standardButtonClass } from "@/lib/buttonStyles";
import { auth } from "@/lib/auth";
import { formatDate } from "@/lib/formatters";
import { listProjectCustomersForUser, listProjectsForUser } from "@/lib/projects";

const STATUS_LABELS: Record<string, string> = {
  PLANNING: "Planlegging",
  ACTIVE: "Aktiv",
  ON_HOLD: "På vent",
  COMPLETED: "Ferdigstilt",
  ARCHIVED: "Arkivert",
};

export default async function ProsjekterPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  try {
    const [projects, customers] = await Promise.all([
      listProjectsForUser(session.user.id, session.user.role),
      listProjectCustomersForUser(session.user.id, session.user.role),
    ]);
    const canCreateProject = customers.length > 0;

    return (
      <main className="space-y-6 p-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Prosjekter</h1>
            <p className="mt-2 text-slate-600">
              Prosjektgrunnlag som senere moduler kan knytte rapportering, dokumenter og masseplaner til.
            </p>
          </div>
          {canCreateProject ? (
            <Link href="/prosjekter/ny" className={standardButtonClass}>
              Nytt prosjekt
            </Link>
          ) : null}
        </header>

        {!canCreateProject ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Ingen prosjektrettigheter</h2>
            <p className="mt-2 text-sm text-slate-600">
              Du må være selskapsadmin eller portaladmin for å opprette prosjekter.
            </p>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {projects.length === 0 ? (
            <div className="p-10 text-center">
              <h2 className="text-xl font-semibold text-slate-900">Ingen prosjekter ennå</h2>
              {canCreateProject ? (
                <p className="mt-2 text-sm text-slate-600">
                  Opprett første prosjekt for å teste egendefinerte felt og masseoppsett.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Prosjekt</th>
                    <th className="px-4 py-3">Kunde</th>
                    <th className="px-4 py-3">Sted</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Oppdatert</th>
                    <th className="px-6 py-3 text-right">Oppsett</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {projects.map((project) => (
                    <tr key={project.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{project.name}</div>
                        <div className="text-xs text-slate-500">{project.projectNumber}</div>
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {project.customerName ?? `Kunde ${project.customerId}`}
                      </td>
                      <td className="px-4 py-4 text-slate-700">{project.city ?? "-"}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                          {STATUS_LABELS[project.status] ?? project.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {formatDate(project.updatedAt, { showTime: false }) ?? "-"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/prosjekter/${project.id}/oppsett`}
                          className="text-sm font-semibold text-blue-700 hover:text-blue-900"
                        >
                          Åpne
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    );
  } catch (error) {
    return (
      <main className="p-8">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ErrorPanel
            withSidebar
            title="Kunne ikke hente prosjekter"
            error={error}
          />
        </section>
      </main>
    );
  }
}
