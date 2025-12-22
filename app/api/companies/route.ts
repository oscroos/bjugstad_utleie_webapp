import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 500;
const SEARCH_LIMIT = 50;

export async function GET(request: Request) {
  try {
    console.log("Received request to fetch companies");
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";

    const companies = await prisma.customer.findMany({
      where: query
        ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { organization_number: { contains: query, mode: "insensitive" } },
          ],
        }
        : undefined,
      select: {
        customer_id: true,
        name: true,
        organization_number: true,
      },
      orderBy: { name: "asc" },
      take: query ? SEARCH_LIMIT : DEFAULT_LIMIT,
    });

    return NextResponse.json({
      companies: companies.map((company) => ({
        id: company.customer_id,
        name: company.name,
        organizationNumber: company.organization_number,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch companies", error);
    return NextResponse.json(
      { error: "Kunne ikke hente selskaper" },
      { status: 500 },
    );
  }
}
