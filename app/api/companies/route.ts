import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    console.log("Received request to fetch companies");
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";

    const orConditions = [
      { name: { contains: query, mode: "insensitive" } },
      { organization_number: { contains: query, mode: "insensitive" } },
    ];
    const numericQuery = Number(query);
    if (!Number.isNaN(numericQuery)) {
      orConditions.push({ customer_id: numericQuery });
    }

    const companies = await prisma.customer.findMany({
      where: query ? { OR: orConditions } : undefined,
      select: {
        customer_id: true,
        name: true,
        organization_number: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      companies: companies.map((company) => ({
        id: company.customer_id,
        customerId: company.customer_id,
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
