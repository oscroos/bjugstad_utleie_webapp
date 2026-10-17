import { redirect } from "next/navigation";
import ErrorPanel from "@/components/ErrorPanel";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGpsIngestionConfig } from "@/lib/telemetry/config";
import TelemetryAdminClient from "./TelemetryAdminClient";

export default async function TelemetriPage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.user?.role !== "super_admin") {
    return (
      <main className="p-8">
        <section className="rounded-lg border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Begrenset tilgang</h1>
          <p className="mt-3 text-slate-600">
            Du trenger administratorrettigheter for å administrere telemetrienheter.
          </p>
        </section>
      </main>
    );
  }

  try {
    const [links, machines] = await Promise.all([
      prisma.machineTelemetryLink.findMany({
        include: {
          machine: {
            select: { id: true, name: true, oemName: true, serialNumber: true },
          },
          _count: {
            select: { positionHistory: true },
          },
        },
        orderBy: [{ active: "desc" }, { provider: "asc" }, { updatedAt: "desc" }],
      }),
      prisma.machine.findMany({
        select: { id: true, name: true, oemName: true, serialNumber: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
    ]);

    return (
      <main className="space-y-6 p-8">
        <header>
          <h1 className="text-3xl font-semibold text-slate-900">Telemetrienheter</h1>
          <p className="mt-2 text-slate-600">
            Koble leverandør-ID eller IMEI til maskiner og følg mottaksstatus.
          </p>
        </header>

        <TelemetryAdminClient
          initialLinks={links.map((link) => ({
            ...link,
            lastSeenAt: link.lastSeenAt?.toISOString() ?? null,
            lastSyncAt: link.lastSyncAt?.toISOString() ?? null,
            createdAt: link.createdAt.toISOString(),
            updatedAt: link.updatedAt.toISOString(),
          }))}
          machines={machines}
          ingestionConfigured={getGpsIngestionConfig().enabled}
        />
      </main>
    );
  } catch (error) {
    return (
      <main className="p-8">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <ErrorPanel withSidebar title="Kunne ikke hente telemetrienheter" error={error} />
        </section>
      </main>
    );
  }
}
