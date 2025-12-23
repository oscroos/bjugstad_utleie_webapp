import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ActivityTable from "./ActivityTable";

export const revalidate = 0;

type LoginEvent = {
  id: string;
  provider: string | null;
  loggedAt: string;
  user: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    role: string | null;
  } | null;
};

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
            Du trenger administratorrettigheter for å se innloggingsaktivitet.
          </p>
        </section>
      </main>
    );
  }

  const events = await fetchLoginEvents();

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
        <ActivityTable events={events} />
      </section>
    </main>
  );
}

async function fetchLoginEvents(): Promise<LoginEvent[]> {
  const cookieHeader = cookies().toString();
  const baseUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/login-events`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("Failed to load login events from API", response.status, errorText);
    throw new Error("Kunne ikke hente innloggingsaktivitet");
  }

  const payload = (await response.json()) as { events?: LoginEvent[] };
  return payload.events ?? [];
}
