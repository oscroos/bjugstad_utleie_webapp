import { notFound } from "next/navigation";
import ErrorPanel from "@/components/ErrorPanel";
import { requireProjectRole } from "@/lib/access";
import { getProjectWorkspace } from "@/lib/projects";
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
    const project = await getProjectWorkspace(projectId);
    if (!project) notFound();

    return (
      <ProjectWorkspaceClient
        project={project}
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
