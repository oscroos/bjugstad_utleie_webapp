import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadAgreementsForUser } from "@/lib/agreements";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;

  const isAdmin = role === "super_admin";

  if (!isAdmin && role !== "customer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { active, historical, error } = await loadAgreementsForUser(session.user.id, role);

  if (error) {
    console.error("Failed to fetch agreements", error);
    return NextResponse.json(
      { error: "Kunne ikke hente avtaler" },
      { status: 502 },
    );
  }

  return NextResponse.json({ active, historical });
}
