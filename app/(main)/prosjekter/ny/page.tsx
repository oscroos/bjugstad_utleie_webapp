import Link from "next/link";
import { redirect } from "next/navigation";
import ErrorPanel from "@/components/ErrorPanel";
import { auth } from "@/lib/auth";
import {
  getActiveProjectSetupCatalog,
  listProjectCustomersForUser,
} from "@/lib/projects";
import ProjectSetupForm from "../ProjectSetupForm";

export default async function NyttProsjektPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  try {
    const [customers, catalog] = await Promise.all([
      listProjectCustomersForUser(session.user.id, session.user.role),
      getActiveProjectSetupCatalog(),
    ]);

    if (!customers.length) {
      return (
        <main className="space-y-6 p-8">
          <Link href="/prosjekter" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
            Tilbake til prosjekter
          </Link>
          <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-900">Ingen prosjektrettigheter</h1>
            <p className="mt-2 text-sm text-slate-600">
              Du må være selskapsadmin eller portaladmin for å opprette prosjekter.
            </p>
          </section>
        </main>
      );
    }

    return (
      <main className="space-y-6 p-8">
        <header className="space-y-2">
          <Link href="/prosjekter" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
            Tilbake til prosjekter
          </Link>
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Nytt prosjekt</h1>
            <p className="mt-2 text-slate-600">
              Opprett prosjekt med aktive katalogfelt og massetyper.
            </p>
          </div>
        </header>

        <ProjectSetupForm
          mode="create"
          customers={customers}
          fieldDefinitions={catalog.fieldDefinitions}
          massTypes={catalog.massTypes}
        />
      </main>
    );
  } catch (error) {
    return (
      <main className="p-8">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ErrorPanel
            withSidebar
            title="Kunne ikke laste prosjektoppsett"
            error={error}
          />
        </section>
      </main>
    );
  }
}
