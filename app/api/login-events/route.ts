import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadLoginEventsForAdmin } from "@/lib/login-events";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { events, error } = await loadLoginEventsForAdmin();

  if (error) {
    console.error("Failed to fetch login events", error);
    return NextResponse.json(
      { error: "Kunne ikke hente innloggingshendelser" },
      { status: 500 },
    );
  }

  return NextResponse.json({ events });
}
