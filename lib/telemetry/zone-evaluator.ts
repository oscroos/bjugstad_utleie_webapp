export type ZoneEvaluationResult = {
  evaluated: false;
  reason: "phase_6_not_implemented" | "project_not_assigned";
};

export async function evaluatePositionForZones(params: {
  projectId: string | null;
  machineId: string;
  reportedAt: Date;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  operatingStatus: "WORKING" | "IDLE" | "OFF";
}): Promise<ZoneEvaluationResult> {
  return {
    evaluated: false,
    reason: params.projectId ? "phase_6_not_implemented" : "project_not_assigned",
  };
}
