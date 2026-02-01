// azure/function/src/services/cat.ts
// Platform: https://vl.cat.com/home
// Documentation: https://digital.cat.com/apis/api-list/prod/iso15143-aemp-20-0#/Snapshot/getFleetSnapshot
import axios, {
    AxiosInstance,
    AxiosHeaders,
    InternalAxiosRequestConfig,
    isAxiosError,
} from "axios";
import { requireConfig } from "../shared/kv";

/** Standard OAuth2 token response */
type TokenResp = { access_token: string; token_type?: string; expires_in?: number };

let tokenCache: { token?: string; exp?: number } = {};
let http: AxiosInstance | null = null;

/** Simple uuid v4 */
function uuidv4(): string {
    return crypto.randomUUID();
}

async function getToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (tokenCache.token && tokenCache.exp && tokenCache.exp - 60 > now) return tokenCache.token!;

    const tokenUrl = await requireConfig("CAT_TOKEN_URL");
    const clientId = await requireConfig("CAT_CLIENT_ID");
    const clientSecret = await requireConfig("CAT_CLIENT_SECRET");
    // The CAT API (AAD v2) expects scope to target the resource App ID URI
    // in the form: "{resource-app-id-uri}/.default".
    const scopeRaw = await requireConfig("CAT_SCOPE");

    const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: `${clientId}/${scopeRaw}`
    });

    const resp = await axios.post<TokenResp>(tokenUrl, body.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 20000,
        validateStatus: () => true,
    });

    if (resp.status >= 400) {
        const bodyTxt = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
        throw new Error(`CAT TOKEN ${tokenUrl} -> ${resp.status} ${bodyTxt}`);
    }

    const { access_token, expires_in } = resp.data;
    tokenCache = { token: access_token, exp: now + (expires_in || 3600) };
    console.log(`[cat] token ok len=${access_token?.length ?? 0}`);
    return access_token;
}

async function getHttp(): Promise<AxiosInstance> {
    if (http) return http;

    const baseURL = await requireConfig("CAT_API_BASEURL");
    http = axios.create({ baseURL, timeout: 25000 });

    http.interceptors.request.use(async (cfg: InternalAxiosRequestConfig) => {
        const headers = AxiosHeaders.from(cfg.headers);
        headers.set("Authorization", `Bearer ${await getToken()}`);
        headers.set("Accept", "application/json");
        headers.set("X-Cat-API-Tracking-Id", uuidv4()); // Unique ID per request
        cfg.headers = headers;
        console.log("headers set");
        console.log(`[cat] -> ${cfg.method?.toUpperCase()} ${baseURL}${cfg.url}`);
        return cfg;
    });

    // LOG FULL RESPONSE
    const LOG_FULL = 0;
    http.interceptors.response.use(
        (resp) => {
            if (LOG_FULL) {
                const urlShow =
                    (resp.request && resp.request.responseURL) ||
                    `${baseURL}${resp.config.url ?? ""}`;
                // Build a serializable snapshot
                const snapshot = {
                    url: urlShow,
                    status: resp.status,
                    headers: resp.headers,
                    data: resp.data,
                };

                const txt = JSON.stringify(snapshot, null, 2);
                console.log("FULL RESPONSE:");
                console.log(txt);
            }
            return resp;
        });


    return http;
}

/**
 * Minimal AEMP-ish asset + optional embedded geo.
 * Different OEMs vary; we keep this permissive.
 */
// Keep a permissive shape that matches the API response (PascalCase keys).
export type CatMachine = {
    EquipmentHeader?: {
        OEMName?: string;
        Model?: string;
        EquipmentID?: string;
        SerialNumber?: string;
    };
    Location?: {
        Latitude?: number;
        Longitude?: number;
        Altitude?: number;
        AltitudeUnits?: string; // "metre"
        Datetime?: string;      // ISO
    };
    CumulativeIdleHours?: { Hour?: number; Datetime?: string };
    CumulativeLoadCount?: { Count?: number; Datetime?: string };
    DEFRemaining?: { Percent?: number; Datetime?: string };

    CumulativeOperatingHours?: { Hour?: number; Datetime?: string };
    CumulativePayloadTotals?: { PayloadUnits?: string; Payload?: number; Datetime?: string };
    Distance?: { OdometerUnits?: string; Odometer?: number; Datetime?: string };
    EngineStatus?: { EngineNumber?: string; Running?: boolean; Datetime?: string };

    FuelUsed?: { FuelUnits?: string; FuelConsumed?: number; Datetime?: string };
    FuelUsedLast24?: { FuelUnits?: string; FuelConsumed?: number; Datetime?: string };
    FuelRemaining?: { Percent?: number; Datetime?: string };

    // If CAT adds extra keys, this keeps us future-proof.
    [k: string]: unknown;
};

type CatFleetPage = {
    Links?: Array<{ Rel: string; Href: string }>;
    Equipment?: CatMachine[];
    Version?: string;
    SnapshotTime?: string;
};

function asCatMachine(e: any): CatMachine | null {
    if (!e || typeof e !== "object") return null;
    const h = e?.EquipmentHeader;
    // Require at least one identifier to avoid junk rows
    if (!h?.SerialNumber && !h?.EquipmentID) return null;
    return e as CatMachine;
}


function nextFromLinks(links?: Array<{ Rel: string; Href: string }>): string | null {
    if (!Array.isArray(links)) return null;
    const n = links.find(l => String(l.Rel).toLowerCase() === "next");
    return n?.Href ?? null;
}

/** Fetch every fleet page and map to CatMachine[] */
export async function fetchAllCatMachines(): Promise<CatMachine[]> {
    const client = await getHttp();

    let pageNum = 1;
    let url: string | null = `/fleet/${pageNum}`;
    const out: CatMachine[] = [];

    while (url) {
        try {
            const resp = await client.get<CatFleetPage>(url, { validateStatus: () => true });
            //console.log("resp", resp);
            const showUrl = resp.request?.responseURL || `${client.defaults.baseURL}${url}`;
            console.log(`[cat] <- ${resp.status} for ${showUrl}`);

            if (resp.status >= 400) {
                const bodyTxt = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
                throw new Error(`GET ${url} failed ${resp.status}: ${bodyTxt}`);
            }

            const items = resp.data?.Equipment ?? [];
            for (const raw of items) {
                const m = asCatMachine(raw);
                if (m) out.push(m);
            }

            const nextAbs = nextFromLinks(resp.data?.Links);
            if (nextAbs) {
                // If absolute, use as-is; if relative, keep relative
                url = nextAbs.startsWith("http") ? nextAbs : nextAbs.replace(client.defaults.baseURL || "", "");
            } else {
                url = null;
            }
        } catch (e: any) {
            if (isAxiosError(e)) {
                const data = e.response?.data;
                console.error(
                    `[cat] axios error: status=${e.response?.status} msg=${e.message} body=${typeof data === "string" ? data : JSON.stringify(data)}`
                );
            }
            throw e;
        }

        // safety net to prevent accidental infinite loops
        if (++pageNum > 500) {
            console.warn("[cat] pagination safety break after 500 pages");
            break;
        }
    }
    console.log(`[cat] fetched total ${out.length} machines`);
    //console.log(out);

    return out;
}