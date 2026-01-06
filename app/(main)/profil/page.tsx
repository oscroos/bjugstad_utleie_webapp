// app/(main)/profil/page.tsx
"use client";

import { useSession } from "next-auth/react";
import { CalendarIcon, UserIcon, PhoneIcon, EnvelopeIcon, HomeIcon } from "@heroicons/react/24/outline";
import { formatPhone, formatDate } from "@/lib/formatters";

export default function ProfilPage() {
  const { data, status } = useSession();

  if (status === "loading") {
    return (
      <main className="p-8">
        <p>Laster profil…</p>
      </main>
    );
  }

  // If middleware already protects this route, unauthenticated users won't reach here.
  // Still handle gracefully:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = (data?.user as any) || {};

  const createdLabel = formatDate(user.createdAt) ?? "N/A";

  const formattedPhone = formatPhone(user.phone, "N/A");
  const formattedAddress = formatAddress({
    street: user.address_street,
    postalCode: user.address_postal_code,
    region: user.address_region,
  });

  const isGlobalAdmin =
    typeof user.role === "string" && user.role.toLowerCase() === "super_admin";

  const profileRows = [
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
  const profileRowPairs = [];
  for (let index = 0; index < profileRows.length; index += 2) {
    profileRowPairs.push(profileRows.slice(index, index + 2));
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

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="px-6 py-8 text-center">
              <p className="text-sm font-semibold text-slate-700">
                {isGlobalAdmin ? "Som administrator har du tilgang til alle selskaper." : "Ingen selskapsinformasjon tilgjengelig enda."}
              </p>
              {!isGlobalAdmin && (
                <p className="mt-2 text-sm text-slate-500">
                  Når selskapet ditt er registrert vil dataen dukke opp her.
                </p>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function ProfileRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
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

function formatAddress({
  street,
  postalCode,
  region,
}: {
  street?: string | null;
  postalCode?: string | null;
  region?: string | null;
}) {
  const parts: string[] = [];
  if (street) parts.push(street);

  const postalRegion = [postalCode, region].filter(Boolean).join(" ");
  if (postalRegion) parts.push(postalRegion);

  return parts.length ? parts.join(", ") : "N/A";
}
