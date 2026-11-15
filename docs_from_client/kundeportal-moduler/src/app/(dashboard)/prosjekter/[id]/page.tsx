import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProjectDetail } from "@/lib/prosjekter/queries";
import DeltakerListe from "@/components/prosjekt/DeltakerListe";
import UnderentreprenorSok from "@/components/prosjekt/UnderentreprenorSok";

export default async function ProsjektDetaljSide({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/login");

  const { id } = await params;
  const project = await getProjectDetail(id, session.user.organizationId);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/prosjekter" className="text-sm text-slate-500 hover:text-slate-900">
        ← Prosjekter
      </Link>

      <div className="mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
          <p className="text-sm text-slate-500">Prosjektnr. {project.projectNumber}</p>
        </div>
        <Link
          href={`/rapportering/${project.id}`}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Åpne rapportering →
        </Link>
      </div>

      {/* Nøkkelinfo */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InfoKort tittel="Adresse">
          {project.addressLine || project.city ? (
            <>
              {project.addressLine && <p>{project.addressLine}</p>}
              <p>{[project.postalCode, project.city].filter(Boolean).join(" ")}</p>
            </>
          ) : (
            <p className="text-slate-400">Ikke registrert</p>
          )}
        </InfoKort>
        <InfoKort tittel="Byggherre">
          {project.clientName ? (
            <>
              <p>{project.clientName}</p>
              {project.clientContactName && <p className="text-slate-500">{project.clientContactName}</p>}
              {project.clientContactEmail && <p className="text-slate-500">{project.clientContactEmail}</p>}
            </>
          ) : (
            <p className="text-slate-400">Ikke registrert</p>
          )}
        </InfoKort>
      </div>

      {/* Deltakere */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Deltakere</h2>
        <DeltakerListe projectId={project.id} initial={project.participants} />
      </section>

      {/* Underentreprenører */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Underentreprenører</h2>
        <UnderentreprenorSok projectId={project.id} initial={project.subcontractors} />
      </section>
    </div>
  );
}

function InfoKort({ tittel, children }: { tittel: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{tittel}</p>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}
