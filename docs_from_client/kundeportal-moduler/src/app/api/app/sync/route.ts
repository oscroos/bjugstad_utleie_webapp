import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectRole, audit } from "@/lib/sikkerhet/guard";

// ────────────────────────────────────────────────────────────────────────────
//  APP-SYNK – kontrakten felt-appen bygger mot
//
//  POST /api/app/sync
//  Body: {
//    deviceId: string,
//    items: [
//      { syncId: uuid, type: "mass"|"ruh"|"safetyRound"|"fuel",
//        projectId: string, payload: {...}, capturedAt: ISO }
//    ]
//  }
//
//  Prinsipper:
//  • OFFLINE-FØRST: appen køer registreringer lokalt og sender batch når nett
//    er tilbake. Re-sending er trygt – syncId (klient-generert UUID) gir
//    idempotens via unique-constraint på appSyncId.
//  • DELVIS SUKSESS: hver item behandles for seg; responsen sier per item om
//    den ble lagret, var duplikat, eller feilet – appen fjerner kun de som
//    er kvittert.
//  • Autentisering: samme NextAuth-session/token som portalen (appen bruker
//    samme innlogging som opplæringsdelen i dag).
// ────────────────────────────────────────────────────────────────────────────

interface SyncItem {
  syncId: string;
  type: "mass" | "ruh" | "safetyRound" | "fuel";
  projectId: string;
  payload: Record<string, unknown>;
  capturedAt: string;
}
type ItemResult = { syncId: string; status: "saved" | "duplicate" | "error"; error?: string };

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }

  const body = await req.json();
  const items: SyncItem[] = body?.items ?? [];
  const deviceId: string = body?.deviceId ?? "unknown";
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Ingen elementer å synke." }, { status: 400 });
  }
  if (items.length > 200) {
    return NextResponse.json({ error: "Maks 200 elementer per batch." }, { status: 400 });
  }

  const results: ItemResult[] = [];
  // Cache rolle-oppslag per prosjekt i batchen
  const roleCache = new Map<string, boolean>();

  for (const item of items) {
    try {
      if (!item.syncId || !item.type || !item.projectId) {
        results.push({ syncId: item.syncId ?? "?", status: "error", error: "Mangler syncId/type/projectId." });
        continue;
      }

      // Rollesjekk (MEMBER kreves for å registrere)
      if (!roleCache.has(item.projectId)) {
        const access = await requireProjectRole(
          item.projectId, session.user.id, session.user.organizationId, "MEMBER"
        );
        roleCache.set(item.projectId, !!access);
      }
      if (!roleCache.get(item.projectId)) {
        results.push({ syncId: item.syncId, status: "error", error: "Ingen tilgang til prosjektet." });
        continue;
      }

      const saved = await lagreItem(item, session.user.id);
      results.push({ syncId: item.syncId, status: saved });
    } catch (err: unknown) {
      // P2002 = unique constraint på appSyncId → allerede mottatt (re-send)
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
        results.push({ syncId: item.syncId, status: "duplicate" });
      } else {
        console.error("Synk-feil for", item.syncId, err);
        results.push({ syncId: item.syncId, status: "error", error: "Lagring feilet." });
      }
    }
  }

  await prisma.appSyncBatch.create({
    data: {
      organizationId: session.user.organizationId,
      deviceId,
      userId: session.user.id,
      itemCount: items.length,
    },
  });
  await audit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "app.sync",
    entityType: "AppSyncBatch",
    metadata: { deviceId, itemCount: items.length, saved: results.filter((r) => r.status === "saved").length },
  });

  return NextResponse.json({ results });
}

async function lagreItem(item: SyncItem, userId: string): Promise<"saved"> {
  const p = item.payload as Record<string, never>;

  switch (item.type) {
    case "mass":
      await prisma.massMovement.create({
        data: {
          projectId: item.projectId,
          massType: String(p["massType"] ?? "ukjent"),
          classification: (p["classification"] as never) ?? "UNKNOWN",
          volumeM3: p["volumeM3"] != null ? Number(p["volumeM3"]) : null,
          originLocation: (p["originLocation"] as string) ?? null,
          destinationName: (p["destinationName"] as string) ?? null,
          transporter: (p["transporter"] as string) ?? null,
          declarationRef: (p["declarationRef"] as string) ?? null,
          transportKm: p["transportKm"] != null ? Number(p["transportKm"]) : null,
          roundTrips: p["roundTrips"] != null ? Number(p["roundTrips"]) : null,
          receiptDocId: (p["receiptPhotoDocId"] as string) ?? null, // foto av veieseddel
          status: (p["status"] as never) ?? "DELIVERED",
          movedAt: item.capturedAt ? new Date(item.capturedAt) : null,
          createdById: userId,
          // idempotens – krever appSyncId-felt (unique) på MassMovement:
          // legg til `appSyncId String? @unique` i schema del 3.
          appSyncId: item.syncId,
        } as never,
      });
      return "saved";

    case "ruh":
      await prisma.ruhReport.create({
        data: {
          projectId: item.projectId,
          severity: (p["severity"] as never) ?? "OBSERVATION",
          title: String(p["title"] ?? "Registrert fra app"),
          description: (p["description"] as string) ?? null,
          location: (p["location"] as string) ?? null,
          occurredAt: new Date((p["occurredAt"] as string) ?? item.capturedAt),
          photoDocIds: (p["photoDocIds"] as string[]) ?? [],
          source: "APP",
          appSyncId: item.syncId,
          reportedById: userId,
        },
      });
      return "saved";

    case "safetyRound":
      await prisma.safetyRound.create({
        data: {
          projectId: item.projectId,
          performedAt: new Date((p["performedAt"] as string) ?? item.capturedAt),
          participants: String(p["participants"] ?? ""),
          findingsCount: Number(p["findingsCount"] ?? 0),
          notes: (p["notes"] as string) ?? null,
          photoDocIds: (p["photoDocIds"] as string[]) ?? [],
          source: "APP",
          appSyncId: item.syncId,
          createdById: userId,
        },
      });
      return "saved";

    case "fuel":
      await prisma.fuelUsage.create({
        data: {
          projectId: item.projectId,
          machineId: (p["machineId"] as string) ?? null,
          machineName: String(p["machineName"] ?? "ukjent maskin"),
          ownership: (p["ownership"] as never) ?? "OWNED",
          subcontractorOrgId: (p["subcontractorOrgId"] as string) ?? null,
          fuelType: (p["fuelType"] as never) ?? "DIESEL",
          amount: Number(p["amount"] ?? 0),
          periodStart: new Date((p["periodStart"] as string) ?? item.capturedAt),
          periodEnd: new Date((p["periodEnd"] as string) ?? item.capturedAt),
          source: "APP",
          appSyncId: item.syncId,
          createdById: userId,
        },
      });
      return "saved";

    default:
      throw new Error("Ukjent type: " + item.type);
  }
}
