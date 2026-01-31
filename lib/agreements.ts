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
    machines?: Array<{ id?: string; name?: string | null; make?: string | null }>;
};

export async function fetchAgreementsForUser(userId: string, role?: string | null) {
    const isAdmin = role === "super_admin";
    if (!isAdmin && role !== "customer") {
        throw new Error("Forbidden");
    }

    const apiKey =
        process.env.BJUGSTAD_API_KEY_PRIMARY?.trim() ||
        process.env.BJUGSTAD_API_KEY_SECONDARY?.trim();
    const baseUrl = process.env.BJUGSTAD_API_BASEURL?.trim();

    if (!apiKey || !baseUrl) {
        throw new Error("Mangler konfigurasjon for Bjugstad API");
    }

    if (isAdmin) {
        return fetchAllAgreements(baseUrl, apiKey);
    }

    const accessibleCustomers = await prisma.userCustomerAccess.findMany({
        where: { userId },
        select: { customerId: true },
    });

    const customerIds = [...new Set(accessibleCustomers.map((c) => c.customerId).filter(Boolean))];

    if (!customerIds.length) {
        return [];
    }

    const results = await Promise.all(
        customerIds.map((customerId) => fetchCustomerAgreements(baseUrl, apiKey, customerId)),
    );

    return results.flat();
}

export function splitAgreementsByStatus(agreements: AgreementPayload[]) {
    const now = Date.now();
    const active: AgreementPayload[] = [];
    const historical: AgreementPayload[] = [];

    for (const agreement of agreements) {
        const endDate = agreement.endDate ? new Date(agreement.endDate) : null;
        const isHistorical = endDate && !Number.isNaN(endDate.getTime()) && endDate.getTime() < now;
        (isHistorical ? historical : active).push(agreement);
    }

    return { active, historical };
}

async function fetchAllAgreements(baseUrl: string, apiKey: string) {
    const url = `${baseUrl.replace(/\/$/, "")}/GetRentals`;
    const rentals = await requestRentals(url, apiKey, "Failed to fetch agreements for admin");
    return rentals.map((rental) => mapRentalToAgreement(rental));
}

async function fetchCustomerAgreements(baseUrl: string, apiKey: string, customerId: number) {
    const url = `${baseUrl.replace(/\/$/, "")}/GetRentalsByCustomerId?customerId=${customerId}`;
    const rentals = await requestRentals(
        url,
        apiKey,
        `Failed to fetch agreements for customer ${customerId}`,
    );
    return rentals.map((rental) => mapRentalToAgreement(rental, customerId));
}

async function requestRentals(url: string, apiKey: string, errorPrefix: string): Promise<Rental[]> {
    const response = await fetch(url, {
        cache: "no-store",
        headers: {
            Accept: "application/json",
            "Ocp-Apim-Subscription-Key": apiKey,
        },
    });

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`${errorPrefix}: ${response.status} ${body}`);
    }

    const data = (await response.json()) as Rental[];
    return Array.isArray(data) ? data : [];
}

function mapRentalToAgreement(rental: Rental, fallbackCustomerId?: number): AgreementPayload {
    const customerId = rental.customerId ?? fallbackCustomerId;
    const idSeed = customerId ?? "rental";
    const fallbackId = `${idSeed}-${Math.random().toString(36).slice(2, 8)}`;

    return {
        id: String(rental.rentalId ?? fallbackId),
        customerId: customerId,
        customerName: rental.customerName ?? null,
        startDate: rental.startDate ?? null,
        endDate: rental.endDate ?? null,
        machines: (rental.machines ?? []).map((machine) => ({
            id: machine.machineId !== undefined ? String(machine.machineId) : undefined,
            name: formatMachineLabel(machine),
            make: machine.make ?? null,
        })),
    };
}

function formatMachineLabel(machine: RentalMachine) {
    const parts = [machine.make, machine.model, machine.number].filter(Boolean).map((part) => String(part));
    const label = parts.join(" ").trim();
    return label || (machine.machineId !== undefined ? `Maskin ${machine.machineId}` : "Maskin");
}
