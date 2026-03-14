import { prisma } from "@/lib/prisma";
import { normalizeError, type AppError } from "@/lib/errors";

export type LoginEventPayload = {
  id: string;
  provider: string | null;
  loggedAt: string;
  user: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    role: string | null;
  } | null;
};

export type LoginEventsResult = {
  events: LoginEventPayload[];
  error: AppError | null;
};

export async function loadLoginEventsForAdmin(): Promise<LoginEventsResult> {
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

    return {
      events: events.map((event) => ({
        id: event.id,
        provider: event.provider,
        loggedAt: event.loggedAt.toISOString(),
        user: event.user
          ? {
              id: event.user.id,
              name: event.user.name,
              phone: event.user.phone,
              email: event.user.email,
              role: event.user.role,
            }
          : null,
      })),
      error: null,
    };
  } catch (error) {
    return {
      events: [],
      error: normalizeError(error, {
        title: "Kunne ikke hente innloggingsaktivitet",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Vi klarte ikke hente innloggingsaktivitet akkurat na.",
      }),
    };
  }
}
