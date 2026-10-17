import "server-only";

import { prisma } from "@/lib/prisma";
import {
  normalizedTelemetrySnapshotSchema,
  type NormalizedTelemetrySnapshot,
} from "@/lib/telemetry/contract";

export async function upsertTelemetrySnapshot(input: NormalizedTelemetrySnapshot) {
  const snapshot = normalizedTelemetrySnapshotSchema.parse(input);
  const periodStart = new Date(snapshot.periodStart);
  const periodEnd = new Date(snapshot.periodEnd);
  const values = {
    projectId: snapshot.projectId ?? null,
    engineHours: snapshot.engineHours ?? null,
    idleHours: snapshot.idleHours ?? null,
    fuelLiters: snapshot.fuelLiters ?? null,
    energyKwh: snapshot.energyKwh ?? null,
    distanceKm: snapshot.distanceKm ?? null,
    payloadTonnes: snapshot.payloadTonnes ?? null,
    calculationMethod: snapshot.calculationMethod,
  };

  return prisma.machineTelemetrySnapshot.upsert({
    where: {
      machineId_provider_periodStart_periodEnd: {
        machineId: snapshot.machineId,
        provider: snapshot.provider,
        periodStart,
        periodEnd,
      },
    },
    update: values,
    create: {
      machineId: snapshot.machineId,
      provider: snapshot.provider,
      periodStart,
      periodEnd,
      ...values,
    },
  });
}
