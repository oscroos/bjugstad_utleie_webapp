import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { versjonsVerdi } from "@/lib/standarder/registry";

type Params = { params: Promise<{ id: string }> };

// POST /api/standarder/:id/versjoner
// Body (LINK):   { version, accessType:"LINK", sourceUrl }
// Body (UPLOAD): { version, accessType:"UPLOAD", documentId, fileName, extractedText, shareToCommon }
//
// shareToCommon = eksplisitt samtykke til at innholdet beriker fellesbiblioteket.
// Uten samtykke lagres versjonen, men innhold deles IKKE på tvers av kunder.
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }
  const { id } = await params;

  const standard = await prisma.standard.findUnique({
    where: { id },
    include: { versions: true },
  });
  if (!standard) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });

  const body = await req.json();
  const { version, accessType } = body ?? {};
  if (!version?.trim() || !accessType) {
    return NextResponse.json({ error: "version og accessType er påkrevd." }, { status: 400 });
  }

  const shareToCommon = Boolean(body.shareToCommon);

  // Er dette den nyeste versjonen vi nå har?
  const maxHeld = Math.max(-1, ...standard.versions.map((v) => versjonsVerdi(v.version)));
  const blirNyeste = versjonsVerdi(version) >= maxHeld;

  const result = await prisma.$transaction(async (tx) => {
    if (blirNyeste) {
      await tx.standardVersion.updateMany({
        where: { standardId: id },
        data: { isLatestHeld: false },
      });
    }

    const created = await tx.standardVersion.create({
      data: {
        standardId: id,
        version: version.trim(),
        publishedDate: body.publishedDate ? new Date(body.publishedDate) : null,
        accessType,
        sourceUrl: accessType === "LINK" ? body.sourceUrl ?? null : null,
        documentId: accessType === "UPLOAD" ? body.documentId ?? null : null,
        fileName: accessType === "UPLOAD" ? body.fileName ?? null : null,
        // Innhold lagres kun hvis delt (fellesbibliotek). Ellers holdes det privat.
        extractedText: shareToCommon ? body.extractedText ?? null : null,
        isLatestHeld: blirNyeste,
        uploadedByOrgId: session.user.organizationId,
        contributedToShared: shareToCommon,
      },
    });

    // Beriker fellesbasen KUN ved eksplisitt samtykke.
    if (shareToCommon && body.extractedText) {
      await tx.sharedKnowledgeDoc.create({
        data: {
          title: `${standard.code} v${version}`,
          kind: "standard",
          sourceOrgId: session.user.organizationId,
          standardCode: standard.code,
          text: body.extractedText,
          consentGiven: true,
        },
      });
    }

    return created;
  });

  return NextResponse.json({ version: result, sharedToCommon: shareToCommon }, { status: 201 });
}
