import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyserRapporteringskrav } from "@/lib/ai/reporting-analyzer";
import { hentProsjektKontekst } from "@/lib/rapportering/context";
import { requireProjectRole, checkAiQuota, recordAiUsage, hashInput, audit } from "@/lib/sikkerhet/guard";

// POST /api/rapportering/analyser   body: { projectId }
// Samler prosjektkonteksten, kjører AI-analysen og lagrer krav som PROPOSED.
// Sikret med: rollehåndhevelse (MEMBER+), dagskvote og input-cache.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }

  const { projectId } = (await req.json()) ?? {};
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });

  const access = await requireProjectRole(
    projectId, session.user.id, session.user.organizationId, "MEMBER"
  );
  if (!access) return NextResponse.json({ error: "Ikke funnet eller manglende rolle." }, { status: 404 });

  // 1) Bygg kontekst fra portalen (maskiner, NS-standarder, kontraktdokumenter)
  const ctx = await hentProsjektKontekst(projectId);

  // Kvote + cache: hash av dokumentsett + standarder = samme input → gjenbruk
  const inputHash = hashInput([
    projectId,
    ...ctx.contractDocuments.map((d) => d.fileName + ":" + d.text.length),
    ...ctx.nsStandards.map((s) => s.standardNo + (s.clause ?? "")),
  ]);
  const quota = await checkAiQuota(session.user.organizationId, "analyse", inputHash);
  if (quota.cachedResultRef) {
    // Identisk input er analysert nylig – kravene ligger allerede lagret.
    return NextResponse.json({
      summary: "Uendret grunnlag siden forrige analyse – eksisterende krav gjelder.",
      cached: true,
    });
  }
  if (!quota.allowed) {
    return NextResponse.json(
      { error: "Dagskvoten for AI-analyser er brukt opp. Prøv igjen i morgen." },
      { status: 429 }
    );
  }

  // 2) Kjør AI-analysen
  let result;
  try {
    result = await analyserRapporteringskrav(ctx);
  } catch (err) {
    console.error("AI-analyse feilet:", err);
    return NextResponse.json(
      { error: "AI-analysen feilet. Prøv igjen." },
      { status: 502 }
    );
  }

  // 3) Lagre hvert krav som PROPOSED med tilhørende datafelt
  const created = await prisma.$transaction(
    result.requirements.map((r) =>
      prisma.reportingRequirement.create({
        data: {
          projectId,
          source: r.source,
          title: r.title,
          description: r.description,
          legalReference: r.legalReference ?? null,
          interval: r.interval,
          intervalDetail: r.intervalDetail ?? null,
          recipientInstance: r.recipientInstance ?? null,
          recipientName: r.recipientName ?? null,
          recipientEmail: r.recipientEmail ?? null,
          origin: "AI_SUGGESTED",
          aiConfidence: r.aiConfidence,
          aiRationale: r.aiRationale,
          status: "PROPOSED",
          dataFields: {
            create: r.dataFields.map((f) => ({
              label: f.label,
              sourceType: f.sourceType,
              sourceRef: f.sourceRef ?? null,
              availableInPortal: f.availableInPortal,
              required: f.required,
              note: f.note ?? null,
            })),
          },
        },
        include: { dataFields: true },
      })
    )
  );

  // Marker dratt-inn dokumenter som analysert
  await prisma.projectContractDocument.updateMany({
    where: { projectId },
    data: { analyzed: true, analyzedAt: new Date() },
  });

  // Kvote-registrering (med cache-nøkkel) + audit
  await recordAiUsage(session.user.organizationId, "analyse", inputHash, projectId);
  await audit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "reporting.analyse",
    entityType: "Project",
    entityId: projectId,
    metadata: { requirementsCreated: created.length },
  });

  return NextResponse.json({ summary: result.summary, requirements: created });
}
