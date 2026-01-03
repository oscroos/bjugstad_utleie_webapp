import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AddUserDialog from "./AddUserDialog";
import UsersTable from "./UsersTable";
import ErrorPanel from "@/components/ErrorPanel";
import { normalizeError, type AppError } from "@/lib/errors";

export const revalidate = 0;

export default async function BrukerePage() {
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
            Du trenger administratorrettigheter for a se brukerlisten.
          </p>
        </section>
      </main>
    );
  }

  const { users, error } = await loadUsers();

  if (error) {
    return (
      <main className="p-8">
        <ErrorPanel
          withSidebar
          title="Kunne ikke hente brukere"
          error={error}
        />
      </main>
    );
  }

  const safeUsers = users ?? [];

  return (
    <main className="p-8 space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Brukeroversikt</h1>
          <p className="mt-2 text-slate-600">
            Oversikt over alle brukere i portalen, inkludert registrerte telefonnumre som enda ikke har logget inn.
          </p>
        </div>
        <AddUserDialog />
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <UsersTable users={safeUsers} />
      </section>
    </main>
  );
}

async function loadUsers(): Promise<{ users: any[] | null; error: AppError | null }> {
  try {
    const users = await fetchUsers();
    return { users, error: null };
  } catch (error) {
    return {
      users: null,
      error: normalizeError(error, {
        title: "Kunne ikke hente brukere",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Vi kunne ikke laste brukerlisten akkurat na. Prøv igjen.",
      }),
    };
  }
}

async function fetchUsers() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const baseUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/users`, {
    cache: "no-store",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("Failed to load users from API", response.status, errorText);
    throw {
      code: response.status === 401 || response.status === 403 ? "API_AUTH" : "API_HTTP",
      title: "Kunne ikke hente brukere",
      message: "API-et svarte med en feil mens vi hentet brukere.",
      details: { status: response.status, statusText: response.statusText, body: errorText || undefined },
    } satisfies AppError;
  }

  const payload = (await response.json()) as { users?: any[] };
  return payload.users ?? [];
}
