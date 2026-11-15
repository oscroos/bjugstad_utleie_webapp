import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ErrorPanel from "@/components/ErrorPanel";
import { standardButtonClass } from "@/lib/buttonStyles";
import { auth } from "@/lib/auth";
import { LAST_PROJECT_COOKIE } from "@/lib/constants";
import { listProjectCustomersForUser, listProjectsForUser, type ProjectListItem } from "@/lib/projects";

// The Prosjekter tab has no list view: it sends the user straight to a project.
// Preference order: the project they opened last (cookie), otherwise the first
// project in the dropdown.
export default async function ProsjekterPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  let projects: ProjectListItem[];
  let canCreateProject: boolean;
  try {
    const [projectList, customers] = await Promise.all([
      listProjectsForUser(session.user.id, session.user.role),
      listProjectCustomersForUser(session.user.id, session.user.role),
    ]);
    projects = projectList;
    canCreateProject = customers.length > 0;
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

  const target = await pickDefaultProject(projects);
  if (target) {
    redirect(`/prosjekter/${target.id}`);
  }

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

      <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        {canCreateProject ? (
          <>
            <h2 className="text-xl font-semibold text-slate-900">Ingen prosjekter ennå</h2>
            <p className="mt-2 text-sm text-slate-600">
              Opprett første prosjekt for å fylle inn prosjektinfo og kontraktsmål.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-slate-900">Ingen prosjekter tilgjengelig</h2>
            <p className="mt-2 text-sm text-slate-600">
              Du har ikke tilgang til noen prosjekter ennå. Kontakt selskapsadministratoren din for å få tilgang.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

async function pickDefaultProject(projects: ProjectListItem[]) {
  if (projects.length === 0) return null;

  const cookieStore = await cookies();
  const lastProjectId = cookieStore.get(LAST_PROJECT_COOKIE)?.value;
  if (lastProjectId) {
    const remembered = projects.find((project) => project.id === lastProjectId);
    if (remembered) return remembered;
  }

  return projects[0];
}
