import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { vurderVersjon } from "@/lib/standarder/registry";

// GET /api/standarder/sjekk?codes=NS 8407,NS 8405
// Returnerer versjonsstatus for hver kode: har vi X, siste er Y, utdatert?
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });

  const codes = (new URL(req.url).searchParams.get("codes") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (codes.length === 0) return NextResponse.json({ results: [] });

  const standards = await prisma.standard.findMany({
    where: { code: { in: codes } },
    include: { versions: { select: { version: true } } },
  });

  const results = codes.map((code) => {
    const s = standards.find((x) => x.code === code);
    if (!s) {
      return { code, title: null, found: false, message: `${code}: ikke i biblioteket ennå.` };
    }
    const status = vurderVersjon(code, s.title, s.versions.map((v) => v.version), s.latestKnownVersion);
    return { ...status, found: true };
  });

  return NextResponse.json({ results });
}
