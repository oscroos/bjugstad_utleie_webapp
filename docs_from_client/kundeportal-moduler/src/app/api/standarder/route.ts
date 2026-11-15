import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { vurderVersjon } from "@/lib/standarder/registry";

// GET /api/standarder  → alle standarder + versjonsstatus (vi har X / siste er Y)
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });

  const standards = await prisma.standard.findMany({
    include: { versions: { orderBy: { createdAt: "desc" } } },
    orderBy: [{ type: "asc" }, { code: "asc" }],
  });

  const rows = standards.map((s) => {
    const held = s.versions.map((v) => v.version);
    const status = vurderVersjon(s.code, s.title, held, s.latestKnownVersion);
    return {
      id: s.id,
      type: s.type,
      code: s.code,
      title: s.title,
      publisher: s.publisher,
      officialUrl: s.officialUrl,
      latestKnownVersion: s.latestKnownVersion,
      versions: s.versions.map((v) => ({
        id: v.id, version: v.version, accessType: v.accessType,
        sourceUrl: v.sourceUrl, fileName: v.fileName,
        contributedToShared: v.contributedToShared, isLatestHeld: v.isLatestHeld,
      })),
      versionStatus: status,
    };
  });

  return NextResponse.json({ standards: rows });
}

// POST /api/standarder  → opprett standard (kun leverandøradmin)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  // ANTAKELSE: leverandøradmin markeres med role === "ADMIN" på brukeren.
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Krever administratortilgang." }, { status: 403 });
  }

  const body = await req.json();
  const { type, code, title } = body ?? {};
  if (!type || !code?.trim() || !title?.trim()) {
    return NextResponse.json({ error: "type, kode og tittel er påkrevd." }, { status: 400 });
  }

  const standard = await prisma.standard.create({
    data: {
      type,
      code: code.trim(),
      title: title.trim(),
      publisher: body.publisher ?? null,
      officialUrl: body.officialUrl ?? null,
      latestKnownVersion: body.latestKnownVersion ?? null,
      latestKnownDate: body.latestKnownDate ? new Date(body.latestKnownDate) : null,
    },
  });
  return NextResponse.json({ standard }, { status: 201 });
}
