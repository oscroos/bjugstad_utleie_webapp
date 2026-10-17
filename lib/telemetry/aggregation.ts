export type StatusObservation = {
  reportedAt: Date;
  operatingStatus: "WORKING" | "IDLE" | "OFF";
};

export type StatusDurationSummary = {
  engineHours: number;
  idleHours: number;
  ignoredGapHours: number;
};

export function aggregateStatusDurations(
  observations: StatusObservation[],
  maxGapMinutes: number,
): StatusDurationSummary {
  if (!Number.isFinite(maxGapMinutes) || maxGapMinutes <= 0) {
    throw new Error("maxGapMinutes must be greater than zero");
  }

  const sorted = [...observations].sort(
    (left, right) => left.reportedAt.getTime() - right.reportedAt.getTime(),
  );

  let engineMilliseconds = 0;
  let idleMilliseconds = 0;
  let ignoredMilliseconds = 0;
  const maxGapMilliseconds = maxGapMinutes * 60_000;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    const duration = next.reportedAt.getTime() - current.reportedAt.getTime();
    if (duration <= 0) continue;

    if (duration > maxGapMilliseconds) {
      ignoredMilliseconds += duration;
      continue;
    }

    if (current.operatingStatus !== "OFF") engineMilliseconds += duration;
    if (current.operatingStatus === "IDLE") idleMilliseconds += duration;
  }

  return {
    engineHours: engineMilliseconds / 3_600_000,
    idleHours: idleMilliseconds / 3_600_000,
    ignoredGapHours: ignoredMilliseconds / 3_600_000,
  };
}
