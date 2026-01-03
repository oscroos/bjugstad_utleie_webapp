// app/(main)/profil/page.tsx
"use client";

import { useSession } from "next-auth/react";
import { CalendarIcon, UserIcon, PhoneIcon, EnvelopeIcon, HomeIcon, BuildingOffice2Icon, BriefcaseIcon } from "@heroicons/react/24/outline";
import { formatPhone } from "@/lib/formatters";

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

  // Try to format createdAt if present
  const created =
    typeof user.createdAt === "string"
      ? new Date(user.createdAt)
      : user.createdAt instanceof Date
        ? user.createdAt
        : null;

  const createdLabel = created
    ? created.toLocaleString("no-NO", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    : "N/A";

  const formattedPhone = formatPhone(user.phone, "N/A");
  const formattedAddress = formatAddress({
    street: user.address_street,
    postalCode: user.address_postal_code,
    region: user.address_region,
  });

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold mb-6">Min profil</h1>

      <div className="max-w-xl rounded-xl bg-white shadow p-6 space-y-4">
        <ProfileRow icon={<UserIcon className="h-5 w-5 text-slate-500" />} label="Navn" value={user.name ?? "N/A"} />
        <ProfileRow icon={<PhoneIcon className="h-5 w-5 text-slate-500" />} label="Telefon" value={formattedPhone ?? "N/A"} />
        <ProfileRow icon={<EnvelopeIcon className="h-5 w-5 text-slate-500" />} label="E-post" value={user.email ?? "N/A"} />
        <ProfileRow icon={<HomeIcon className="h-5 w-5 text-slate-500" />} label="Adresse" value={formattedAddress ?? "N/A"} />
        <ProfileRow icon={<BuildingOffice2Icon className="h-5 w-5 text-slate-500" />} label="Selskap" value={user.company ?? "N/A"} />
        <ProfileRow icon={<BriefcaseIcon className="h-5 w-5 text-slate-500" />} label="Rolle" value={user.role ?? "N/A"} />
        <ProfileRow icon={<CalendarIcon className="h-5 w-5 text-slate-500" />} label="Bruker opprettet" value={createdLabel ?? "N/A"} />

        <div className="flex justify-between items-center pt-4 border-t">
          <button
            onClick={() => alert("TODO: Implement functionality")}
            className="rounded-lg bg-slate-500 text-white px-4 py-2 hover:bg-slate-600 cursor-pointer"
          >
            Be om innsyn i lagrede data
          </button>

          <button
            onClick={() => alert("TODO: Implement functionality")}
            className="rounded-lg bg-red-500 text-white px-4 py-2 hover:bg-red-600 cursor-pointer"
          >
            Slett bruker
          </button>
        </div>
      </div>
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
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-medium text-slate-700">{label}:</span>
      </div>
      <span className="text-slate-900">{value}</span>
    </div>
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
