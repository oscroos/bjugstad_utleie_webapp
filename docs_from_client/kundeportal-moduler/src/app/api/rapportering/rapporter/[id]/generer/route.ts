import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { genererRapportTekst } from "@/lib/ai/report-generator";

type Params = { params: Promise<{ id: string }> };

// POST /api/rapportering/rapporter/:id/generer
// Body: { fields: [{ label, value, source }], periodLabel }
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const { id } = await params;

  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      requirement: true,
      project: { select: { name: true, projectNumber: true, organizationId: true } },
    },
  });
  if (!report || report.project.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  }

  const body = await req.json();

  let tekst: string;
  try {
    tekst = await genererRapportTekst({
      requirementTitle: report.requirement?.title ?? report.title,
      source: report.requirement?.source ?? "CONTRACT",
      legalReference: report.requirement?.legalReference,
      recipientInstance: report.requirement?.recipientInstance,
      recipientName: report.requirement?.recipientName,
      periodLabel: body.periodLabel,
      fields: body.fields ?? [],
      projectName: report.project.name,
      projectNumber: report.project.projectNumber,
    });
  } catch (err) {
    console.error("Rapportgenerering feilet:", err);
    return NextResponse.json({ error: "Kunne ikke generere tekst." }, { status: 502 });
  }

  const updated = await prisma.report.update({
    where: { id },
    data: { generatedBody: tekst, status: "READY" },
  });

  return NextResponse.json({ report: updated, generatedBody: tekst });
}
