// app/(main)/profil/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  IconLoader2,
  IconBuilding,
  IconCalendar,
  IconMail,
  IconHome,
  IconId,
  IconPhone,
  IconUserCircle,
  IconUser,
} from "@tabler/icons-react";
import type {
  CustomerAccessEntry,
  CustomerDetails,
} from "@/components/dialogs/CustomerAccessDialog";
import { fetchCustomerAccesses, fetchCustomerDetails } from "@/lib/api/customers";
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
  role?: string | null;
  customer?: {
    name?: string | null;
    customer_number?: number | null;
  } | null;
};

type CompanyCardState = {
  customerId: number;
  company: CustomerDetails | null;
  accesses: CustomerAccessEntry[];
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

  const accessRoleByCustomer = useMemo(() => {
    const map = new Map<number, SessionAccessEntry>();
    sessionAccesses.forEach((access) => {
      const id = normalizeCustomerId(access?.customerId);
      if (typeof id === "number") {
        map.set(id, access);
      }
    });
    return map;
  }, [sessionAccesses]);
  const profileHeaderName = formatDisplay(user.name, "Ukjent bruker");

  const shouldMockGlobalAdminCompanies =
    isGlobalAdmin && ENABLE_GLOBAL_ADMIN_TEST_COMPANIES;

  const accessibleCustomerIds = useMemo<number[]>(() => {
    if (shouldMockGlobalAdminCompanies) {
      return [...GLOBAL_ADMIN_TEST_COMPANY_IDS];
    }
    return Array.from(accessRoleByCustomer.keys()).sort((a, b) => a - b);
  }, [accessRoleByCustomer, shouldMockGlobalAdminCompanies]);

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
        accesses: [],
        status: "loading",
        error: null,
      })),
    );

    const controller = new AbortController();

    (async () => {
      const results = await Promise.all(
        accessibleCustomerIds.map(async (customerId) => {
          try {
            const [company, accesses] = await Promise.all([
              fetchCustomerDetails(customerId, { signal: controller.signal }),
              fetchCustomerAccesses(customerId, { signal: controller.signal }),
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
          } catch (err) {
            if (
              err instanceof DOMException &&
              err.name === "AbortError"
            ) {
              throw err;
            }
            return {
              customerId,
              company: null,
              accesses: [],
              status: "error" as const,
              error:
                err instanceof Error
                  ? err.message
                  : "Kunne ikke hente selskapsdata.",
            };
          }
        }),
      );

      if (isCancelled) return;

      const hasReadyCard = results.some((card) => card.status === "ready");
      setCompanyCards(results);
      setCompanyError(
        hasReadyCard ? null : "Kunne ikke hente selskapsinformasjon akkurat nå.",
      );
    })().catch((error) => {
      if (isCancelled || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }
      const fallbackCards = accessibleCustomerIds.map((customerId) => ({
        customerId,
        company: null,
        accesses: [],
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
      icon: <IconUser className="h-5 w-5 text-slate-400" />,
      label: "Navn",
      value: user.name ?? "N/A",
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
      value: user.email ?? "N/A",
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

  if (status === "loading") {
    return (
      <main className="p-8">
        <p>Laster profil…</p>
      </main>
    );
  }

  function handleAccessesUpdated(
    customerId: number,
    updatedAccesses: CustomerAccessEntry[],
  ) {
    setCompanyCards((prev) =>
      prev.map((card) =>
        card.customerId === customerId
          ? { ...card, accesses: updatedAccesses }
          : card,
      ),
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
                className="cursor-pointer rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
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
                    <IconLoader2 className="h-5 w-5 animate-spin text-blue-600" />
                    Laster selskapsinformasjon...
                  </div>
                </section>
              ) : (
                companyCards.map((card) => {
                  const roleEntry = accessRoleByCustomer.get(card.customerId);
                  const canManageAccesses =
                    roleEntry?.role === "admin" && !shouldMockGlobalAdminCompanies;
                  return (
                    <CompanyProfileCard
                      key={card.customerId}
                      card={card}
                      canManageAccesses={canManageAccesses}
                      onAccessesUpdated={handleAccessesUpdated}
                    />
                  );
                })
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

function CompanyProfileCard({
  card,
  canManageAccesses,
  onAccessesUpdated,
}: {
  card: CompanyCardState;
  canManageAccesses: boolean;
  onAccessesUpdated: (customerId: number, accesses: CustomerAccessEntry[]) => void;
}) {
  const { customerId, company, status, error, accesses } = card;
  const [entries, setEntries] = useState<CustomerAccessEntry[]>(accesses);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setEntries(accesses);
    setSaveError(null);
    setSaving(false);
  }, [accesses]);

  const isDirty = useMemo(() => {
    if (entries.length !== accesses.length) return true;
    const baseline = new Map(accesses.map((entry) => [entry.userId, entry.role]));
    return entries.some((entry) => baseline.get(entry.userId) !== entry.role);
  }, [entries, accesses]);

  const headerName = formatDisplay(
    company?.name,
    status === "loading" ? "Laster selskapsinformasjon..." : "Ukjent selskap",
  );

  const companyRows: ProfileRowEntry[] = company
    ? [
      {
        key: "id",
        icon: <IconId className="h-5 w-5 text-slate-400" />,
        label: "ID",
        value: String(company.customerId ?? customerId),
      },
      {
        key: "org",
        icon: <IconBuilding className="h-5 w-5 text-slate-400" />,
        label: "Org.nr.",
        value: formatDisplay(company.organizationNumber, "N/A"),
      },
      {
        key: "contact",
        icon: <IconUserCircle className="h-5 w-5 text-slate-400" />,
        label: "Kontakt",
        value: formatDisplay(company.contact, "N/A"),
      },
      {
        key: "phone",
        icon: <IconPhone className="h-5 w-5 text-slate-400" />,
        label: "Telefon",
        value: formatPhone(company.telephoneNumber, "N/A"),
      },
      {
        key: "email",
        icon: <IconMail className="h-5 w-5 text-slate-400" />,
        label: "E-post",
        value: formatDisplay(company.email, "N/A"),
      },
      {
        key: "address",
        icon: <IconHome className="h-5 w-5 text-slate-400" />,
        label: "Adresse",
        value: formatCustomerAddress(company),
      },
    ]
    : [];

  const companyRowPairs = chunkRows(companyRows);

  function toggleRole(userId: string) {
    if (!canManageAccesses) return;
    setEntries((prev) =>
      prev.map((entry) =>
        entry.userId === userId
          ? { ...entry, role: entry.role === "admin" ? "user" : "admin" }
          : entry,
      ),
    );
  }

  function removeEntry(userId: string) {
    if (!canManageAccesses) return;
    setEntries((prev) => prev.filter((entry) => entry.userId !== userId));
  }

  async function handleSave() {
    if (!canManageAccesses || !isDirty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/customers/${customerId}/accesses`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accesses: entries.map((entry) => ({
            userId: entry.userId,
            role: entry.role === "admin" ? "admin" : "user",
          })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? "Kunne ikke lagre endringer");
      }
      onAccessesUpdated(customerId, entries);
    } catch (err) {
      console.error("Failed to save accesses", err);
      setSaveError(err instanceof Error ? err.message : "Kunne ikke lagre endringer");
    } finally {
      setSaving(false);
    }
  }

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
          <IconLoader2 className="h-5 w-5 animate-spin text-blue-600" />
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

      {status === "ready" ? (
        <div className="border-t border-slate-100 bg-white px-6 py-5">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-semibold text-slate-900">Brukertilganger</h4>
            <span className="text-sm text-slate-500">
              {entries.length} bruker{entries.length === 1 ? "" : "e"}
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              Ingen registrerte tilganger for dette selskapet.
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {entries.map((entry) => (
                <div key={entry.userId} className="flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {formatDisplay(entry.name, "Ukjent bruker")}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{formatPhone(entry.phone)}</span>
                        {entry.email ? (
                          <>
                            <span className="text-slate-300">&middot;</span>
                            <span className="truncate">{entry.email}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {canManageAccesses ? (
                      <button
                        type="button"
                        onClick={() => toggleRole(entry.userId)}
                        className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold cursor-pointer ${
                          entry.role === "admin"
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-blue-200 bg-blue-50 text-blue-800"
                        }`}
                      >
                        {formatCompanyRole(entry.role)}
                      </button>
                    ) : (
                      <span
                        className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${
                          entry.role === "admin"
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-blue-200 bg-blue-50 text-blue-800"
                        }`}
                      >
                        {formatCompanyRole(entry.role)}
                      </span>
                    )}
                  </div>
                  {canManageAccesses ? (
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.userId)}
                      className="cursor-pointer rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                    >
                      Fjern
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {saveError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {saveError}
            </div>
          ) : null}

          {canManageAccesses ? (
            <div className="mt-4 flex justify-start">
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || saving}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow ${
                  !isDirty || saving
                    ? "cursor-not-allowed bg-blue-300"
                    : "cursor-pointer bg-blue-600 hover:bg-blue-500"
                }`}
              >
                {saving ? (
                  <>
                    <IconLoader2 className="h-4 w-4 animate-spin" />
                    Lagrer...
                  </>
                ) : (
                  "Lagre"
                )}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
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

function formatCompanyRole(role?: string | null) {
  if (role === "admin") return "Selskapsadmin";
  if (role === "user") return "Selskapsbruker";
  return formatDisplay(role, "Ukjent");
}
