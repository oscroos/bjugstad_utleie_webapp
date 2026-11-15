import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MiljoDashboard from "@/components/miljo/MiljoDashboard";

export default async function MiljoProsjektSide({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/login");
  const { projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: session.user.organizationId },
    select: { id: true, projectNumber: true, name: true, city: true },
  });
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link href={`/prosjekter/${projectId}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← {project.projectNumber} {project.name}
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold text-slate-900">CO2-/miljøregnskap</h1>
      <p className="mb-6 text-sm text-slate-500">Utslipp for prosjektet, sted og selskap – per eierskap.</p>
      <MiljoDashboard projectId={project.id} city={project.city ?? undefined} />
    </div>
  );
}
