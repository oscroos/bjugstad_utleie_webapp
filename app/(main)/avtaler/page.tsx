import { Suspense, cache } from "react";
import { redirect } from "next/navigation";
import AgreementsTable, { type AgreementRow } from "./AgreementsTable";
import { auth } from "@/lib/auth";
import ErrorPanel from "@/components/ErrorPanel";
import { loadAgreementsForUser, type AgreementPayload } from "@/lib/agreements";

type Viewer = { id?: string | null; role?: string | null };

const getAgreementRowsForUser = cache(async (userId: string, role?: string | null) => {
  const { active: activePayloads, historical: historicalPayloads, error } =
    await loadAgreementsForUser(userId, role);

  return {
    active: activePayloads.map(mapAgreement),
    historical: historicalPayloads.map(mapAgreement),
    error,
  };
});

export default async function AvtalerPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const viewer: Viewer = { id: session.user?.id, role: session.user?.role };

  return (
    <main className="p-8 space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Avtaler</h1>
          <p className="mt-2 text-slate-600">
            Oversikt over avtaler. Tabellen viser aktive avtaler og historikk med samme oppsett som andre oversikter.
          </p>
        </div>
      </header>

      <section className="space-y-10">
        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Aktive avtaler</h2>
            <p className="mt-1 text-sm text-slate-600">
              Avtaler som er i drift akkurat nå.
            </p>
          </div>
          <Suspense fallback={<AgreementsSectionLoading label="Laster aktive avtaler..." />}>
            <AgreementsSection
              userId={session.user.id}
              role={session.user.role}
              viewer={viewer}
              kind="active"
            />
          </Suspense>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Avtalehistorikk</h2>
            <p className="mt-1 text-sm text-slate-600">
              Tidligere avtaler som ikke lenger er aktive.
            </p>
          </div>
          <Suspense fallback={<AgreementsSectionLoading label="Laster avtalehistorikk..." />}>
            <AgreementsSection
              userId={session.user.id}
              role={session.user.role}
              viewer={viewer}
              kind="historical"
            />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

async function AgreementsSection({
  userId,
  role,
  viewer,
  kind,
}: {
  userId: string;
  role?: string | null;
  viewer: Viewer;
  kind: "active" | "historical";
}) {
  const { active, historical, error } = await getAgreementRowsForUser(userId, role);

  if (error) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ErrorPanel
          withSidebar
          title="Kunne ikke hente avtaler"
          error={error}
        />
      </section>
    );
  }

  const agreements = kind === "active" ? active : historical;
  const emptyMessage =
    kind === "active"
      ? "Ingen aktive avtaler enda."
      : "Ingen historiske avtaler enda.";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <AgreementsTable
        agreements={agreements}
        emptyMessage={emptyMessage}
        viewer={viewer}
      />
    </section>
  );
}

function AgreementsSectionLoading({ label }: { label: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4 text-sm text-slate-600">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
        {label}
      </div>
      <div className="space-y-3 p-4">
        <div className="h-12 rounded-xl bg-slate-100" />
        <div className="h-12 rounded-xl bg-slate-100" />
        <div className="h-12 rounded-xl bg-slate-100" />
        <div className="h-12 rounded-xl bg-slate-100" />
      </div>
    </section>
  );
}

function mapAgreement(payload: AgreementPayload): AgreementRow {
  return {
    id: payload.id,
    customer: payload.customerId || payload.customerName
      ? {
          id: payload.customerId,
          name: payload.customerName ?? undefined,
        }
      : undefined,
    startDate: payload.startDate ?? null,
    endDate: payload.endDate ?? null,
    comment: payload.comment ?? null,
    projectNumber: payload.projectNumber ?? null,
    contactPersonName: payload.contactPersonName ?? null,
    contactPersonTelephoneNumber: payload.contactPersonTelephoneNumber ?? null,
    contactPersonEmail: payload.contactPersonEmail ?? null,
    customerContactPersonId: payload.customerContactPersonId ?? null,
    customerContactPersonName: payload.customerContactPersonName ?? null,
    customerContactPersonTelephoneNumber: payload.customerContactPersonTelephoneNumber ?? null,
    customerContactPersonEmail: payload.customerContactPersonEmail ?? null,
    insuranceIncluded: payload.insuranceIncluded ?? null,
    contractPrice: payload.contractPrice ?? null,
    location: payload.location ?? null,
    createdBy: payload.createdBy ?? null,
    createdByTelephoneNumber: payload.createdByTelephoneNumber ?? null,
    machines:
      payload.machines?.map((machine) => ({
        id: machine.id,
        name: machine.name ?? undefined,
        make: machine.make ?? undefined,
      })) ?? [],
  };
}
