import { notFound } from "next/navigation";
import ErrorPanel from "@/components/ErrorPanel";
import { requireProjectRole } from "@/lib/access";
import { getMachinePositionsByIds } from "@/lib/machines";
import {
  getProjectWorkspace,
  listProjectCustomersForUser,
  listProjectMachines,
  listProjectsForUser,
  type ProjectMachinesResult,
} from "@/lib/projects";
import ProjectWorkspaceClient from "./ProjectWorkspaceClient";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProsjektSide({ params }: PageProps) {
  const { projectId } = await params;
  const access = await requireProjectRole(projectId, "VIEWER");

  if (!access) {
    notFound();
  }

  try {
    const { id: userId, role } = access.session.user;
    const [project, projects, customers] = await Promise.all([
      getProjectWorkspace(projectId),
      listProjectsForUser(userId, role),
      listProjectCustomersForUser(userId, role),
    ]);
    if (!project) notFound();

    const machines = await listProjectMachines(
      { customerId: project.customerId, projectNumber: project.projectNumber },
      userId,
      role,
    );
    const mapFallbackCenter = project.zones.length === 0 ? await resolveMapFallbackCenter(machines.machines) : null;

    return (
      <ProjectWorkspaceClient
        project={project}
        projects={projects}
        machines={machines}
        mapFallbackCenter={mapFallbackCenter}
        viewer={{ id: userId, role }}
        canCreateProject={customers.length > 0}
        canEdit={access.role === "OWNER" || access.role === "PROJECT_MANAGER"}
      />
    );
  } catch (error) {
    return (
      <main className="p-8">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ErrorPanel
            withSidebar
            title="Kunne ikke laste prosjekt"
            error={error}
          />
        </section>
      </main>
    );
  }
}

// With no zones to frame, start the site map on the project's active machines.
async function resolveMapFallbackCenter(machines: ProjectMachinesResult["machines"]) {
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
