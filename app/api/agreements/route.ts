import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchAgreementsForUser, splitAgreementsByStatus } from "@/lib/agreements";

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

  try {
    const allAgreements = await fetchAgreementsForUser(session.user.id, role);
    const { active, historical } = splitAgreementsByStatus(allAgreements);
    return NextResponse.json({ active, historical });
  } catch (error) {
    console.error("Failed to fetch agreements", error);
    return NextResponse.json(
      { error: "Kunne ikke hente avtaler" },
      { status: 502 },
    );
  }
}
