// Loading placeholders for the Prosjekter tab, in the same style as the
// table skeletons on Avtaler and Brukere (spinner row + grey bars).

function Bar({ className }: { className: string }) {
  return <div className={`rounded-xl bg-slate-100 ${className}`} />;
}

function SpinnerRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4 text-sm text-slate-600">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
      {label}
    </div>
  );
}

const cardClass = "rounded-2xl border border-slate-200 bg-white shadow-sm";

export function ProjectWorkspaceSkeleton() {
  return (
    <main className="space-y-6 p-8" aria-busy="true" aria-label="Laster prosjekt">
      <header className="space-y-3">
        <div className="h-9 w-80 max-w-full rounded-lg bg-slate-200" />
        <div className="h-4 w-56 rounded bg-slate-100" />
        <div className="flex gap-2">
          <div className="h-6 w-16 rounded-full bg-slate-100" />
          <div className="h-6 w-20 rounded-full bg-slate-100" />
          <div className="h-6 w-28 rounded-full bg-slate-100" />
        </div>
      </header>

      <div className="flex gap-2 border-b border-slate-200 pb-3">
        {[28, 32, 40, 28].map((width, index) => (
          <div key={index} className="h-6 rounded bg-slate-100" style={{ width: `${width * 4}px` }} />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={`${cardClass} space-y-3 p-5`}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-slate-100" />
              <div className="h-3 w-24 rounded bg-slate-100" />
            </div>
            <div className="h-7 w-32 rounded bg-slate-200" />
            <div className="h-3 w-40 rounded bg-slate-100" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={cardClass}>
          <SpinnerRow label="Laster prosjekt..." />
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3, 4, 5, 6].map((index) => (
              <Bar key={index} className="h-9" />
            ))}
          </div>
        </section>
        <section className={cardClass}>
          <div className="border-b border-slate-100 px-6 py-4">
            <div className="h-5 w-32 rounded bg-slate-200" />
          </div>
          <div className="space-y-3 p-4">
            <Bar className="h-28" />
            <Bar className="h-28" />
          </div>
        </section>
      </div>

      <MachinesSectionSkeleton />
    </main>
  );
}

export function MachinesSectionSkeleton() {
  return (
    <section className={cardClass} aria-busy="true">
      <SpinnerRow label="Henter maskiner fra leieavtaler..." />
      <div className="space-y-3 p-4">
        <Bar className="h-12" />
        <Bar className="h-12" />
        <Bar className="h-12" />
      </div>
    </section>
  );
}

export function ProjectFormSkeleton({ label = "Laster..." }: { label?: string }) {
  return (
    <main className="space-y-6 p-8" aria-busy="true">
      <header className="space-y-3">
        <div className="h-4 w-36 rounded bg-slate-100" />
        <div className="h-9 w-72 max-w-full rounded-lg bg-slate-200" />
        <div className="h-4 w-56 rounded bg-slate-100" />
      </header>
      <section className={cardClass}>
        <SpinnerRow label={label} />
        <div className="space-y-3 p-4">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Bar key={index} className="h-12" />
          ))}
        </div>
      </section>
    </main>
  );
}
