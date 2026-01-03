import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ActivityTable from "./ActivityTable";
import ErrorPanel from "@/components/ErrorPanel";
import { normalizeError, type AppError } from "@/lib/errors";

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
            Du trenger administratorrettigheter for a se innloggingsaktivitet.
          </p>
        </section>
      </main>
    );
  }

  const { events, error } = await loadLoginEvents();

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

async function loadLoginEvents(): Promise<{ events: LoginEvent[] | null; error: AppError | null }> {
  try {
    const events = await fetchLoginEvents();
    return { events, error: null };
  } catch (error) {
    return {
      events: null,
      error: normalizeError(error, {
        title: "Kunne ikke hente innloggingsaktivitet",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Vi klarte ikke hente innloggingsaktivitet akkurat na.",
      }),
    };
  }
}

async function fetchLoginEvents(): Promise<LoginEvent[]> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const baseUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/login-events`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("Failed to load login events from API", response.status, errorText);
    throw {
      code: response.status === 401 || response.status === 403 ? "API_AUTH" : "API_HTTP",
      title: "Kunne ikke hente innloggingsaktivitet",
      message: "API-et svarte med en feil mens vi hentet innloggingsaktivitet.",
      details: { status: response.status, statusText: response.statusText, body: errorText || undefined },
    } satisfies AppError;
  }

  const payload = (await response.json()) as { events?: LoginEvent[] };
  return payload.events ?? [];
}
