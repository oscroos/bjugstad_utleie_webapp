import { app, InvocationContext, Timer } from "@azure/functions";
import { updateTrackunitTelemetry, TrackunitTelemetryRow } from "../shared/db";
import { fetchAllTrackunitUnits, TrackunitUnit } from "../services/trackunit";

const API_CALL_DELAY_MS = 20_000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function asNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function parseReportedAt(unit: TrackunitUnit): Date | null {
    const raw = unit.gpsFixTime ?? unit.messageTime ?? null;
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toTelemetryRow(unit: TrackunitUnit): TrackunitTelemetryRow | null {
    const trackunitId = String(unit.serialNumber ?? "").trim();
    if (!trackunitId) return null;

    return {
        trackunit_id: trackunitId,
        last_pos_reported_at: parseReportedAt(unit),
        last_pos_latitude: asNumber(unit.location?.latitude),
        last_pos_longitude: asNumber(unit.location?.longitude),
        altitude: asNumber(unit.altitude),
        speed: asNumber(unit.speed),
        heading: asNumber(unit.heading),
        km: asNumber(unit.km),
    };
}

app.timer("timer_trackunit", {
    schedule: "35 */15 * * * *",
    runOnStartup: true,
    handler: async (_: Timer, ctx: InvocationContext): Promise<void> => {
        const startedAt = new Date().toISOString();
        ctx.log(`timer_trackunit fired at ${startedAt}`);

        if (API_CALL_DELAY_MS > 0) {
            ctx.log(`timer_trackunit delaying API call by ${API_CALL_DELAY_MS} ms to avoid timer collisions`);
            await sleep(API_CALL_DELAY_MS);
        }

        try {
            const units = await fetchAllTrackunitUnits();
            const rows: TrackunitTelemetryRow[] = [];
            let skippedInvalid = 0;

            for (const unit of units) {
                const row = toTelemetryRow(unit);
                if (!row) {
                    skippedInvalid += 1;
                    continue;
                }
                rows.push(row);
            }

            const updated = await updateTrackunitTelemetry(rows);
            ctx.log(
                `Trackunit units fetched=${units.length}; valid=${rows.length}; skipped_invalid=${skippedInvalid}; matched_rows_updated=${updated}`,
            );
        } catch (err: any) {
            const message = err?.message || String(err);
            ctx.error?.(`timer_trackunit error: ${message}`);
            throw (err instanceof Error ? err : new Error(String(err)));
        }
    },
});
