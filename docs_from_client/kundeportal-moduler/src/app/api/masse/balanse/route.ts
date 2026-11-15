import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { masseBalanse } from "@/lib/masse/balanse";

// GET /api/masse/balanse?groupBy=project|city|org
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const g = new URL(req.url).searchParams.get("groupBy");
  const groupBy = g === "city" || g === "org" ? g : "project";
  const rows = await masseBalanse(session.user.organizationId, groupBy);
  return NextResponse.json({ groupBy, rows });
}
