import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AgreementsTable, { type AgreementRow } from "./AgreementsTable";
import { auth } from "@/lib/auth";
import ErrorPanel from "@/components/ErrorPanel";
import { normalizeError, type AppError } from "@/lib/errors";
import type { AgreementPayload } from "@/app/api/agreements/route";

export const revalidate = 0;

export default async function AvtalerPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const viewer = { id: session.user?.id, role: session.user?.role };
  const { active, historical, error, adminPlaceholderMessage } = await loadAgreements();

  if (error) {
    return (
      <main className="p-8">
        <ErrorPanel
          withSidebar
          title="Kunne ikke hente avtaler"
          error={error}
        />
      </main>
    );
  }

  return (
    <main className="p-8 space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Avtaler</h1>
          <p className="mt-2 text-slate-600">
            Oversikt over avtaler. Tabellen viser aktive avtaler og historikk med samme oppsett som andre oversikter.
          </p>
          {adminPlaceholderMessage && (
            <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {adminPlaceholderMessage}
            </p>
          )}
        </div>
      </header>

      <section className="space-y-10">
        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Aktive avtaler</h2>
            <p className="mt-1 text-sm text-slate-600">
              Avtaler som er i drift akkurat nå.
            </p>
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <AgreementsTable
              agreements={active}
              emptyMessage="Ingen aktive avtaler enda."
              viewer={viewer}
            />
          </section>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Avtalehistorikk</h2>
            <p className="mt-1 text-sm text-slate-600">
              Tidligere avtaler som ikke lenger er aktive.
            </p>
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <AgreementsTable
              agreements={historical}
              emptyMessage="Ingen historiske avtaler enda."
              viewer={viewer}
            />
          </section>
        </div>
      </section>
    </main>
  );
}

async function loadAgreements(): Promise<{
  active: AgreementRow[];
  historical: AgreementRow[];
  adminPlaceholderMessage?: string;
  error: AppError | null;
}> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const baseUrl = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

  try {
    const response = await fetch(`${baseUrl}/api/agreements`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        active: [],
        historical: [],
        error: normalizeError(
          new Error(`Failed to load agreements: ${response.status}`),
          {
            code: response.status === 401 || response.status === 403 ? "API_AUTH" : "API_HTTP",
            title: "Kunne ikke hente avtaler",
            message: errorText || "API-et svarte med en feil mens vi hentet avtaler.",
            details: { status: response.status, body: errorText || undefined },
          },
        ),
      };
    }

    const payload = (await response.json()) as {
      active?: AgreementPayload[];
      historical?: AgreementPayload[];
      placeholder?: boolean;
      message?: string;
    };

    const active = (payload.active ?? []).map(mapAgreement);
    const historical = (payload.historical ?? []).map(mapAgreement);

    return {
      active,
      historical,
      adminPlaceholderMessage: payload.placeholder ? (payload.message ?? "Avtaleoppslag for admin kommer senere.") : undefined,
      error: null,
    };
  } catch (error) {
    return {
      active: [],
      historical: [],
      error: normalizeError(error, {
        title: "Kunne ikke hente avtaler",
        message: error instanceof Error ? error.message : "Ukjent feil under lasting av avtaler.",
      }),
    };
  }
}

function mapAgreement(payload: AgreementPayload): AgreementRow {
  return {
    id: payload.id,
    customer: payload.customerId || payload.customerName
      ? {
        id: payload.customerId,
        name: payload.customerName ?? undefined,
      }
      : undefined,
    startDate: payload.startDate ?? null,
    endDate: payload.endDate ?? null,
    machines: payload.machines?.map((machine) => ({
      id: machine.id,
      name: machine.name ?? undefined,
    })) ?? [],
  };
}
