import Link from "next/link";
import { redirect } from "next/navigation";
import ErrorPanel from "@/components/ErrorPanel";
import { standardButtonClass } from "@/lib/buttonStyles";
import { auth } from "@/lib/auth";
import { listProjectCustomersForUser, listProjectsForUser } from "@/lib/projects";
import ProjectsListClient from "./ProjectsListClient";

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

        <ProjectsListClient projects={projects} canCreateProject={canCreateProject} />
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
