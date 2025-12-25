import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import CustomersTable from "./CustomersTable";

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
            Du trenger administratorrettigheter for å se kundelisten.
          </p>
        </section>
      </main>
    );
  }

  const customers = await fetchCustomers();

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
        <CustomersTable customers={customers} />
      </section>
    </main>
  );
}

async function fetchCustomers(): Promise<Customer[]> {
  const apiKey =
    process.env.BJUGSTAD_API_KEY_PRIMARY?.trim() ||
    process.env.BJUGSTAD_API_KEY_SECONDARY?.trim();
  const baseUrl = process.env.BJUGSTAD_API_BASEURL?.trim();

  if (!apiKey) {
    throw new Error("Mangler API-nøkkel for Bjugstad API (BJUGSTAD_API_KEY_PRIMARY/SECONDARY).");
  }

  if (!baseUrl) {
    throw new Error("Mangler Bjugstad API base-URL (BJUGSTAD_API_BASEURL).");
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
    throw new Error("Kunne ikke hente kunder fra Bjugstad API");
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    console.error("Unexpected GetCustomers response", data);
    throw new Error("Uventet format fra Bjugstad API");
  }

  return data as Customer[];
}
