import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { spørMinijurist } from "@/lib/ai/minijurist";
import { vurderVersjon } from "@/lib/standarder/registry";

// POST /api/minijuristen/spor  body: { threadId, question }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });

  const { threadId, question } = (await req.json()) ?? {};
  if (!threadId || !question?.trim()) {
    return NextResponse.json({ error: "threadId og spørsmål er påkrevd." }, { status: 400 });
  }

  const thread = await prisma.minijuristThread.findUnique({
    where: { id: threadId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      project: {
        select: {
          id: true, name: true, projectNumber: true, organizationId: true,
          nsStandards: { select: { standardNo: true } },
          contractDocuments: { select: { documentId: true, fileName: true } },
        },
      },
    },
  });
  if (!thread || thread.project.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  }

  // Fellesbibliotek: hent standardene prosjektet bruker, med versjonsstatus
  const koder = thread.project.nsStandards.map((s) => s.standardNo);
  const standards = await prisma.standard.findMany({
    where: { code: { in: koder } },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });

  const versjonsvarsler = standards.map((s) =>
    vurderVersjon(s.code, s.title, s.versions.map((v) => v.version), s.latestKnownVersion)
  );

  const standarderKtx = standards.map((s) => {
    const nyeste = s.versions.find((v) => v.isLatestHeld) ?? s.versions[0];
    return {
      code: s.code,
      title: s.title,
      version: nyeste?.version ?? null,
      // Kun delbart innhold (contributedToShared) mates til AI som fritekst
      text: nyeste?.contributedToShared ? nyeste.extractedText ?? undefined : undefined,
    };
  });

  // Prosjektets private kontraktdokumenter (tekst hentes fra dokumentlager)
  const kontraktUtdrag = await Promise.all(
    thread.project.contractDocuments.map(async (d) => ({
      fileName: d.fileName ?? d.documentId,
      text: await hentDokumentTekst(d.documentId),
    }))
  );

  let svar;
  try {
    svar = await spørMinijurist({
      projectName: thread.project.name,
      projectNumber: thread.project.projectNumber,
      question,
      historikk: thread.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      standarder: standarderKtx,
      kontraktUtdrag,
      versjonsvarsler,
    });
  } catch (err) {
    console.error("Minijurist feilet:", err);
    return NextResponse.json({ error: "AI-svar feilet. Prøv igjen." }, { status: 502 });
  }

  // Lagre bruker- og assistentmelding
  await prisma.$transaction([
    prisma.minijuristMessage.create({ data: { threadId, role: "user", content: question } }),
    prisma.minijuristMessage.create({
      data: {
        threadId, role: "assistant", content: svar.answer,
        citations: { versionNotices: svar.versionNotices, standards: koder },
      },
    }),
    prisma.minijuristThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } }),
  ]);

  // Berik fellesbasen KUN hvis tråden har eksplisitt samtykke (anonymisert)
  if (thread.shareToKnowledgeBase) {
    await prisma.sharedKnowledgeDoc.create({
      data: {
        title: `Q&A: ${question.slice(0, 60)}`,
        kind: "q&a",
        sourceOrgId: null, // anonymisert
        text: `Spørsmål: ${question}\nSvar: ${svar.answer}`,
        consentGiven: true,
      },
    });
  }

  return NextResponse.json({ answer: svar.answer, versionNotices: svar.versionNotices });
}

// INTEGRASJONSPUNKT: hent uttrukket dokumenttekst fra dokumentlageret.
async function hentDokumentTekst(documentId: string): Promise<string> {
  void documentId;
  return "";
}
