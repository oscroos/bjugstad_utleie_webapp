import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectAccess } from "@/lib/prosjekter/queries";

// GET /api/rapportering/rapporter?projectId=...
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });
  const access = await assertProjectAccess(projectId, session.user.organizationId);
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const reports = await prisma.report.findMany({
    where: { projectId },
    include: { requirement: { select: { title: true, source: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ reports });
}

// POST /api/rapportering/rapporter
// Setter opp en rapport fra et krav. Skiller datafeltene i to bøtter:
//  - autofilled: hentes fra portalen (maskiner/avtaler/dokumenter)
//  - manualNeeded: kunden må fylle inn (leveres tilbake til UI)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const body = await req.json();
  const { requirementId, periodStart, periodEnd } = body ?? {};
  if (!requirementId) {
    return NextResponse.json({ error: "Mangler requirementId." }, { status: 400 });
  }

  const requirement = await prisma.reportingRequirement.findUnique({
    where: { id: requirementId },
    include: {
      dataFields: true,
      project: { select: { id: true, organizationId: true, projectNumber: true } },
    },
  });
  if (requirement?.project.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  }

  const autofilled = requirement.dataFields.filter((f) => f.availableInPortal);
  const manualNeeded = requirement.dataFields.filter((f) => !f.availableInPortal);

  const report = await prisma.report.create({
    data: {
      projectId: requirement.project.id,
      requirementId: requirement.id,
      title: `${requirement.title} – ${requirement.project.projectNumber}`,
      periodStart: periodStart ? new Date(periodStart) : null,
      periodEnd: periodEnd ? new Date(periodEnd) : null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      status: "DRAFT",
      content: {
        recipientInstance: requirement.recipientInstance,
        recipientName: requirement.recipientName,
        // Autofelt fylles med verdier fra portalen i et senere steg (se context.ts).
        autofilled: autofilled.map((f) => ({ label: f.label, sourceRef: f.sourceRef, value: null })),
        manualInputs: manualNeeded.map((f) => ({ label: f.label, note: f.note, value: null })),
      },
      createdById: session.user.id,
    },
  });

  return NextResponse.json(
    {
      report,
      autofilled: autofilled.map((f) => ({ label: f.label, sourceType: f.sourceType, sourceRef: f.sourceRef })),
      manualNeeded: manualNeeded.map((f) => ({ label: f.label, note: f.note, required: f.required })),
    },
    { status: 201 }
  );
}
