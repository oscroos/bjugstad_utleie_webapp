import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { complianceOversikt } from "@/lib/compliance/status";

// GET /api/compliance → rød/gul/grønn på tvers av alle prosjekter
export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const data = await complianceOversikt(session.user.organizationId);
  return NextResponse.json(data);
}
