import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RapportUtfylling from "@/components/rapportering/RapportUtfylling";

export default async function RapportSide({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/login");

  const { id } = await params;
  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      requirement: { select: { title: true, source: true, legalReference: true } },
      project: { select: { id: true, name: true, projectNumber: true, organizationId: true } },
    },
  });
  if (!report || report.project.organizationId !== session.user.organizationId) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href={`/rapportering/${report.project.id}`}
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Tilbake til rapportering
      </Link>
      <div className="mb-6 mt-2 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{report.title}</h1>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
          {report.status}
        </span>
      </div>

      {/* content castes til plain objekt for klientkomponenten */}
      <RapportUtfylling
        report={{
          id: report.id,
          title: report.title,
          status: report.status,
          content: report.content as never,
          generatedBody: report.generatedBody,
          requirement: report.requirement,
        }}
      />
    </div>
  );
}
