import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  IconCalendar,
  IconHome,
  IconMail,
  IconPhone,
  IconUser,
} from "@tabler/icons-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type {
  CustomerAccessEntry,
  CustomerDetails,
} from "@/components/dialogs/CustomerAccessDialog";
import {
  formatDate,
  formatDisplay,
  formatPhone,
  formatUserAddress,
} from "@/lib/formatters";
import ProfileCompaniesSection from "./ProfileCompaniesSection";
import ProfileActions from "./ProfileActions";
import type { CompanyCardState } from "./profileTypes";

const GLOBAL_ADMIN_TEST_COMPANY_IDS = [2228, 1075] as const;
const ENABLE_GLOBAL_ADMIN_TEST_COMPANIES = true;

type SessionAccessEntry = {
  customerId?: number | string;
  role?: string | null;
  customer?: {
    name?: string | null;
    customer_number?: number | null;
  } | null;
};

type ProfileRowEntry = {
  key: string;
  icon: React.ReactNode;
  label: string;
  value: string;
};

export default async function ProfilPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const user = (session.user as Record<string, unknown>) ?? {};
  const createdLabel = formatDate(user.createdAt as string | Date | null | undefined) ?? "N/A";
  const formattedPhone = formatPhone(user.phone as string | null | undefined, "N/A");
  const formattedAddress = formatUserAddress({
    street: user.address_street as string | null | undefined,
    postalCode: user.address_postal_code as string | null | undefined,
    region: user.address_region as string | null | undefined,
  });

  const role = typeof user.role === "string" ? user.role : null;
  const isGlobalAdmin = role?.toLowerCase() === "super_admin";
  const userAccessesRaw = user.accesses;
  const sessionAccesses: SessionAccessEntry[] = Array.isArray(userAccessesRaw)
    ? (userAccessesRaw as SessionAccessEntry[])
    : [];

  const accessRoleByCustomer = new Map<number, SessionAccessEntry>();
  sessionAccesses.forEach((access) => {
    const id = normalizeCustomerId(access?.customerId);
    if (typeof id === "number") {
      accessRoleByCustomer.set(id, access);
    }
  });

  const shouldMockGlobalAdminCompanies =
    isGlobalAdmin && ENABLE_GLOBAL_ADMIN_TEST_COMPANIES;

  const accessibleCustomerIds = shouldMockGlobalAdminCompanies
    ? [...GLOBAL_ADMIN_TEST_COMPANY_IDS]
    : Array.from(accessRoleByCustomer.keys()).sort((a, b) => a - b);

  const showEmptyCompanyState = accessibleCustomerIds.length === 0;
  const shouldShowGlobalAdminMessage =
    showEmptyCompanyState && isGlobalAdmin && !shouldMockGlobalAdminCompanies;

  const profileHeaderName = formatDisplay(user.name as string | null | undefined, "Ukjent bruker");

  const profileRows: ProfileRowEntry[] = [
    {
      key: "name",
      icon: <IconUser className="h-5 w-5 text-slate-400" />,
      label: "Navn",
      value: formatDisplay(user.name as string | null | undefined, "N/A"),
    },
    {
      key: "phone",
      icon: <IconPhone className="h-5 w-5 text-slate-400" />,
      label: "Telefon",
      value: formattedPhone ?? "N/A",
    },
    {
      key: "email",
      icon: <IconMail className="h-5 w-5 text-slate-400" />,
      label: "E-post",
      value: formatDisplay(user.email as string | null | undefined, "N/A"),
    },
    {
      key: "address",
      icon: <IconHome className="h-5 w-5 text-slate-400" />,
      label: "Adresse",
      value: formattedAddress ?? "N/A",
    },
    {
      key: "created",
      icon: <IconCalendar className="h-5 w-5 text-slate-400" />,
      label: "Bruker opprettet",
      value: createdLabel ?? "N/A",
    },
  ];
  const profileRowPairs = chunkRows(profileRows);

  return (
    <main className="p-8 space-y-6">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Min profil</h1>
          <p className="mt-2 text-slate-600">
            Administrer dine personlige kontodetaljer og se informasjon knyttet til selskapet du representerer.
          </p>
        </div>
      </header>

      <section className="space-y-10">
        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Personprofil</h2>
            <p className="mt-1 text-sm text-slate-600">
              Dine kontaktdata og kontoopplysninger. Dette utgjør all persondata vi har lagret om deg.
            </p>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">{profileHeaderName}</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 md:hidden">
                <tbody className="divide-y divide-slate-100 bg-white text-sm">
                  {profileRows.map((row) => (
                    <ProfileRow key={row.key} icon={row.icon} label={row.label} value={row.value} />
                  ))}
                </tbody>
              </table>

              <table className="hidden min-w-full divide-y divide-slate-100 md:table">
                <tbody className="divide-y divide-slate-100 bg-white text-sm">
                  {profileRowPairs.map((pair) => (
                    <tr key={pair.map((row) => row.key).join("-")} className="bg-white transition">
                      {pair.map((row, index) => (
                        <ProfileRowCells
                          key={row.key}
                          icon={row.icon}
                          label={row.label}
                          value={row.value}
                          withDividerAfter={index === 0}
                        />
                      ))}
                      {pair.length === 1 && (
                        <>
                          <th className="px-6 py-4 text-sm font-semibold text-slate-600" />
                          <td className="px-6 py-4 text-sm text-slate-900" />
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ProfileActions />
          </section>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Selskapsprofil</h2>
            <p className="mt-1 text-sm text-slate-600">
              Informasjon om selskapene du er tilknyttet, inkludert tilgangsnivåer og roller.
            </p>
          </div>

          {showEmptyCompanyState ? (
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="px-6 py-8 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  {shouldShowGlobalAdminMessage
                    ? "Som administrator har du tilgang til alle selskaper."
                    : "Ingen selskapsinformasjon tilgjengelig enda."}
                </p>
                {!shouldShowGlobalAdminMessage && (
                  <p className="mt-2 text-sm text-slate-500">
                    Når selskapet ditt er registrert vil dataen dukke opp her.
                  </p>
                )}
              </div>
            </section>
          ) : (
            <Suspense fallback={<ProfileCompaniesLoading />}>
              <ProfileCompaniesSectionServer
                customerIds={accessibleCustomerIds}
                accessEntries={Array.from(accessRoleByCustomer.entries()).map(([customerId, access]) => ({
                  customerId,
                  role: access.role ?? null,
                }))}
                shouldMockGlobalAdminCompanies={shouldMockGlobalAdminCompanies}
              />
            </Suspense>
          )}
        </div>
      </section>
    </main>
  );
}

async function ProfileCompaniesSectionServer({
  customerIds,
  accessEntries,
  shouldMockGlobalAdminCompanies,
}: {
  customerIds: number[];
  accessEntries: Array<{ customerId: number; role: string | null }>;
  shouldMockGlobalAdminCompanies: boolean;
}) {
  const { cards, companyError } = await loadCompanyCards(customerIds);

  return (
    <ProfileCompaniesSection
      initialCards={cards}
      companyError={companyError}
      accessEntries={accessEntries}
      shouldMockGlobalAdminCompanies={shouldMockGlobalAdminCompanies}
    />
  );
}

function ProfileCompaniesLoading() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 px-6 py-6 text-sm text-slate-600">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
        Laster selskapsinformasjon...
      </div>
    </section>
  );
}

async function loadCompanyCards(customerIds: number[]): Promise<{
  cards: CompanyCardState[];
  companyError: string | null;
}> {
  const results = await Promise.all(
    customerIds.map(async (customerId) => {
      try {
        const [company, accesses] = await Promise.all([
          fetchCustomerDetailsServer(customerId),
          fetchCustomerAccessesServer(customerId),
        ]);

        if (!company) {
          return {
            customerId,
            company: null,
            accesses: [],
            status: "error" as const,
            error: "Fant ikke selskapsinformasjon.",
          };
        }

        return {
          customerId,
          company,
          accesses,
          status: "ready" as const,
          error: null,
        };
      } catch (error) {
        return {
          customerId,
          company: null,
          accesses: [],
          status: "error" as const,
          error:
            error instanceof Error
              ? error.message
              : "Kunne ikke hente selskapsdata.",
        };
      }
    }),
  );

  const hasReadyCard = results.some((card) => card.status === "ready");
  return {
    cards: results,
    companyError: hasReadyCard ? null : "Kunne ikke hente selskapsinformasjon akkurat nå.",
  };
}

async function fetchCustomerDetailsServer(customerId: number): Promise<CustomerDetails | null> {
  const apiKey =
    process.env.BJUGSTAD_API_KEY_PRIMARY?.trim() ||
    process.env.BJUGSTAD_API_KEY_SECONDARY?.trim();
  const baseUrl = process.env.BJUGSTAD_API_BASEURL?.trim();

  if (!apiKey || !baseUrl) {
    throw new Error("Mangler konfigurasjon for Bjugstad API");
  }

  const url = `${baseUrl.replace(/\/$/, "")}/GetCustomerById?customerId=${customerId}`;

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Ocp-Apim-Subscription-Key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error("Kunne ikke hente kundeinformasjon");
  }

  return (await response.json()) as CustomerDetails | null;
}

async function fetchCustomerAccessesServer(customerId: number): Promise<CustomerAccessEntry[]> {
  const accesses = await prisma.userCustomerAccess.findMany({
    where: { customerId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
        },
      },
    },
  });

  return accesses.map((access) => ({
    userId: access.userId,
    role: access.role,
    name: access.user?.name ?? null,
    phone: access.user?.phone ?? null,
    email: access.user?.email ?? null,
  }));
}

function ProfileRow({
  icon,
  label,
  value,
}: Omit<ProfileRowEntry, "key">) {
  return (
    <tr className="bg-white transition">
      <ProfileRowCells icon={icon} label={label} value={value} />
    </tr>
  );
}

function ProfileRowCells({
  icon,
  label,
  value,
  withDividerAfter = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  withDividerAfter?: boolean;
}) {
  const dividerClass = withDividerAfter ? "md:border-r md:border-slate-100" : "";
  return (
    <>
      <th
        scope="row"
        className={`w-1/3 px-6 py-4 text-sm font-semibold text-slate-600 md:w-auto ${withDividerAfter ? "md:pr-8" : ""}`}
      >
        <div className="flex items-center gap-2 text-slate-600">
          {icon}
          <span>{label}</span>
        </div>
      </th>
      <td className={`px-6 py-4 text-sm font-medium text-slate-900 ${dividerClass}`}>{value}</td>
    </>
  );
}

function normalizeCustomerId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function chunkRows(rows: ProfileRowEntry[], chunkSize = 2) {
  const pairs: ProfileRowEntry[][] = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    pairs.push(rows.slice(index, index + chunkSize));
  }
  return pairs;
}
