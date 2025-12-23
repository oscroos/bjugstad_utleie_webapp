import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AddUserDialog from "./AddUserDialog";

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
  console.log("Rendering user page with users:");
  console.log("Fetched users:", users);

  return (
    <main className="p-8 space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Brukeroversikt</h1>
          <p className="mt-2 text-slate-600">
            Oversikt over alle brukere i portalen. Inkluderer ikke registrerte kontaktpersoner hos kunder som ikke har logget inn.
          </p>
        </div>
        <AddUserDialog />
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto overflow-y-hidden rounded-t-2xl">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 rounded-tl-2xl">Navn</th>
                <th className="px-4 py-3">Rolle</th>
                <th className="px-4 py-3 min-w-[11rem] whitespace-nowrap">Telefon</th>
                <th className="px-4 py-3">E-post</th>
                <th className="px-4 py-3">Adresse</th>
                <th className="px-4 py-3">Selskap</th>
                <th className="px-4 py-3">Opprettet</th>
                <th className="px-4 py-3">Oppdatert</th>
                <th className="px-4 py-3">Vilkår</th>
                <th className="px-4 py-3 rounded-tr-2xl">Akseptert</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {users.map((user) => {
                const created = formatDate(user.createdAt);
                const updated = formatDate(user.updatedAt);
                const acceptedAt = formatDate(user.acceptedTermsAt);
                const addressLines = formatAddress({
                  street: user.address_street,
                  postalCode: user.address_postal_code,
                  region: user.address_region,
                });

                return (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{user.name ?? "—"}</div>
                      <div className="text-xs text-slate-500">{user.id}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatRole(user.role)}</td>

                    <td className="px-4 py-3 text-slate-700 min-w-[11rem] whitespace-nowrap">
                      {formatPhone(user.phone)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {user.email ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-700 min-w-[11rem] whitespace-nowrap">
                      {addressLines ? (
                        addressLines.map((line, index) => <div key={`${user.id}-address-${index}`}>{line}</div>)
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{"UNDER DEVELOPMENT"}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      <span className="whitespace-pre-line">{created ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      <span className="whitespace-pre-line">{updated ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${user.acceptedTerms
                          ? "bg-green-100 text-green-800"
                          : "bg-amber-100 text-amber-800"
                          }`}
                      >
                        {user.acceptedTerms ? "Ja" : "Nei"}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {acceptedAt ? (
                        <span className="whitespace-pre-line">{acceptedAt}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                    Ingen brukere funnet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

async function fetchUsers() {
  const cookieHeader = cookies().toString();
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

function formatPhone(raw?: string | null) {
  if (!raw) return "N/A";
  const compact = raw.replace(/\s+/g, "");
  if (!compact.startsWith("+") || compact.length <= 3) {
    return raw;
  }
  const country = compact.slice(0, 3);
  const rest = compact.slice(3);
  const groups = rest.match(/.{1,2}/g);
  const spaced = groups ? groups.join(" ") : rest;
  return `${country} ${spaced}`.trim();
}

function formatAddress({
  street,
  postalCode,
  region,
}: {
  street?: string | null;
  postalCode?: string | null;
  region?: string | null;
}): string[] | undefined {
  const lines: string[] = [];
  if (street) {
    lines.push(street);
  }

  const postalRegion = [postalCode, region]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");

  if (postalRegion) {
    lines.push(postalRegion);
  }

  return lines.length ? lines : undefined;
}

function formatDate(value?: Date | string | null) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${day}.${month}.${year}\nkl. ${hours}:${minutes}`;
}

function formatRole(role?: string | null) {
  if (!role) return "—";
  const labels: Record<string, string> = {
    super_admin: "Administrator",
    customer: "Kunde",
  };
  return labels[role] ?? role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
