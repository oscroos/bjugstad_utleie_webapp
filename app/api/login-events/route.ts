import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const events = await prisma.userLoginEvent.findMany({
      orderBy: { loggedAt: "desc" },
      take: 200,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Failed to fetch login events", error);
    return NextResponse.json(
      { error: "Kunne ikke hente innloggingshendelser" },
      { status: 500 },
    );
  }
}
