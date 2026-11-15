import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { beregnKoordinering } from "@/lib/masse/koordinering";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  return NextResponse.json(await beregnKoordinering(session.user.organizationId));
}
