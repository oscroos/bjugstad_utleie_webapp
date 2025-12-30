import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AddUserDialog from "./AddUserDialog";
import UsersTable from "./UsersTable";

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
            Du trenger administratorrettigheter for å se brukerlisten.
          </p>
        </section>
      </main>
    );
  }

  const users = await fetchUsers();

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
        <UsersTable users={users} />
      </section>
    </main>
  );
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
    throw new Error("Kunne ikke hente brukere");
  }

  const payload = (await response.json()) as { users?: any[] };
  return payload.users ?? [];
}
