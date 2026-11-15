import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireProjectRole } from "@/lib/sikkerhet/guard";
import { hentKartData } from "@/lib/kart/posisjoner";

// GET /api/kart?projectId=... → alt kartet trenger i ett kall
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });
  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "VIEWER");
  if (!access) return NextResponse.json({ error: "Ikke funnet" }, { status: 404 });
  return NextResponse.json(await hentKartData(projectId));
}
