import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMachineLocationHistoryById } from "@/lib/machines";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ machineId: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "customer" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { machineId } = await params;
  const normalizedId = typeof machineId === "string" ? machineId.trim() : "";
  if (!normalizedId) {
    return NextResponse.json({ error: "Ugyldig maskin-id" }, { status: 400 });
  }

  try {
    const history = await getMachineLocationHistoryById(normalizedId);
    return NextResponse.json({ history });
  } catch (error) {
    console.error("Failed to fetch machine location history", error);
    return NextResponse.json(
      { error: "Kunne ikke hente posisjonshistorikk" },
      { status: 500 },
    );
  }
}
