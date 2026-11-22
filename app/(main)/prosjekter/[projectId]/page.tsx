import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import ErrorPanel from "@/components/ErrorPanel";
import { requireAuthenticatedUser, requireProjectRole } from "@/lib/access";
import { LAST_PROJECT_COOKIE } from "@/lib/constants";
import { getMachinePositionsByIds } from "@/lib/machines";
import {
  getProjectWorkspace,
  listProjectCustomersForUser,
  listProjectMachines,
  listProjectsForUser,
  type ProjectMachinesResult,
  type ProjectWorkspace,
} from "@/lib/projects";
import ProjectWorkspaceClient, { type MapCenter } from "./ProjectWorkspaceClient";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProsjektSide({ params }: PageProps) {
  const { projectId } = await params;
  const session = await requireAuthenticatedUser();
  if (!session) redirect("/login");

  const userId = session.user.id;
  const role = session.user.role;

  // The access check and the data queries run in parallel. Nothing is rendered
  // before access is confirmed below.
  let loaded:
    | {
        access: Awaited<ReturnType<typeof requireProjectRole>>;
        project: ProjectWorkspace | null;
        projects: Awaited<ReturnType<typeof listProjectsForUser>>;
        canCreateProject: boolean;
      }
    | { error: unknown };
  try {
    const [access, project, projects, customers] = await Promise.all([
      requireProjectRole(projectId, "VIEWER"),
      getProjectWorkspace(projectId),
      listProjectsForUser(userId, role),
      listProjectCustomersForUser(userId, role),
    ]);
    loaded = { access, project, projects, canCreateProject: customers.length > 0 };
  } catch (error) {
    loaded = { error };
  }

  if ("error" in loaded) {
    return (
      <main className="p-8">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ErrorPanel withSidebar title="Kunne ikke laste prosjekt" error={loaded.error} />
        </section>
      </main>
    );
  }

  const { access, project, projects, canCreateProject } = loaded;

  if (!access || !project) {
    // A remembered project the user can no longer open: fall back to the default
    // project instead of showing a 404 when they click the Prosjekter tab.
    const cookieStore = await cookies();
    if (cookieStore.get(LAST_PROJECT_COOKIE)?.value === projectId) {
      redirect("/prosjekter?nullstill=1");
    }
    notFound();
  }

  // The rental lookup goes to the Bjugstad API and is the slowest part of the page,
  // so it is streamed: the client renders immediately and suspends only where the
  // machines (or the map's fallback centre) are needed.
  const machinesPromise = listProjectMachines(
    { customerId: project.customerId, projectNumber: project.projectNumber },
    role,
  );
  const mapFallbackCenterPromise: Promise<MapCenter | null> =
    project.zones.length === 0
      ? machinesPromise.then((result) => resolveMapFallbackCenter(result.machines))
      : Promise.resolve(null);

  return (
    <ProjectWorkspaceClient
      project={project}
      projects={projects}
      machinesPromise={machinesPromise}
      mapFallbackCenterPromise={mapFallbackCenterPromise}
      viewer={{ id: userId, role }}
      canCreateProject={canCreateProject}
      canEdit={access.role === "OWNER" || access.role === "PROJECT_MANAGER"}
    />
  );
}

// With no zones to frame, start the site map on the project's active machines.
async function resolveMapFallbackCenter(
  machines: ProjectMachinesResult["machines"],
): Promise<MapCenter | null> {
  const ids = machines
    .filter((entry) => entry.isActive && entry.machine.id)
    .map((entry) => String(entry.machine.id));
  if (!ids.length) return null;
  try {
    const positions = await getMachinePositionsByIds(ids);
    if (!positions.length) return null;
    return {
      lat: positions.reduce((sum, position) => sum + position.lat, 0) / positions.length,
      lng: positions.reduce((sum, position) => sum + position.lng, 0) / positions.length,
    };
  } catch (error) {
    console.error("Failed to resolve map fallback centre", error);
    return null;
  }
}
