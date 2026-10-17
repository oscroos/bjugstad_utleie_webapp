import "server-only";

import { createHash } from "node:crypto";
import type { MachineOperatingStatus, TelemetryProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  deriveOperatingStatus,
  GPS_INGEST_PROVIDERS,
  type NormalizedGpsPayload,
} from "@/lib/telemetry/contract";
import { assignProjectForPosition } from "@/lib/telemetry/project-assignment";
import { evaluatePositionForZones } from "@/lib/telemetry/zone-evaluator";

export type GpsIngestionResult =
  | {
      status: "unknown_device";
      received: number;
    }
  | {
      status: "ambiguous_device";
      received: number;
    }
  | {
      status: "stored";
      machineId: string;
      provider: TelemetryProvider;
      received: number;
      stored: number;
      duplicates: number;
      latestPositionUpdated: boolean;
      projectAssignment: "not_configured";
      zoneEvaluation: "phase_6_not_implemented" | "project_not_assigned";
    };

export async function ingestNormalizedGpsPayload(
  payload: NormalizedGpsPayload,
): Promise<GpsIngestionResult> {
  const providers = payload.provider ? [payload.provider] : [...GPS_INGEST_PROVIDERS];
  const links = await prisma.machineTelemetryLink.findMany({
    where: {
      externalId: payload.deviceImei,
      provider: { in: providers },
      active: true,
    },
    select: {
      id: true,
      machineId: true,
      provider: true,
      lastSeenAt: true,
    },
    take: 2,
  });

  if (links.length === 0) {
    return { status: "unknown_device", received: payload.records.length };
  }
  if (links.length > 1) {
    return { status: "ambiguous_device", received: payload.records.length };
  }

  const link = links[0];
  const source = link.provider.toLowerCase();
  const prepared = await Promise.all(
    payload.records.map(async (record) => {
      const reportedAt = new Date(record.at);
      const assignment = await assignProjectForPosition({
        machineId: link.machineId,
        reportedAt,
        latitude: record.lat,
        longitude: record.lng,
      });
      const operatingStatus = deriveOperatingStatus(record.ignition, record.speedKmh);

      return { record, reportedAt, assignment, operatingStatus };
    }),
  );

  const latest = prepared.reduce((current, candidate) =>
    candidate.reportedAt > current.reportedAt ? candidate : current,
  );

  const transactionResult = await prisma.$transaction(async (tx) => {
    const inserted = await tx.machinePositionHistory.createMany({
      data: prepared.map(({ record, reportedAt, assignment, operatingStatus }) => ({
        machineId: link.machineId,
        projectId: assignment.projectId,
        telemetryLinkId: link.id,
        source,
        providerEventId: record.eventId ?? deriveProviderEventId(record),
        reportedAt,
        latitude: record.lat,
        longitude: record.lng,
        altitude: record.altitude ?? null,
        speed: record.speedKmh ?? null,
        heading: record.heading ?? null,
        km: record.distanceKm ?? null,
        ignition: record.ignition,
        operatingStatus: operatingStatus as MachineOperatingStatus,
        engineHours: record.engineHours ?? null,
        fuelLiters: record.fuelLiters ?? null,
        energyKwh: record.energyKwh ?? null,
        payloadTonnes: record.payloadTonnes ?? null,
      })),
      skipDuplicates: true,
    });

    const latestUpdate = await tx.machine.updateMany({
      where: {
        id: link.machineId,
        OR: [
          { lastPosReportedAt: null },
          { lastPosReportedAt: { lt: latest.reportedAt } },
        ],
      },
      data: {
        lastPosReportedAt: latest.reportedAt,
        lastPosLatitude: latest.record.lat,
        lastPosLongitude: latest.record.lng,
        altitude: latest.record.altitude ?? null,
        speed: latest.record.speedKmh ?? null,
        heading: latest.record.heading ?? null,
        km: latest.record.distanceKm ?? null,
        ignition: latest.record.ignition,
        operatingStatus: latest.operatingStatus as MachineOperatingStatus,
        lastPositionSource: source,
      },
    });

    const newestSeenAt =
      !link.lastSeenAt || latest.reportedAt > link.lastSeenAt
        ? latest.reportedAt
        : link.lastSeenAt;
    await tx.machineTelemetryLink.update({
      where: { id: link.id },
      data: {
        lastSeenAt: newestSeenAt,
        lastSyncAt: new Date(),
      },
    });

    return {
      stored: inserted.count,
      latestPositionUpdated: latestUpdate.count > 0,
    };
  });

  const zoneResults = await Promise.all(
    prepared.map(({ record, reportedAt, assignment, operatingStatus }) =>
      evaluatePositionForZones({
        projectId: assignment.projectId,
        machineId: link.machineId,
        reportedAt,
        latitude: record.lat,
        longitude: record.lng,
        speedKmh: record.speedKmh ?? null,
        operatingStatus,
      }),
    ),
  );

  return {
    status: "stored",
    machineId: link.machineId,
    provider: link.provider,
    received: payload.records.length,
    stored: transactionResult.stored,
    duplicates: payload.records.length - transactionResult.stored,
    latestPositionUpdated: transactionResult.latestPositionUpdated,
    projectAssignment: "not_configured",
    zoneEvaluation: zoneResults[0]?.reason ?? "project_not_assigned",
  };
}

export function maskDeviceIdentifier(value: string): string {
  const visible = value.slice(-4);
  return `${"*".repeat(Math.max(0, value.length - visible.length))}${visible}`;
}

function deriveProviderEventId(record: NormalizedGpsPayload["records"][number]): string {
  const fingerprint = JSON.stringify([
    record.at,
    record.lat,
    record.lng,
    record.altitude ?? null,
    record.speedKmh ?? null,
    record.heading ?? null,
    record.ignition,
    record.distanceKm ?? null,
    record.engineHours ?? null,
    record.fuelLiters ?? null,
    record.energyKwh ?? null,
    record.payloadTonnes ?? null,
  ]);
  return `derived:${createHash("sha256").update(fingerprint).digest("hex")}`;
}
