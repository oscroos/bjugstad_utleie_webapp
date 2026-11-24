import { ProjectWorkspaceSkeleton } from "@/app/(main)/prosjekter/ProjectSkeletons";

// Loading placeholders for the pages behind the sidebar tabs.
//
// They are shown in two places, and must look the same in both:
//   - immediately on click, by AppShell, while the next page is being fetched
//   - by each route's loading.tsx, while the server renders the page
//
// The title is the page's real heading, so the switch reads as "the page is
// here, its content is loading". Keep it in sync with the page's <h1>.

type SkeletonVariant = "table" | "dashboard" | "documents" | "profile" | "map" | "project";

const ROUTE_SKELETONS: Record<string, { title: string; variant: SkeletonVariant }> = {
  "/avtaler": { title: "Avtaler", variant: "table" },
  "/prosjekter": { title: "Prosjekter", variant: "project" },
  "/dokumenter": { title: "Dokumenter", variant: "documents" },
  "/maskiner": { title: "Maskiner", variant: "dashboard" },
  "/kart": { title: "Kart", variant: "map" },
  "/profil": { title: "Min profil", variant: "profile" },
  "/brukere": { title: "Brukeroversikt", variant: "table" },
  "/kunder": { title: "Kundeoversikt", variant: "table" },
  "/aktivitet": { title: "Aktivitet", variant: "table" },
  "/katalog": { title: "Katalog", variant: "table" },
  "/telemetri": { title: "Telemetrienheter", variant: "table" },
};

const cardClass = "rounded-2xl border border-slate-200 bg-white shadow-sm";

/** The placeholder for a sidebar tab, looked up by the tab's href. */
export function RouteSkeleton({ href }: { href: string }) {
  const route = ROUTE_SKELETONS[href];
  if (!route) return <PageSkeleton title={null} variant="table" />;
  if (route.variant === "project") return <ProjectWorkspaceSkeleton />;
  return <PageSkeleton title={route.title} variant={route.variant} />;
}

export function PageSkeleton({
  title,
  variant,
}: {
  title: string | null;
  variant: Exclude<SkeletonVariant, "project">;
}) {
  const label = title ? `Laster ${title.toLowerCase()}` : "Laster side";

  if (variant === "map") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={label}
        className="flex h-screen w-full items-center justify-center gap-3 bg-slate-100 text-sm text-slate-500"
      >
        <Spinner />
        Laster kart...
      </div>
    );
  }

  return (
    <div role="status" aria-busy="true" aria-label={label} className="space-y-6 p-8">
      <header>
        {title ? (
          <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
        ) : (
          <div className="h-9 w-64 max-w-full rounded-lg bg-slate-200" />
        )}
        <div className="mt-3 h-4 w-[32rem] max-w-full rounded bg-slate-100" />
      </header>

      {variant === "table" ? <TableSkeleton label={`${label}...`} /> : null}
      {variant === "dashboard" ? <DashboardSkeleton label={`${label}...`} /> : null}
      {variant === "documents" ? <DocumentsSkeleton label={`${label}...`} /> : null}
      {variant === "profile" ? <ProfileSkeleton label={`${label}...`} /> : null}
    </div>
  );
}

function TableSkeleton({ label, rows = 8 }: { label: string; rows?: number }) {
  return (
    <section className={cardClass}>
      <SpinnerRow label={label} />
      <div className="space-y-3 p-4">
        {Array.from({ length: rows }, (_, index) => (
          <Bar key={index} className="h-12" />
        ))}
      </div>
    </section>
  );
}

function DashboardSkeleton({ label }: { label: string }) {
  return (
    <>
      <section className={cardClass}>
        <SpinnerRow label={label} />
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <Bar className="h-10" />
          <Bar className="h-10" />
          <Bar className="h-10" />
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={`${cardClass} space-y-3 p-5`}>
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="h-7 w-32 rounded bg-slate-200" />
            <div className="h-3 w-40 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className={`${cardClass} p-4`}>
          <Bar className="h-64" />
        </div>
        <div className={`${cardClass} p-4`}>
          <Bar className="h-64" />
        </div>
      </div>
    </>
  );
}

function DocumentsSkeleton({ label }: { label: string }) {
  return (
    <section className={cardClass}>
      <SpinnerRow label={label} />
      <div className="grid gap-5 p-6 xl:grid-cols-[20rem_1fr]">
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Bar key={index} className="h-9" />
          ))}
        </div>
        <div className="space-y-3">
          <div className="h-6 w-48 rounded bg-slate-200" />
          {[0, 1, 2, 3].map((index) => (
            <Bar key={index} className="h-12" />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProfileSkeleton({ label }: { label: string }) {
  return (
    <>
      <section className={cardClass}>
        <SpinnerRow label={label} />
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Bar key={index} className="h-14" />
          ))}
        </div>
      </section>
      <TableSkeleton label="Laster selskaper..." rows={3} />
    </>
  );
}

function SpinnerRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4 text-sm text-slate-600">
      <Spinner />
      {label}
    </div>
  );
}

function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />;
}

function Bar({ className }: { className: string }) {
  return <div className={`rounded-xl bg-slate-100 ${className}`} />;
}
