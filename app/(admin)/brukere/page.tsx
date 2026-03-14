import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AddUserDialog from "./AddUserDialog";
import UsersTable from "./UsersTable";
import ErrorPanel from "@/components/ErrorPanel";
import { loadUsersForAdmin } from "@/lib/users";

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

  const { users, error } = await loadUsersForAdmin();

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
