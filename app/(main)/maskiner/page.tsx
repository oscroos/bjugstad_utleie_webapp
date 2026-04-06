import MachinesDashboard from "./MachinesDashboard";

export default function MaskinerPage() {
  return (
    <main className="space-y-6 p-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Maskiner</h1>
          <p className="mt-2 text-slate-600">
            Velg maskiner og analyseoppsett for å se et samlet dashboard for drift, energi og utslipp.
          </p>
        </div>
      </header>
      <MachinesDashboard />
    </main>
  );
}
