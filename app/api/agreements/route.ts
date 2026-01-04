import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RentalMachine = {
  machineId?: number;
  make?: string | null;
  model?: string | null;
  number?: string | null;
};

type Rental = {
  rentalId?: number;
  customerId?: number;
  customerName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  machines?: RentalMachine[] | null;
};

export type AgreementPayload = {
  id: string;
  customerId?: number;
  customerName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  machines?: Array<{ id?: string; name?: string | null }>;
};

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;

  // Admin placeholder until full-portal agreement API exists
  if (role === "super_admin") {
    return NextResponse.json({
      active: [],
      historical: [],
      placeholder: true,
      message: "Admin-wide avtaleoppslag er ikke implementert enda.",
    });
  }

  if (role !== "customer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey =
    process.env.BJUGSTAD_API_KEY_PRIMARY?.trim() ||
    process.env.BJUGSTAD_API_KEY_SECONDARY?.trim();
  const baseUrl = process.env.BJUGSTAD_API_BASEURL?.trim();

  if (!apiKey || !baseUrl) {
    console.error("Missing Bjugstad API configuration for agreements");
    return NextResponse.json(
      { error: "Mangler konfigurasjon for Bjugstad API" },
      { status: 500 },
    );
  }

  const accessibleCustomers = await prisma.userCustomerAccess.findMany({
    where: { userId: session.user.id },
    select: { customerId: true },
  });

  const customerIds = [...new Set(accessibleCustomers.map((c) => c.customerId).filter(Boolean))];

  if (!customerIds.length) {
    return NextResponse.json({ active: [], historical: [] });
  }

  try {
    const results = await Promise.all(
      customerIds.map((customerId) => fetchCustomerAgreements(baseUrl, apiKey, customerId)),
    );

    const allAgreements = results.flat();
    const now = Date.now();

    const active: AgreementPayload[] = [];
    const historical: AgreementPayload[] = [];

    for (const agreement of allAgreements) {
      const endDate = agreement.endDate ? new Date(agreement.endDate) : null;
      const isHistorical = endDate && !Number.isNaN(endDate.getTime()) && endDate.getTime() < now;
      (isHistorical ? historical : active).push(agreement);
    }

    return NextResponse.json({ active, historical });
  } catch (error) {
    console.error("Failed to fetch agreements", error);
    return NextResponse.json(
      { error: "Kunne ikke hente avtaler" },
      { status: 502 },
    );
  }
}

async function fetchCustomerAgreements(baseUrl: string, apiKey: string, customerId: number) {
  const url = `${baseUrl.replace(/\/$/, "")}/GetRentalsByCustomerId?customerId=${customerId}`;

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Ocp-Apim-Subscription-Key": apiKey,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to fetch agreements for customer ${customerId}: ${response.status} ${body}`);
  }

  const data = (await response.json()) as Rental[];
  if (!Array.isArray(data)) return [];

  return data.map((rental): AgreementPayload => ({
    id: String(rental.rentalId ?? `${customerId}-${Math.random().toString(36).slice(2, 8)}`),
    customerId: rental.customerId ?? customerId,
    customerName: rental.customerName ?? null,
    startDate: rental.startDate ?? null,
    endDate: rental.endDate ?? null,
    machines: (rental.machines ?? []).map((machine) => ({
      id: machine.machineId !== undefined ? String(machine.machineId) : undefined,
      name: formatMachineLabel(machine),
    })),
  }));
}

function formatMachineLabel(machine: RentalMachine) {
  const parts = [machine.make, machine.model, machine.number].filter(Boolean).map((part) => String(part));
  const label = parts.join(" ").trim();
  return label || (machine.machineId !== undefined ? `Maskin ${machine.machineId}` : "Maskin");
}
