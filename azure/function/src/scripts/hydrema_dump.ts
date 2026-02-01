// Local CLI helper to fetch Hydrema machines and print the raw response.
import fs from "fs";
import path from "path";
import { fetchAllHydremaMachines } from "../services/hydrema";

function loadLocalSettings(): void {
    const settingsPath = path.resolve(process.cwd(), "azure/function/local.settings.json");
    if (!fs.existsSync(settingsPath)) return;

    const raw = fs.readFileSync(settingsPath, "utf8");
    const json = JSON.parse(raw);
    const values = json?.Values;
    if (!values || typeof values !== "object") return;

    for (const [key, value] of Object.entries(values)) {
        if (process.env[key] == null && value != null) {
            process.env[key] = String(value);
        }
    }
}

async function main(): Promise<void> {
    loadLocalSettings();
    const machines = await fetchAllHydremaMachines();
    console.log(JSON.stringify(machines, null, 2));
}

main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[hydrema_dump] error: ${msg}`);
    process.exit(1);
});
