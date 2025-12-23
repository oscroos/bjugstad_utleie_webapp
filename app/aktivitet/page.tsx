import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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
        <div className="overflow-x-auto overflow-y-hidden rounded-t-2xl">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 rounded-tl-2xl">Bruker</th>
                <th className="px-4 py-3 min-w-[11rem] whitespace-nowrap">Telefon</th>
                <th className="px-4 py-3">E-post</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3 rounded-tr-2xl">Tidspunkt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {events.map((event) => {
                const formattedDate = formatDate(event.loggedAt);
                const name = event.user?.name ?? "Ukjent navn";
                const userId = event.user?.id ?? "Ingen bruker-ID";

                return (
                  <tr key={event.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{name}</div>
                      <div className="text-xs text-slate-500">{userId}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 min-w-[11rem] whitespace-nowrap">
                      {formatPhone(event.user?.phone)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {event.user?.email ?? <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {event.provider ?? <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {formattedDate ? (
                        <span className="whitespace-pre-line">{formattedDate}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Ingen innloggingsaktivitet funnet.
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

function formatPhone(raw?: string | null) {
  if (!raw) return "-";
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
