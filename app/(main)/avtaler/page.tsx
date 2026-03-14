import { redirect } from "next/navigation";
import AgreementsTable from "./AgreementsTable";
import { auth } from "@/lib/auth";
import ErrorPanel from "@/components/ErrorPanel";
import { loadAgreementsForUser } from "@/lib/agreements";

export default async function AvtalerPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const viewer = { id: session.user?.id, role: session.user?.role };
  const { active, historical, error } = await loadAgreementsForUser(
    session.user.id,
    session.user.role,
  );

  if (error) {
    return (
      <main className="p-8">
        <ErrorPanel
          withSidebar
          title="Kunne ikke hente avtaler"
          error={error}
        />
      </main>
    );
  }

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
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <AgreementsTable
              agreements={active}
              emptyMessage="Ingen aktive avtaler enda."
              viewer={viewer}
            />
          </section>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Avtalehistorikk</h2>
            <p className="mt-1 text-sm text-slate-600">
              Tidligere avtaler som ikke lenger er aktive.
            </p>
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <AgreementsTable
              agreements={historical}
              emptyMessage="Ingen historiske avtaler enda."
              viewer={viewer}
            />
          </section>
        </div>
      </section>
    </main>
  );
}
