import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import ActivityTable from "./ActivityTable";
import ErrorPanel from "@/components/ErrorPanel";
import { loadLoginEventsForAdmin } from "@/lib/login-events";

export default async function AktivitetPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const isAdmin = session.user?.role === "super_admin";

  if (!isAdmin) {
    return (
      <main className="p-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Begrenset tilgang</h1>
          <p className="mt-3 text-slate-600">
            Du trenger administratorrettigheter for a se innloggingsaktivitet.
          </p>
        </section>
      </main>
    );
  }

  const { events, error } = await loadLoginEventsForAdmin();

  if (error) {
    return (
      <main className="p-8">
        <ErrorPanel
          withSidebar
          title="Kunne ikke hente innloggingsaktivitet"
          error={error}
        />
      </main>
    );
  }

  const safeEvents = events ?? [];

  return (
    <main className="p-8 space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Aktivitet</h1>
          <p className="mt-2 text-slate-600">
            Oversikt over de siste innloggingene i portalen.
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ActivityTable events={safeEvents} />
      </section>
    </main>
  );
}
