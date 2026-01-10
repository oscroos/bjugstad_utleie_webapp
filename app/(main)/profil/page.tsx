// app/(main)/profil/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  CalendarIcon,
  EnvelopeIcon,
  HomeIcon,
  IdentificationIcon,
  PhoneIcon,
  UserCircleIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import type { CustomerDetails } from "@/components/dialogs/CustomerAccessDialog";
import { fetchCustomerDetails } from "@/lib/api/customers";
import {
  formatCustomerAddress,
  formatDate,
  formatDisplay,
  formatPhone,
  formatUserAddress,
} from "@/lib/formatters";

const GLOBAL_ADMIN_TEST_COMPANY_IDS = [2228, 1075] as const;
// Toggle to false when global administrators should see the generic full-access message instead.
const ENABLE_GLOBAL_ADMIN_TEST_COMPANIES = true;
const EMPTY_ACCESS_LIST: SessionAccessEntry[] = [];

type SessionAccessEntry = {
  customerId?: number | string;
};

type CompanyCardState = {
  customerId: number;
  company: CustomerDetails | null;
  status: "loading" | "ready" | "error";
  error: string | null;
};

type ProfileRowEntry = {
  key: string;
  icon: React.ReactNode;
  label: string;
  value: string;
};

type ProfileRowProps = Omit<ProfileRowEntry, "key">;

export default function ProfilPage() {
  const { data, status } = useSession();

  // If middleware already protects this route, unauthenticated users won't reach here.
  // Still handle gracefully:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = (data?.user as any) || {};

  const createdLabel = formatDate(user.createdAt) ?? "N/A";

  const formattedPhone = formatPhone(user.phone, "N/A");
  const formattedAddress = formatUserAddress({
    street: user.address_street,
    postalCode: user.address_postal_code,
    region: user.address_region,
  });

  const isGlobalAdmin =
    typeof user.role === "string" && user.role.toLowerCase() === "super_admin";

  const userAccessesRaw = user?.accesses;
  const sessionAccesses = useMemo<SessionAccessEntry[]>(
    () => (Array.isArray(userAccessesRaw) ? userAccessesRaw : EMPTY_ACCESS_LIST),
    [userAccessesRaw],
  );
  const profileHeaderName = formatDisplay(user.name, "Ukjent bruker");

  const shouldMockGlobalAdminCompanies =
    isGlobalAdmin && ENABLE_GLOBAL_ADMIN_TEST_COMPANIES;

  const accessibleCustomerIds = useMemo<number[]>(() => {
    if (shouldMockGlobalAdminCompanies) {
      return [...GLOBAL_ADMIN_TEST_COMPANY_IDS];
    }
    const ids = sessionAccesses
      .map((access) => normalizeCustomerId(access?.customerId))
      .filter((id): id is number => typeof id === "number");
    return Array.from(new Set(ids)).sort((a, b) => a - b);
  }, [sessionAccesses, shouldMockGlobalAdminCompanies]);

  const [companyCards, setCompanyCards] = useState<CompanyCardState[]>([]);
  const [companyError, setCompanyError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    if (!accessibleCustomerIds.length) {
      setCompanyCards([]);
      setCompanyError(null);
      return;
    }

    setCompanyError(null);
    setCompanyCards(
      accessibleCustomerIds.map((customerId) => ({
        customerId,
        company: null,
        status: "loading",
        error: null,
      })),
    );

    const controller = new AbortController();

    (async () => {
      const results = await Promise.allSettled(
        accessibleCustomerIds.map((customerId) =>
          fetchCustomerDetails(customerId, { signal: controller.signal }),
        ),
      );

      if (isCancelled) return;

      const nextCards = results.map((result, index) => {
        const customerId = accessibleCustomerIds[index];
        if (result.status === "fulfilled" && result.value) {
          return {
            customerId,
            company: result.value,
            status: "ready" as const,
            error: null,
          };
        }

        const message =
          result.status === "fulfilled"
            ? "Fant ikke selskapsinformasjon."
            : result.reason instanceof Error
              ? result.reason.message
              : "Kunne ikke hente selskapsdata.";

        return {
          customerId,
          company: null,
          status: "error" as const,
          error: message,
        };
      });

      const hasReadyCard = nextCards.some((card) => card.status === "ready");
      setCompanyCards(nextCards);
      setCompanyError(
        hasReadyCard ? null : "Kunne ikke hente selskapsinformasjon akkurat nå.",
      );
    })().catch((error) => {
      if (isCancelled) return;
      const fallbackCards = accessibleCustomerIds.map((customerId) => ({
        customerId,
        company: null,
        status: "error" as const,
        error:
          error instanceof Error
            ? error.message
            : "Kunne ikke hente selskapsdata.",
      }));
      setCompanyCards(fallbackCards);
      setCompanyError(
        error instanceof Error
          ? error.message
          : "Kunne ikke hente selskapsdata.",
      );
    });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [accessibleCustomerIds]);

  const showEmptyCompanyState = accessibleCustomerIds.length === 0;
  const shouldShowGlobalAdminMessage =
    showEmptyCompanyState && isGlobalAdmin && !shouldMockGlobalAdminCompanies;

  const profileRows: ProfileRowEntry[] = [
    {
      key: "name",
      icon: <UserIcon className="h-5 w-5 text-slate-400" />,
      label: "Navn",
      value: user.name ?? "N/A",
    },
    {
      key: "phone",
      icon: <PhoneIcon className="h-5 w-5 text-slate-400" />,
      label: "Telefon",
      value: formattedPhone ?? "N/A",
    },
    {
      key: "email",
      icon: <EnvelopeIcon className="h-5 w-5 text-slate-400" />,
      label: "E-post",
      value: user.email ?? "N/A",
    },
    {
      key: "address",
      icon: <HomeIcon className="h-5 w-5 text-slate-400" />,
      label: "Adresse",
      value: formattedAddress ?? "N/A",
    },
    {
      key: "created",
      icon: <CalendarIcon className="h-5 w-5 text-slate-400" />,
      label: "Bruker opprettet",
      value: createdLabel ?? "N/A",
    },
  ];
  const profileRowPairs = chunkRows(profileRows);

  if (status === "loading") {
    return (
      <main className="p-8">
        <p>Laster profil…</p>
      </main>
    );
  }

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
            <p className="mt-1 text-sm text-slate-600">Dine kontaktdata og kontoopplysninger. Dette utgjør all persondata vi har lagret om deg.</p>
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

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                onClick={() => alert("TODO: Implement functionality")}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 cursor-pointer"
              >
                Be om innsyn i lagrede data
              </button>

              <button
                onClick={() => alert("TODO: Implement functionality")}
                className="inline-flex items-center justify-center rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600 cursor-pointer"
              >
                Slett bruker
              </button>
            </div>
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
            <div className="space-y-4">
              {companyCards.length === 0 ? (
                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center gap-3 px-6 py-6 text-sm text-slate-600">
                    <ArrowPathIcon className="h-5 w-5 animate-spin text-blue-600" />
                    Laster selskapsinformasjon...
                  </div>
                </section>
              ) : (
                companyCards.map((card) => (
                  <CompanyProfileCard key={card.customerId} card={card} />
                ))
              )}
              {companyError ? (
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                  {companyError}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function ProfileRow({
  icon,
  label,
  value,
}: ProfileRowProps) {
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
        className={`w-1/3 px-6 py-4 text-sm font-semibold text-slate-600 md:w-auto ${withDividerAfter ? "md:pr-8" : ""
          }`}
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

function CompanyProfileCard({ card }: { card: CompanyCardState }) {
  const { customerId, company, status, error } = card;
  const headerName = formatDisplay(
    company?.name,
    status === "loading" ? "Laster selskapsinformasjon..." : "Ukjent selskap",
  );

  const companyRows: ProfileRowEntry[] = company
    ? [
      {
        key: "id",
        icon: <IdentificationIcon className="h-5 w-5 text-slate-400" />,
        label: "ID",
        value: String(company.customerId ?? customerId),
      },
      {
        key: "org",
        icon: <BuildingOffice2Icon className="h-5 w-5 text-slate-400" />,
        label: "Org.nr.",
        value: formatDisplay(company.organizationNumber, "N/A"),
      },
      {
        key: "contact",
        icon: <UserCircleIcon className="h-5 w-5 text-slate-400" />,
        label: "Kontakt",
        value: formatDisplay(company.contact, "N/A"),
      },
      {
        key: "phone",
        icon: <PhoneIcon className="h-5 w-5 text-slate-400" />,
        label: "Telefon",
        value: formatPhone(company.telephoneNumber, "N/A"),
      },
      {
        key: "email",
        icon: <EnvelopeIcon className="h-5 w-5 text-slate-400" />,
        label: "E-post",
        value: formatDisplay(company.email, "N/A"),
      },
      {
        key: "address",
        icon: <HomeIcon className="h-5 w-5 text-slate-400" />,
        label: "Adresse",
        value: formatCustomerAddress(company),
      },
    ]
    : [];

  const companyRowPairs = chunkRows(companyRows);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
        <div className="text-slate-900">
          <h3 className="text-lg font-semibold">
            {headerName}
            <span className="ml-3 text-sm font-normal text-slate-500">ID {customerId}</span>
          </h3>
        </div>
      </div>

      {status === "loading" ? (
        <div className="flex items-center gap-3 px-6 py-6 text-sm text-slate-600">
          <ArrowPathIcon className="h-5 w-5 animate-spin text-blue-600" />
          Laster selskapsinformasjon...
        </div>
      ) : status === "error" || !company ? (
        <div className="px-6 py-6 text-sm text-red-700">
          {error ?? "Kunne ikke hente selskapsinformasjon for dette selskapet."}
        </div>
      ) : (
        <div className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 md:hidden">
              <tbody className="divide-y divide-slate-100 bg-white text-sm">
                {companyRows.map((row) => (
                  <ProfileRow
                    key={`${customerId}-${row.key}`}
                    icon={row.icon}
                    label={row.label}
                    value={row.value}
                  />
                ))}
              </tbody>
            </table>

            <table className="hidden min-w-full divide-y divide-slate-100 md:table">
              <tbody className="divide-y divide-slate-100 bg-white text-sm">
                {companyRowPairs.map((pair) => (
                  <tr
                    key={`${customerId}-${pair.map((row) => row.key).join("-")}`}
                    className="bg-white transition"
                  >
                    {pair.map((row, index) => (
                      <ProfileRowCells
                        key={`${customerId}-${row.key}`}
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
        </div>
      )}
    </section>
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
