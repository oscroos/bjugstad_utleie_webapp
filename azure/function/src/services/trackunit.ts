import axios, {
    AxiosInstance,
    AxiosHeaders,
    InternalAxiosRequestConfig,
    isAxiosError,
} from "axios";
import { optionalConfig, requireConfig } from "../shared/kv";

export type TrackunitUnit = {
    id: string;
    serialNumber?: string | null;
    gpsFixTime?: string | null;
    messageTime?: string | null;
    location?: {
        latitude?: number | null;
        longitude?: number | null;
    } | null;
    altitude?: number | null;
    heading?: number | null;
    speed?: number | null;
    km?: number | null;
    [key: string]: unknown;
};
let http: AxiosInstance | null = null;

function trimToNull(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
}

function previewBody(value: unknown, max = 300): string {
    const text =
        typeof value === "string"
            ? value
            : (() => {
                try {
                    return JSON.stringify(value);
                } catch {
                    return String(value);
                }
            })();

    const trimmed = text.trim();
    return trimmed.length > max ? `${trimmed.slice(0, max)}...` : trimmed;
}

async function getHttp(): Promise<AxiosInstance> {
    if (http) return http;

    const baseURL =
        trimToNull(await optionalConfig("TRACKUNIT_API_BASEURL")) ||
        "https://api.trackunit.com";
    const username = await requireConfig("TRACKUNIT_USERNAME");
    const token = await requireConfig("TRACKUNIT_API_TOKEN");

    http = axios.create({ baseURL, timeout: 30000 });

    http.interceptors.request.use(async (cfg: InternalAxiosRequestConfig) => {
        const headers = AxiosHeaders.from(cfg.headers);
        const encoded = Buffer.from(`${username}:${token}`, "utf8").toString("base64");
        headers.set("Authorization", `Basic ${encoded}`);
        headers.set("Accept", "application/json");
        cfg.headers = headers;
        console.log(`[trackunit] -> ${cfg.method?.toUpperCase()} ${baseURL}${cfg.url}`);
        return cfg;
    });

    return http;
}

export async function fetchAllTrackunitUnits(): Promise<TrackunitUnit[]> {
    const client = await getHttp();

    try {
        const resp = await client.get<unknown>("/public/GetUnit", {
            validateStatus: () => true,
        });

        console.log(`[trackunit] raw response status=${resp.status} body=${previewBody(resp.data, 2000)}`);

        if (resp.status >= 400) {
            const bodyTxt = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
            throw new Error(`GET /public/GetUnit failed ${resp.status}: ${bodyTxt}`);
        }

        const list = Array.isArray((resp.data as any)?.list) ? (resp.data as any).list : null;
        if (!list) {
            throw new Error(
                `Unexpected Trackunit GetUnit response type: ${typeof resp.data === "object" ? "object" : typeof resp.data}`
            );
        }

        return list as TrackunitUnit[];
    } catch (err: any) {
        if (isAxiosError(err)) {
            const data = err.response?.data;
            console.error(
                `[trackunit] axios error status=${err.response?.status} message=${err.message} body=${typeof data === "string" ? data : JSON.stringify(data)}`
            );
        }
        throw err;
    }
}
