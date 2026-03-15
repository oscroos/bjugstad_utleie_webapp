// azure/function/src/functions/timer_hydrema.ts
import { app, InvocationContext, Timer } from "@azure/functions";
import { upsertMachines } from "../shared/db";
import { fetchAllHydremaMachines } from "../services/hydrema";

const HYDREMA_OEM_ID_TO_INTERNAL_ID: Record<string, string> = {
    "151532": "1544",
    "231155": "2113",
    "231156": "2017",
    "254470": "2118",
    "260716": "2185",
    "268812": "2354",
    "268876": "2198",
    "277174": "2389",
    "277204": "2390",
    "283106": "2310",
    "286887": "2391",
    "286918": "2353",
    "301397": "2369"
    //"301443": "Finner ikke",
    //"312450": "Finner ikke"
};

const HYDREMA_SERIAL_TO_INTERNAL_ID: Record<string, string> = {
    "15018": "1544",
    "16183": "2113",
    "16184": "2017",
    "16706": "2118",
    "16810": "2185",
    "17744": "2354",
    "17192": "2198",
    "17747": "2389",
    "17750": "2390",
    "17741": "2310",
    "17752": "2391",
    "17743": "2353",
    "17779": "2369"
    //"17913": "Finner ikke",
    //"18116": "Finner ikke"
};

app.timer("timer_hydrema", {
    // Azure Functions cron format: {second} {minute} {hour} {day} {month} {day-of-week}
    // Run at second 0, every 15th minute:
    schedule: "5 */15 * * * *",
    runOnStartup: true,

    handler: async (myTimer: Timer, ctx: InvocationContext): Promise<void> => {
        const stamp = new Date().toISOString();
        ctx.log(`timer_hydrema fired at ${stamp}`);

        try {
            // Fetch machines from Hydrema (includes geo when available)
            const machines = await fetchAllHydremaMachines();
            const missingMappings: string[] = [];

            // Map to DB shape (snake_case) + last position
            const rows = machines
                .map((m: any) => {
                    const oemId = m.id ?? null;
                    const serialNumber = m.serialNumber ?? m.serial_number ?? m.serial ?? null;
                    const internalId =
                        (oemId && HYDREMA_OEM_ID_TO_INTERNAL_ID[oemId]) ||
                        (serialNumber && HYDREMA_SERIAL_TO_INTERNAL_ID[serialNumber]) ||
                        null;

                    if (!internalId) {
                        missingMappings.push(
                            `${oemId ?? "null"}:${serialNumber ?? "null"}`
                        );
                        return null;
                    }

                    return {
                        id: internalId,
                        oem_id: oemId,
                        serial_number: serialNumber,
                        name: m.name ?? oemId ?? serialNumber ?? null,
                        oem_name: "Hydrema",
                        telemetry_source: "hydrema",
                        last_pos_reported_at: m.geo?.time != null ? new Date(Number(m.geo.time)) : null, // ms -> Date (UTC)
                        last_pos_latitude: m.geo?.latitude ?? null,
                        last_pos_longitude: m.geo?.longitude ?? null,
                    };
                })
                .filter((r): r is NonNullable<typeof r> => r != null);

            if (missingMappings.length) {
                ctx.log(
                    `HYDREMA: missing mapping for ${missingMappings.length} machine(s): ${missingMappings.join(", ")}`
                );
            }

            // Upsert into DB
            const affected = await upsertMachines(rows);

            ctx.log(`Fetched ${machines.length} machines; upserted ${affected}.`);
        } catch (err: any) {
            ctx.error?.(`timer_hydrema error: ${err?.message || err}`);
            throw (err instanceof Error ? err : new Error(String(err)));
        }
    },
});
