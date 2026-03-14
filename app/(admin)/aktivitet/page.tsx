import { Suspense } from "react";
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

      <Suspense fallback={<ActivitySectionLoading />}>
        <ActivitySection />
      </Suspense>
    </main>
  );
}

async function ActivitySection() {
  const { events, error } = await loadLoginEventsForAdmin();

  if (error) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ErrorPanel
          withSidebar
          title="Kunne ikke hente innloggingsaktivitet"
          error={error}
        />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <ActivityTable events={events} />
    </section>
  );
}

function ActivitySectionLoading() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4 text-sm text-slate-600">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
        Laster aktivitet...
      </div>
      <div className="space-y-3 p-4">
        <div className="h-12 rounded-xl bg-slate-100" />
        <div className="h-12 rounded-xl bg-slate-100" />
        <div className="h-12 rounded-xl bg-slate-100" />
        <div className="h-12 rounded-xl bg-slate-100" />
        <div className="h-12 rounded-xl bg-slate-100" />
      </div>
    </section>
  );
}
