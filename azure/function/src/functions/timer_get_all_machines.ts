import { app, InvocationContext, Timer } from "@azure/functions";
import { BjugstadMachineFull, fetchMachinesFull } from "../services/bjugstad";
import { MachineRow, upsertMachines } from "../shared/db";

const MAX_START_DELAY_MS = 45_000;

function trimToNull(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
}

function parseDateOrNull(value: unknown): Date | null {
    const trimmed = trimToNull(value);
    if (!trimmed) return null;

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMachineName(machine: BjugstadMachineFull): string | null {
    const make = trimToNull(machine.make);
    const model = trimToNull(machine.model);
    const productionYear = trimToNull(machine.productionYear);

    const left = [make, model].filter(Boolean).join(" - ");
    if (!left && !productionYear) return null;
    if (!productionYear) return left || null;
    if (!left) return `(${productionYear})`;
    return `${left} (${productionYear})`;
}

function toMachineRow(machine: BjugstadMachineFull): MachineRow | null {
    const machineId = Number(machine.machineId);
    if (!Number.isFinite(machineId) || machineId <= 0) return null;

    return {
        id: String(machineId),
        oem_id: null,
        serial_number: trimToNull(machine.serialNumber),
        name: formatMachineName(machine),
        oem_name: trimToNull(machine.make),
        model: trimToNull(machine.model),
        production_year: trimToNull(machine.productionYear),
        category: trimToNull(machine.category),
        registration_number: trimToNull(machine.registrationNumber),
        rail_control_date: parseDateOrNull(machine.railControlDate),
        control_date: parseDateOrNull(machine.controlDate),
        trackunit_id: trimToNull(machine.trackunitId),
        leasing_company: trimToNull(machine.leasingCompany),
        last_pos_reported_at: null,
        last_pos_latitude: null,
        last_pos_longitude: null,
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

app.timer("timer_get_all_machines", {
    schedule: "0 0 */4 * * *",
    runOnStartup: true,
    handler: async (_: Timer, ctx: InvocationContext): Promise<void> => {
        const startedAt = new Date().toISOString();
        ctx.log(`timer_get_all_machines fired at ${startedAt}`);

        const delayMs = Math.floor(Math.random() * MAX_START_DELAY_MS);
        if (delayMs > 0) {
            ctx.log(`timer_get_all_machines delaying API call by ${delayMs} ms to avoid collisions`);
            await sleep(delayMs);
        }

        try {
            const machines = await fetchMachinesFull();
            ctx.log(`Fetched ${machines.length} machines from Bjugstad GetMachinesFull`);

            const rows: MachineRow[] = [];
            let skippedInvalid = 0;

            for (const machine of machines) {
                const row = toMachineRow(machine);
                if (!row) {
                    skippedInvalid += 1;
                    ctx.warn?.(`Skipping machine with invalid machineId: ${JSON.stringify(machine)}`);
                    continue;
                }
                rows.push(row);
            }

            const affected = await upsertMachines(rows);

            ctx.log(
                `Machines fetched=${machines.length}; valid=${rows.length}; skipped_invalid=${skippedInvalid}; upserted=${affected}`,
            );
        } catch (err: any) {
            const message = err?.message || String(err);
            ctx.error?.(`timer_get_all_machines error: ${message}`);
            throw (err instanceof Error ? err : new Error(String(err)));
        }
    },
});
