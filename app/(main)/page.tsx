import Link from "next/link";
import { auth } from "@/lib/auth";
import { standardButtonClass } from "@/lib/buttonStyles";

type TabCard = {
  href: string;
  title: string;
  description: string;
  badge: string;
  adminOnly?: boolean;
  preview: "agreements" | "documents" | "machines" | "map" | "profile" | "users" | "customers" | "activity";
};

const TAB_CARDS: TabCard[] = [
  {
    href: "/avtaler",
    title: "Avtaler",
    description: "Oversikt over leieavtaler med raske innganger til kunde, maskin og avtaledetaljer.",
    badge: "Hovedfane",
    preview: "agreements",
  },
  {
    href: "/dokumenter",
    title: "Dokumenter",
    description: "Samlet sted for filer og dokumentasjon som brukeren trenger tilgang til i hverdagen.",
    badge: "Hovedfane",
    preview: "documents",
  },
  {
    href: "/maskiner",
    title: "Maskiner",
    description: "Maskinoversikt med status, dokumenter, lokasjon og kobling til relaterte leieavtaler.",
    badge: "Hovedfane",
    preview: "machines",
  },
  {
    href: "/kart",
    title: "Kart",
    description: "Geografisk visning av maskinparken for rask orientering og sporing av posisjoner.",
    badge: "Hovedfane",
    preview: "map",
  },
  {
    href: "/profil",
    title: "Min profil",
    description: "Egne brukeropplysninger, roller og relevant kontoinformasjon samlet på ett sted.",
    badge: "Hovedfane",
    preview: "profile",
  },
  {
    href: "/brukere",
    title: "Brukere",
    description: "Administratoroversikt for brukere, roller og selskapsadministrasjon.",
    badge: "Admin",
    adminOnly: true,
    preview: "users",
  },
  {
    href: "/kunder",
    title: "Kunder",
    description: "Administratorvisning av kunder, kontaktpersoner og tilgangsstyring.",
    badge: "Admin",
    adminOnly: true,
    preview: "customers",
  },
  {
    href: "/aktivitet",
    title: "Aktivitet",
    description: "Administratorlogg over hendelser og bruksmønstre for oppfølging og kontroll.",
    badge: "Admin",
    adminOnly: true,
    preview: "activity",
  },
];

export default async function HomePage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "super_admin";
  const visibleCards = TAB_CARDS.filter((card) => !card.adminOnly || isAdmin);

  return (
    <main className="min-h-full space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(190,218,255,0.45),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#eef4fb_100%)] p-8">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Bjugstad Utleie
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">
          Startside for arbeidsflatene dine
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          Velg fanen du vil jobbe i. Hver boks viser en rask forhåndsvisning av innholdet,
          hva fanen brukes til, og en direkte snarvei videre.
        </p>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {visibleCards.map((card) => (
          <section
            key={card.href}
            className="group overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_45px_rgba(15,23,42,0.1)]"
          >
            <div className="border-b border-slate-200 bg-slate-50/80 p-3.5">
              <PreviewFrame variant={card.preview} title={card.title} />
            </div>
            <div className="flex flex-col p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold text-slate-900">{card.title}</h2>
                {isAdmin ? (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      card.adminOnly
                        ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
                        : "bg-sky-50 text-sky-700 ring-1 ring-sky-100"
                    }`}
                  >
                    {card.badge}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 min-h-[4.5rem] max-w-2xl text-sm leading-6 text-slate-600">
                {card.description}
              </p>
              <div className="pt-4">
                <Link
                  href={card.href}
                  className={standardButtonClass}
                >
                  Gå til {card.title.toLowerCase()}
                </Link>
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function PreviewFrame({
  variant,
  title,
}: {
  variant: TabCard["preview"];
  title: string;
}) {
  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-inner">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {title}
        </span>
      </div>
      <div className="h-40 bg-white p-3.5">
        {variant === "agreements" ? <PreviewAgreements /> : null}
        {variant === "documents" ? <PreviewDocuments /> : null}
        {variant === "machines" ? <PreviewMachines /> : null}
        {variant === "map" ? <PreviewMap /> : null}
        {variant === "profile" ? <PreviewProfile /> : null}
        {variant === "users" ? <PreviewUsers /> : null}
        {variant === "customers" ? <PreviewCustomers /> : null}
        {variant === "activity" ? <PreviewActivity /> : null}
      </div>
    </div>
  );
}

function PreviewAgreements() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1.1fr_1.4fr_0.9fr] gap-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <span>Avtale</span>
        <span>Kunde</span>
        <span>Periode</span>
      </div>
      {["2026-114", "2026-097", "2026-081"].map((id, index) => (
        <div
          key={id}
          className="grid grid-cols-[1.1fr_1.4fr_0.9fr] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
        >
          <span className="inline-flex w-fit rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
            {id}
          </span>
          <span className="text-sm font-medium text-slate-700">Kunde {index + 1} AS</span>
          <span className="text-xs text-slate-500">21.03 → 14.04</span>
        </div>
      ))}
    </div>
  );
}

function PreviewDocuments() {
  return (
    <div className="grid h-full grid-cols-[1.1fr_0.9fr] gap-4">
      <div className="space-y-3">
        {["Rammeavtale.pdf", "Forsikringsvilkår.pdf", "Brukerhåndbok.pdf"].map((file) => (
          <div
            key={file}
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
          >
            <div>
              <div className="text-sm font-medium text-slate-800">{file}</div>
              <div className="text-xs text-slate-500">Oppdatert i går</div>
            </div>
            <div className="h-8 w-8 rounded-xl bg-slate-900/90" />
          </div>
        ))}
      </div>
      <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-[linear-gradient(135deg,_#f8fafc_0%,_#e2e8f0_100%)] p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Kategorier</div>
        <div className="mt-4 space-y-2">
          {["Vedlegg", "Kontrakter", "Manualer"].map((item) => (
            <div key={item} className="rounded-full bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewMachines() {
  return (
    <div className="grid h-full grid-cols-[1.2fr_0.8fr] gap-4">
      <div className="space-y-3">
        {["Volvo L90H 382", "Cat 326F 879", "Liebherr 924 Rail 796"].map((machine) => (
          <div
            key={machine}
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
          >
            <div>
              <div className="text-sm font-semibold text-slate-800">{machine}</div>
              <div className="text-xs text-slate-500">Lokasjon oppdatert nylig</div>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              Aktiv
            </span>
          </div>
        ))}
      </div>
      <div className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,_#dbeafe_0%,_#eff6ff_100%)] p-4">
        <div className="h-full rounded-[1.2rem] border border-white/80 bg-[radial-gradient(circle_at_30%_30%,_rgba(59,130,246,0.18),_transparent_18%),radial-gradient(circle_at_70%_60%,_rgba(14,165,233,0.22),_transparent_16%),linear-gradient(135deg,_#f8fbff_0%,_#e0f2fe_100%)]" />
      </div>
    </div>
  );
}

function PreviewMap() {
  return (
    <div className="relative h-full overflow-hidden rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(135deg,_#eff6ff_0%,_#dbeafe_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,_rgba(96,165,250,0.2),_transparent_22%),radial-gradient(circle_at_65%_55%,_rgba(14,165,233,0.2),_transparent_20%),radial-gradient(circle_at_82%_28%,_rgba(16,185,129,0.16),_transparent_18%)]" />
      <div className="absolute left-8 top-7 h-4 w-24 rotate-[-18deg] rounded-full bg-white/70" />
      <div className="absolute left-20 top-24 h-3 w-36 rotate-[22deg] rounded-full bg-white/70" />
      <div className="absolute right-12 top-14 h-3 w-28 rotate-[-24deg] rounded-full bg-white/70" />
      <div className="absolute bottom-8 left-12 h-3 w-32 rotate-[16deg] rounded-full bg-white/70" />
      <div className="absolute left-14 top-16 h-5 w-5 rounded-full border-4 border-white bg-sky-500 shadow" />
      <div className="absolute right-20 top-24 h-5 w-5 rounded-full border-4 border-white bg-emerald-500 shadow" />
      <div className="absolute bottom-10 right-16 h-5 w-5 rounded-full border-4 border-white bg-amber-400 shadow" />
    </div>
  );
}

function PreviewProfile() {
  return (
    <div className="grid h-full grid-cols-[0.75fr_1.25fr] gap-4">
      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
        <div className="mx-auto h-16 w-16 rounded-full bg-[linear-gradient(135deg,_#1e293b_0%,_#475569_100%)]" />
        <div className="mt-4 h-3 rounded-full bg-slate-300" />
        <div className="mt-2 h-3 w-2/3 rounded-full bg-slate-200" />
      </div>
      <div className="space-y-3">
        {["Navn", "Telefon", "E-post", "Rolle"].map((field) => (
          <div key={field} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {field}
            </div>
            <div className="mt-1 h-3 rounded-full bg-slate-300" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewUsers() {
  return (
    <div className="space-y-3">
      {["Selskapsadmin", "Selskapsbruker", "Selskapsbruker"].map((role, index) => (
        <div
          key={`${role}-${index}`}
          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
        >
          <div>
            <div className="text-sm font-semibold text-slate-800">Bruker {index + 1}</div>
            <div className="text-xs text-slate-500">bruker{index + 1}@firma.no</div>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              index === 0 ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"
            }`}
          >
            {role}
          </span>
        </div>
      ))}
    </div>
  );
}

function PreviewCustomers() {
  return (
    <div className="grid h-full grid-cols-[1fr_1fr] gap-4">
      <div className="space-y-3">
        {["Aasen Entreprenør", "Nordbygg AS", "Rail Support"].map((name) => (
          <div key={name} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-sm font-semibold text-slate-800">{name}</div>
            <div className="mt-1 text-xs text-slate-500">Kontaktpersoner og tilganger</div>
          </div>
        ))}
      </div>
      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Detaljer</div>
        <div className="mt-4 space-y-2">
          <div className="h-3 rounded-full bg-slate-300" />
          <div className="h-3 w-4/5 rounded-full bg-slate-200" />
          <div className="h-3 w-2/3 rounded-full bg-slate-200" />
          <div className="mt-5 h-16 rounded-2xl bg-white shadow-sm" />
        </div>
      </div>
    </div>
  );
}

function PreviewActivity() {
  return (
    <div className="space-y-3">
      {["Innlogging", "Tilgang endret", "Avtale åpnet", "Maskin vist"].map((entry, index) => (
        <div key={entry} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
          <div className={`mt-1 h-2.5 w-2.5 rounded-full ${index % 2 === 0 ? "bg-sky-500" : "bg-emerald-500"}`} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800">{entry}</div>
            <div className="text-xs text-slate-500">Registrert i aktivitetsloggen</div>
          </div>
        </div>
      ))}
    </div>
  );
}
