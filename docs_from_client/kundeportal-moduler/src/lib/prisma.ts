// REFERANSE – behold deres eksisterende @/lib/prisma hvis dere allerede har en.
// Singleton for å unngå at hot-reload i dev åpner nye tilkoblinger.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
