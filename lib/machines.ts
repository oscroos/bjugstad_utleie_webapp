// lib/machines.ts
import { cache } from "react";
import { query } from "@/lib/db";
import type {
    MachinesFC,
    MachineFeature,
    MachineListEntry,
    MachinesData,
    MachinePositionHistoryEntry,
} from "@/types/machines";
import { IS_DEV } from "./constants";
import { fetchAgreementsForUser, splitAgreementsByStatus } from "@/lib/agreements";

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
            return { ...dbEntry, name, oem_name: oemName };
        }

        return {
            id: machine.id,
            name: machine.name || "Maskin",
            oem_name: machine.make ?? "N/A",
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
                last_pos_reported_at: entry.last_pos_reported_at,
            },
        }));

    return { type: "FeatureCollection", features };
}

function collectAgreementMachines(
    agreements: Array<{ id: string; machines?: Array<{ id?: string; name?: string | null; make?: string | null }> }>,
) {
    const results: Array<{ id: string; name: string | null; make: string | null; isSynthetic: boolean }> = [];
    const seen = new Set<string>();

    agreements.forEach((agreement) => {
        const machines = agreement.machines ?? [];
        machines.forEach((machine, index) => {
            const rawId = machine?.id?.trim();
            if (rawId) {
                if (seen.has(rawId)) return;
                seen.add(rawId);
                results.push({
                    id: rawId,
                    name: machine?.name ?? null,
                    make: machine?.make ?? null,
                    isSynthetic: false,
                });
                return;
            }

            const syntheticId = `unknown-${agreement.id}-${index}`;
            if (seen.has(syntheticId)) return;
            seen.add(syntheticId);
            results.push({
                id: syntheticId,
                name: machine?.name ?? null,
                make: machine?.make ?? null,
                isSynthetic: true,
            });
        });
    });

    return results;
}
