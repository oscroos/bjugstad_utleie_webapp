import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectAccess } from "@/lib/prosjekter/queries";
import AiAnalyseKnapp from "@/components/rapportering/AiAnalyseKnapp";
import KravListe from "@/components/rapportering/KravListe";
import NsStandardManager from "@/components/rapportering/NsStandardManager";
import KontraktDokumentImport from "@/components/rapportering/KontraktDokumentImport";
import ForfallsVarsler from "@/components/rapportering/ForfallsVarsler";

export default async function RapporteringArbeidsflate({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/login");

  const { projectId } = await params;
  const project = await assertProjectAccess(projectId, session.user.organizationId);
  if (!project) notFound();

  const [requirements, nsStandards, contractDocs, reports] = await Promise.all([
    prisma.reportingRequirement.findMany({
      where: { projectId, status: { not: "DISMISSED" } },
      include: { dataFields: true },
      orderBy: [{ source: "asc" }, { createdAt: "asc" }],
    }),
    prisma.projectNsStandard.findMany({ where: { projectId }, orderBy: { standardNo: "asc" } }),
    prisma.projectContractDocument.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
    prisma.report.findMany({
      where: { projectId },
      select: { id: true, title: true, status: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const grouped = {
    LAW: requirements.filter((r) => r.source === "LAW"),
    NS_STANDARD: requirements.filter((r) => r.source === "NS_STANDARD"),
    CONTRACT: requirements.filter((r) => r.source === "CONTRACT"),
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link href={`/prosjekter/${projectId}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← {project.projectNumber} {project.name}
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold text-slate-900">Rapportering</h1>
      <p className="text-sm text-slate-500">
        Kartlegg og styr alt som skal rapporteres på dette prosjektet.
      </p>

      {/* Grunnlag AI bruker */}
      <div className="mt-8 space-y-8">
        <section>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">NS-standarder</h2>
          <p className="mb-3 text-sm text-slate-500">Legg inn standardene som gjelder for prosjektet.</p>
          <NsStandardManager projectId={projectId} initial={nsStandards} />
        </section>

        <section>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Kontraktdokumenter</h2>
          <p className="mb-3 text-sm text-slate-500">
            Dra inn dokumentene AI skal lese for kontraktspesifikke rapporteringskrav.
          </p>
          <KontraktDokumentImport projectId={projectId} initial={contractDocs} />
        </section>

        {/* Forfallsvarsler basert på intervaller */}
        <ForfallsVarsler projectId={projectId} />

        {/* AI-analyse */}
        <AiAnalyseKnapp projectId={projectId} />

        {/* Resultat: krav gruppert på tre kilder */}
        <KravListe initial={grouped} />

        {/* Opprettede rapporter */}
        {reports.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Rapporter</h2>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/rapportering/rapporter/${r.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
                  >
                    <span className="text-sm text-slate-800">{r.title}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                      {r.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
