import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireProjectRole } from "@/lib/sikkerhet/guard";
import { eksporterTimerCsv } from "@/lib/tid/timer";

// GET /api/eksport?type=timer&projectId=...&from=...&to=...
// CSV til lønn (Visma/Tripletex-vennlig). Power BI/Excel: alle GET-API-er er
// rene JSON og kan konsumeres direkte; ERP-push er AP-10.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const projectId = p.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Mangler projectId." }, { status: 400 });
  const access = await requireProjectRole(projectId, session.user.id, session.user.organizationId, "PROJECT_MANAGER");
  if (!access) return NextResponse.json({ error: "Krever prosjektleder." }, { status: 403 });

  if (p.get("type") === "timer") {
    const from = new Date(p.get("from") ?? Date.now() - 14 * 86_400_000);
    const to = new Date(p.get("to") ?? Date.now());
    const csv = await eksporterTimerCsv(projectId, from, to);
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=timer.csv" } });
  }
  return NextResponse.json({ error: "Ukjent type." }, { status: 400 });
}
