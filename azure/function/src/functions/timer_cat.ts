// azure/function/src/functions/timer_cat.ts
import { app, InvocationContext, Timer } from "@azure/functions";
import { MachineRow, upsertMachines } from "../shared/db";
import { fetchAllCatMachines } from "../services/cat";

const CAT_SERIAL_TO_INTERNAL_ID: Record<string, string> = {
    "JWL00225": "2013",
    "HZ600664": "2039",
    "XNB40273": "2443",
    "ELW00179": "1712",
    "GWT01546": "1713",
    "XNB20376": "1946",
};

app.timer("timer_cat", {
    // run every 15 minutes at second 0 to de-sync from Hydrema’s second 0
    schedule: "0 */15 * * * *",
    runOnStartup: true,
    handler: async (_: Timer, ctx: InvocationContext): Promise<void> => {
        const stamp = new Date().toISOString();
        ctx.log(`timer_cat fired at ${stamp}`);

        try {
            const machines = await fetchAllCatMachines();
            const missingMappings: string[] = [];

            const rows: MachineRow[] = machines
                .map((asset): MachineRow | null => {
                    const equipmentHeader = asset.EquipmentHeader;
                    if (!equipmentHeader) return null;

                    const equipmentId = equipmentHeader.EquipmentID ?? null;
                    const serialNumber = equipmentHeader.SerialNumber ?? null;
                    if (!serialNumber) return null;

                    const internalId = CAT_SERIAL_TO_INTERNAL_ID[serialNumber];
                    if (!internalId) {
                        missingMappings.push(serialNumber);
                        return null;
                    }

                    const loc = asset.Location;
                    const last_pos_reported_at = loc?.Datetime ? new Date(loc.Datetime) : null;

                    return {
                        id: internalId,
                        oem_id: equipmentId,
                        serial_number: serialNumber,
                        name: serialNumber ?? equipmentId,
                        oem_name: equipmentHeader.OEMName ?? "CAT",
                        last_pos_reported_at: last_pos_reported_at,
                        last_pos_latitude: loc?.Latitude ?? null,
                        last_pos_longitude: loc?.Longitude ?? null,
                    };
                })
                .filter((r): r is MachineRow => !!r);

            if (missingMappings.length) {
                ctx.log(
                    `CAT: missing mapping for ${missingMappings.length} machine(s): ${missingMappings.join(", ")}`
                );
            }

            const affected = await upsertMachines(rows);
            ctx.log(`CAT: fetched ${machines.length}; upserted ${affected}.`);
        } catch (err: any) {
            ctx.error?.(`timer_cat error: ${err?.message || err}`);
            throw (err instanceof Error ? err : new Error(String(err)));

        }
    },
});
