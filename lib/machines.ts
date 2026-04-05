// lib/machines.ts
import { cache } from "react";
import { query } from "@/lib/db";
import type {
    MachinesFC,
    MachineFeature,
    MachineListEntry,
    MachinesData,
    MachinePositionHistoryEntry,
    MachineAgreementSummary,
} from "@/types/machines";
import { IS_DEV } from "./constants";
import {
    fetchAgreementsForUser,
    splitAgreementsByStatus,
    type AgreementPayload,
} from "@/lib/agreements";

// Fetch machines (with or without coordinates) for the Kart view.
export async function getVisibleMachinesForUser(
    user?: { id?: string | null; role?: string | null } | null,
): Promise<MachinesData> {
    if (!user?.id) {
        return { features: { type: "FeatureCollection", features: [] }, list: [] };
    }

    const isAdmin = user.role === "super_admin";

    if (isAdmin) {
        const list = await getAllMachinesList();
        return { features: buildFeatureCollection(list), list };
    }

    const agreements = await fetchAgreementsForUser(user.id, user.role);
    const { active } = splitAgreementsByStatus(agreements);
    const agreementMachines = collectAgreementMachines(active);
    const dbIds = agreementMachines
        .filter((m) => !m.isSynthetic)
        .map((m) => m.id);

    const dbEntries = await getMachinesByIds(dbIds);
    const dbMap = new Map(dbEntries.map((entry) => [String(entry.id), entry]));

    const list = agreementMachines.map((machine) => {
        const dbEntry = machine.isSynthetic ? undefined : dbMap.get(machine.id);
        if (dbEntry) {
            const name = dbEntry.name?.trim() || machine.name || `Maskin ${dbEntry.id}`;
            const oemName =
                dbEntry.oem_name && dbEntry.oem_name !== "N/A"
                    ? dbEntry.oem_name
                    : (machine.make ?? "N/A");
            return {
                ...dbEntry,
                name,
                oem_name: oemName,
                active_agreement_id: machine.active_agreement_id,
                active_agreement: machine.active_agreement,
                active_customer_id: machine.active_customer_id,
                active_customer_name: machine.active_customer_name,
            };
        }

        return {
            id: machine.id,
            name: machine.name || "Maskin",
            oem_name: machine.make ?? "N/A",
            category: null,
            active_agreement_id: machine.active_agreement_id,
            active_agreement: machine.active_agreement,
            active_customer_id: machine.active_customer_id,
            active_customer_name: machine.active_customer_name,
            last_pos_reported_at: null,
            lat: null,
            lng: null,
        };
    });

    list.sort((a, b) => a.name.localeCompare(b.name, "nb-NO", { sensitivity: "base" }));

    return { features: buildFeatureCollection(list), list };
}

export async function getMachineLocationById(
    id: string | number,
): Promise<MachineListEntry | null> {
    const machineId = String(id ?? "").trim();
    if (!machineId) return null;

    const { rows } = await query(
        `
        SELECT
            id,
            name,
            oem_name,
            category,
            last_pos_reported_at,
            last_pos_latitude  AS lat,
            last_pos_longitude AS lng
        FROM machines
        WHERE id::text = $1::text
        LIMIT 1;
        `,
        [machineId],
    );

    if (!rows.length) return null;
    return toMachineListEntry(rows[0]);
}

export async function getMachineLocationHistoryById(
    id: string | number,
): Promise<MachinePositionHistoryEntry[]> {
    const machineId = String(id ?? "").trim();
    if (!machineId) return [];

    const { rows } = await query(
        `
        SELECT
            id,
            source,
            reported_at,
            received_at,
            latitude AS lat,
            longitude AS lng,
            altitude,
            speed,
            heading,
            km
        FROM machine_position_history
        WHERE machine_id::text = $1::text
        ORDER BY reported_at ASC, id ASC;
        `,
        [machineId],
    );

    return rows.map((row: any) => ({
        id: String(row.id),
        source: String(row.source ?? ""),
        reported_at: new Date(row.reported_at).toISOString(),
        received_at: new Date(row.received_at).toISOString(),
        lat: Number(row.lat),
        lng: Number(row.lng),
        altitude: row.altitude != null ? Number(row.altitude) : null,
        speed: row.speed != null ? Number(row.speed) : null,
        heading: row.heading != null ? Number(row.heading) : null,
        km: row.km != null ? Number(row.km) : null,
    }));
}

const getAllMachinesList = cache(async (): Promise<MachineListEntry[]> => {
    const label = `[machines] all ${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;

    if (IS_DEV) {
        console.time(label);
        console.log("[machines] Starting DB query…");
    }

    try {
        const { rows } = await query(`
            SELECT
                id,
                name,
                oem_name,
                category,
                last_pos_reported_at,
                last_pos_latitude  AS lat,
                last_pos_longitude AS lng
            FROM machines
            ORDER BY name;
            `);

        if (IS_DEV) {
            console.log(`[machines] DB returned ${rows.length} rows`);
        }

        return rows.map((m: any) => toMachineListEntry(m));
    } finally {
        if (IS_DEV) console.timeEnd(label);
    }
});

async function getMachinesByIds(ids: string[]): Promise<MachineListEntry[]> {
    const unique = [...new Set(ids.filter(Boolean).map((id) => String(id)))];
    if (!unique.length) return [];

    const { rows } = await query(
        `
        SELECT
            id,
            name,
            oem_name,
            category,
            last_pos_reported_at,
            last_pos_latitude  AS lat,
            last_pos_longitude AS lng
        FROM machines
        WHERE id = ANY($1::text[])
        ORDER BY name;
        `,
        [unique],
    );

    return rows.map((m: any) => toMachineListEntry(m));
}

function toMachineListEntry(row: any): MachineListEntry {
    const reportedAt: string | null = row.last_pos_reported_at
        ? new Date(row.last_pos_reported_at).toISOString()
        : null;

    return {
        id: typeof row.id === "number" || typeof row.id === "string" ? row.id : String(row.id),
        name: String(row.name ?? "N/A"),
        oem_name: String(row.oem_name ?? "N/A"),
        category: row.category != null ? String(row.category) : null,
        active_agreement_id:
            row.active_agreement_id != null ? String(row.active_agreement_id) : null,
        active_agreement: normalizeMachineAgreementSummary(row.active_agreement),
        active_customer_id:
            row.active_customer_id != null && row.active_customer_id !== ""
                ? Number(row.active_customer_id)
                : null,
        active_customer_name:
            row.active_customer_name != null ? String(row.active_customer_name) : null,
        last_pos_reported_at: reportedAt,
        lat: row.lat != null ? Number(row.lat) : null,
        lng: row.lng != null ? Number(row.lng) : null,
    };
}

function buildFeatureCollection(list: MachineListEntry[]): MachinesFC {
    const features: MachineFeature[] = list
        .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lng))
        .map((entry): MachineFeature => ({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [Number(entry.lng), Number(entry.lat)],
            },
            properties: {
                id: entry.id,
                name: entry.name,
                oem_name: entry.oem_name,
                category: entry.category,
                active_agreement_id: entry.active_agreement_id,
                active_customer_id: entry.active_customer_id,
                active_customer_name: entry.active_customer_name,
                last_pos_reported_at: entry.last_pos_reported_at,
            },
        }));

    return { type: "FeatureCollection", features };
}

function collectAgreementMachines(
    agreements: AgreementPayload[],
) {
    const results: Array<{
        id: string;
        name: string | null;
        make: string | null;
        isSynthetic: boolean;
        active_agreement_id: string | null;
        active_agreement: MachineAgreementSummary | null;
        active_customer_id: number | null;
        active_customer_name: string | null;
        _startDate: string | null;
        _endDate: string | null;
    }> = [];
    const seen = new Map<string, number>();

    agreements.forEach((agreement) => {
        const machines = agreement.machines ?? [];
        machines.forEach((machine, index) => {
            const rawId = machine?.id?.trim();
            const candidate = {
                id: rawId || `unknown-${agreement.id}-${index}`,
                name: machine?.name ?? null,
                make: machine?.make ?? null,
                isSynthetic: !rawId,
                active_agreement_id: agreement.id ?? null,
                active_agreement: toMachineAgreementSummary(agreement),
                active_customer_id: agreement.customerId ?? null,
                active_customer_name: agreement.customerName ?? null,
                _startDate: agreement.startDate ?? null,
                _endDate: agreement.endDate ?? null,
            };

            if (rawId) {
                const existingIndex = seen.get(rawId);
                if (existingIndex == null) {
                    seen.set(rawId, results.length);
                    results.push(candidate);
                    return;
                }

                if (compareAgreementCandidates(candidate, results[existingIndex]) < 0) {
                    results[existingIndex] = candidate;
                }
                return;
            }

            results.push(candidate);
        });
    });

    return results.map(({ _startDate: _ignoredStartDate, _endDate: _ignoredEndDate, ...machine }) => machine);
}

function toMachineAgreementSummary(agreement: AgreementPayload): MachineAgreementSummary {
    return {
        id: String(agreement.id),
        customerId: agreement.customerId ?? null,
        customerName: agreement.customerName ?? null,
        startDate: agreement.startDate ?? null,
        endDate: agreement.endDate ?? null,
        comment: agreement.comment ?? null,
        projectNumber: agreement.projectNumber ?? null,
        contactPersonName: agreement.contactPersonName ?? null,
        contactPersonTelephoneNumber: agreement.contactPersonTelephoneNumber ?? null,
        contactPersonEmail: agreement.contactPersonEmail ?? null,
        customerContactPersonId: agreement.customerContactPersonId ?? null,
        customerContactPersonName: agreement.customerContactPersonName ?? null,
        customerContactPersonTelephoneNumber: agreement.customerContactPersonTelephoneNumber ?? null,
        customerContactPersonEmail: agreement.customerContactPersonEmail ?? null,
        insuranceIncluded: agreement.insuranceIncluded ?? null,
        contractPrice: agreement.contractPrice ?? null,
        location: agreement.location ?? null,
        createdBy: agreement.createdBy ?? null,
        createdByTelephoneNumber: agreement.createdByTelephoneNumber ?? null,
        machines: (agreement.machines ?? []).map((machine) => ({
            id: machine.id ?? undefined,
            name: machine.name ?? null,
            make: machine.make ?? null,
        })),
    };
}

function normalizeMachineAgreementSummary(value: unknown): MachineAgreementSummary | null {
    if (!value || typeof value !== "object") return null;
    const agreement = value as Record<string, unknown>;
    const agreementId = agreement.id;
    if (typeof agreementId !== "string" && typeof agreementId !== "number") {
        return null;
    }

    const machines = Array.isArray(agreement.machines)
        ? agreement.machines.map((machine) => {
            if (!machine || typeof machine !== "object") {
                return { id: undefined, name: null, make: null };
            }
            const agreementMachine = machine as Record<string, unknown>;
            return {
                id:
                    typeof agreementMachine.id === "string" || typeof agreementMachine.id === "number"
                        ? agreementMachine.id
                        : undefined,
                name:
                    agreementMachine.name != null
                        ? String(agreementMachine.name)
                        : null,
                make:
                    agreementMachine.make != null
                        ? String(agreementMachine.make)
                        : null,
            };
        })
        : null;

    return {
        id: String(agreementId),
        customerId:
            agreement.customerId != null && agreement.customerId !== ""
                ? Number(agreement.customerId)
                : null,
        customerName: agreement.customerName != null ? String(agreement.customerName) : null,
        startDate: agreement.startDate != null ? String(agreement.startDate) : null,
        endDate: agreement.endDate != null ? String(agreement.endDate) : null,
        comment: agreement.comment != null ? String(agreement.comment) : null,
        projectNumber: agreement.projectNumber != null ? String(agreement.projectNumber) : null,
        contactPersonName:
            agreement.contactPersonName != null ? String(agreement.contactPersonName) : null,
        contactPersonTelephoneNumber:
            agreement.contactPersonTelephoneNumber != null
                ? String(agreement.contactPersonTelephoneNumber)
                : null,
        contactPersonEmail:
            agreement.contactPersonEmail != null ? String(agreement.contactPersonEmail) : null,
        customerContactPersonId:
            agreement.customerContactPersonId != null && agreement.customerContactPersonId !== ""
                ? Number(agreement.customerContactPersonId)
                : null,
        customerContactPersonName:
            agreement.customerContactPersonName != null
                ? String(agreement.customerContactPersonName)
                : null,
        customerContactPersonTelephoneNumber:
            agreement.customerContactPersonTelephoneNumber != null
                ? String(agreement.customerContactPersonTelephoneNumber)
                : null,
        customerContactPersonEmail:
            agreement.customerContactPersonEmail != null
                ? String(agreement.customerContactPersonEmail)
                : null,
        insuranceIncluded:
            typeof agreement.insuranceIncluded === "boolean" ? agreement.insuranceIncluded : null,
        contractPrice:
            typeof agreement.contractPrice === "boolean" ? agreement.contractPrice : null,
        location: agreement.location != null ? String(agreement.location) : null,
        createdBy: agreement.createdBy != null ? String(agreement.createdBy) : null,
        createdByTelephoneNumber:
            agreement.createdByTelephoneNumber != null
                ? String(agreement.createdByTelephoneNumber)
                : null,
        machines,
    };
}

function compareAgreementCandidates(
    a: { _startDate: string | null; _endDate: string | null },
    b: { _startDate: string | null; _endDate: string | null },
) {
    const byStart =
        (toAgreementTimestamp(b._startDate, "start") ?? 0) -
        (toAgreementTimestamp(a._startDate, "start") ?? 0);
    if (byStart !== 0) return byStart;

    return (
        (toAgreementTimestamp(b._endDate, "end") ?? 0) -
        (toAgreementTimestamp(a._endDate, "end") ?? 0)
    );
}

function toAgreementTimestamp(value?: string | null, boundary: "start" | "end" = "start") {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        if (boundary === "end") {
            date.setHours(23, 59, 59, 999);
        } else {
            date.setHours(0, 0, 0, 0);
        }
    }

    return date.getTime();
}
