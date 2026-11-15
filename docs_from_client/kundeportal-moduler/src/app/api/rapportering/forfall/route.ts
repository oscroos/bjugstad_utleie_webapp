import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectAccess } from "@/lib/prosjekter/queries";
import { nesteForfall, klassifiser } from "@/lib/rapportering/scheduling";
import type { ReportInterval } from "@/lib/types";

// GET /api/rapportering/forfall?projectId=...&dager=90
// Regner ut neste forfall for hvert aktivt krav og klassifiserer det.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });

  const access = await assertProjectAccess(projectId, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const requirements = await prisma.reportingRequirement.findMany({
    where: { projectId, status: "ACTIVE" },
    select: {
      id: true,
      title: true,
      source: true,
      interval: true,
      scheduleAnchor: true,
      recipientInstance: true,
      createdAt: true,
    },
  });

  const naa = new Date();
  const rows = requirements
    .map((r) => {
      const anchor = r.scheduleAnchor ?? r.createdAt;
      const due = nesteForfall(r.interval as ReportInterval, anchor, naa);
      if (!due) return null; // hendelsesstyrt/engangs uten fremtidig forfall
      return {
        requirementId: r.id,
        title: r.title,
        source: r.source,
        interval: r.interval,
        recipientInstance: r.recipientInstance,
        dueDate: due.toISOString(),
        status: klassifiser(due, naa),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a!.dueDate < b!.dueDate ? -1 : 1));

  return NextResponse.json({
    overdue: rows.filter((r) => r!.status === "OVERDUE"),
    dueSoon: rows.filter((r) => r!.status === "DUE_SOON"),
    upcoming: rows.filter((r) => r!.status === "UPCOMING"),
  });
}
