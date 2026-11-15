import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { assertProjectAccess } from "@/lib/prosjekter/queries";
import HmsModul from "@/components/hms/HmsModul";

export default async function HmsSide({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/login");
  const { projectId } = await params;
  const project = await assertProjectAccess(projectId, session.user.organizationId);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link href={`/prosjekter/${projectId}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← {project.projectNumber} {project.name}
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold text-slate-900">HMS</h1>
      <p className="mb-6 text-sm text-slate-500">RUH, avvik og vernerunder – mater SHA-rapportene automatisk.</p>
      <HmsModul projectId={projectId} />
    </div>
  );
}
