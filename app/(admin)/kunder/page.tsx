import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import CustomersTable from "./CustomersTable";
import ErrorPanel from "@/components/ErrorPanel";
import { normalizeError, type AppError } from "@/lib/errors";

export const revalidate = 0;

type Customer = {
  customerId: number;
  name?: string;
  email?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  contact?: string;
  telephoneNumber?: string;
  organizationNumber?: string;
  customerNumber?: number;
};

export default async function KunderPage() {
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
            Du trenger administratorrettigheter for a se kundelisten.
          </p>
        </section>
      </main>
    );
  }

  const { customers, error } = await loadCustomers();

  if (error) {
    return (
      <main className="p-8">
        <ErrorPanel
          withSidebar
          title="Kunne ikke hente kunder"
          error={error}
        />
      </main>
    );
  }

  const safeCustomers = customers ?? [];

  return (
    <main className="p-8 space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Kundeoversikt</h1>
          <p className="mt-2 text-slate-600">
            Oversikt over all kundedata, hentet fra Bjugstad API.
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CustomersTable customers={safeCustomers} />
      </section>
    </main>
  );
}

async function loadCustomers(): Promise<{ customers: Customer[] | null; error: AppError | null }> {
  try {
    const customers = await fetchCustomers();
    return { customers, error: null };
  } catch (error) {
    return {
      customers: null,
      error: normalizeError(error, {
        title: "Kunne ikke hente kunder",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Vi kunne ikke hente kundelisten. Prøv igjen litt senere.",
      }),
    };
  }
}

async function fetchCustomers(): Promise<Customer[]> {
  const apiKey =
    process.env.BJUGSTAD_API_KEY_PRIMARY?.trim() ||
    process.env.BJUGSTAD_API_KEY_SECONDARY?.trim();
  const baseUrl = process.env.BJUGSTAD_API_BASEURL?.trim();

  if (!apiKey) {
    throw {
      code: "CONFIG_MISSING",
      title: "Mangler API-nokkel",
      message: "Legg til BJUGSTAD_API_KEY_PRIMARY eller BJUGSTAD_API_KEY_SECONDARY for a hente kunder.",
      details: { missing: ["BJUGSTAD_API_KEY_PRIMARY", "BJUGSTAD_API_KEY_SECONDARY"] },
    } satisfies AppError;
  }

  if (!baseUrl) {
    throw {
      code: "CONFIG_MISSING",
      title: "Mangler API-baseadresse",
      message: "Sett BJUGSTAD_API_BASEURL for a hente kunder.",
      details: { missing: ["BJUGSTAD_API_BASEURL"] },
    } satisfies AppError;
  }

  const url = `${baseUrl.replace(/\/$/, "")}/GetCustomers`;

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Ocp-Apim-Subscription-Key": apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("Failed to load customers from Bjugstad API", response.status, errorText);
    throw {
      code: response.status === 401 || response.status === 403 ? "API_AUTH" : "API_HTTP",
      title: "Kunne ikke hente kunder",
      message: "Bjugstad API svarte med en feil. Prøv igjen.",
      details: { status: response.status, statusText: response.statusText, body: errorText || undefined, url },
    } satisfies AppError;
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    console.error("Unexpected GetCustomers response", data);
    throw {
      code: "API_RESPONSE",
      title: "Uventet svar fra Bjugstad API",
      message: "Kundetjenesten returnerte et uventet format.",
      details: { url, body: data },
    } satisfies AppError;
  }

  return data as Customer[];
}
