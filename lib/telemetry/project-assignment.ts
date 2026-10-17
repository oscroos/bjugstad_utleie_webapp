export type ProjectAssignmentResult = {
  projectId: string | null;
  reason: "not_configured";
};

export async function assignProjectForPosition(params: {
  machineId: string;
  reportedAt: Date;
  latitude: number;
  longitude: number;
}): Promise<ProjectAssignmentResult> {
  void params;
  return { projectId: null, reason: "not_configured" };
}
