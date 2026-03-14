// azure/function/src/services/bjugstad.ts
import axios, {
    AxiosInstance,
    AxiosHeaders,
    InternalAxiosRequestConfig,
    isAxiosError,
} from "axios";
import { optionalConfig, requireConfig } from "../shared/kv";

type ApiAuthConfig = {
    apiKey: string;
};

let client: AxiosInstance | null = null;
let authConfig: ApiAuthConfig | null = null;

async function getAuthConfig(): Promise<ApiAuthConfig> {
    if (authConfig) return authConfig;

    const primaryKey = (await optionalConfig("BJUGSTAD_API_KEY_PRIMARY"))?.trim() || null;
    const secondaryKey = (await optionalConfig("BJUGSTAD_API_KEY_SECONDARY"))?.trim() || null;

    const apiKey = primaryKey || secondaryKey;
    if (!apiKey) {
        throw new Error("BJUGSTAD_API_KEY_PRIMARY or BJUGSTAD_API_KEY_SECONDARY must be configured.");
    }

    authConfig = { apiKey };
    return authConfig;
}

async function getClient(): Promise<AxiosInstance> {
    if (client) return client;

    const baseURL = await requireConfig("BJUGSTAD_API_BASEURL");

    client = axios.create({ baseURL, timeout: 20000 });

    client.interceptors.request.use(
        async (cfg: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
            const headers = AxiosHeaders.from(cfg.headers);
            const auth = await getAuthConfig();

            headers.set("Ocp-Apim-Subscription-Key", auth.apiKey);

            headers.set("Accept", "application/json");
            cfg.headers = headers;
            const url = cfg.url?.startsWith("http") ? cfg.url : `${baseURL}${cfg.url}`;
            console.log(`[bjugstad-api] -> ${cfg.method?.toUpperCase()} ${url}`);
            return cfg;
        }
    );

    return client;
}

async function apiGetInternal<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const client = await getClient();
    const finalPath = path.startsWith("/") ? path : `/${path}`;

    try {
        const resp = await client.get<T>(finalPath, {
            params,
            validateStatus: () => true,
        });

        if (resp.status >= 400) {
            const bodyTxt = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
            throw new Error(`GET ${finalPath} failed ${resp.status}: ${bodyTxt}`);
        }

        return resp.data;
    } catch (err: any) {
        if (isAxiosError(err)) {
            const data = err.response?.data;
            console.error(
                `[bjugstad-api] axios error status=${err.response?.status} message=${err.message} body=${typeof data === "string" ? data : JSON.stringify(data)}`
            );
        }
        throw err;
    }
}

export async function apiGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return apiGetInternal<T>(path, params);
}

export type BjugstadContactPerson = {
    contactPersonId: number;
    name: string;
    telephoneNumber?: string;
    email?: string;
    customerId: number;
};

export type BjugstadCustomer = {
    customerId: number;
    name?: string;
    email?: string;
    address?: string;
    postalCode?: string;
    city?: string;
    contact?: string;
    telephoneNumber?: string;
    organizationNumber?: string;
    customerNumber?: number;
    contactPersons?: BjugstadContactPerson[];
};

export type BjugstadMachineFull = {
    machineId: number;
    make?: string | null;
    model?: string | null;
    productionYear?: string | null;
    number?: string | null;
    category?: string | null;
    registrationNumber?: string | null;
    serialNumber?: string | null;
    location?: string | null;
    railControlDate?: string | null;
    controlDate?: string | null;
    trainingVideos?: unknown[] | null;
    documentedTrainingVideoUri?: string | null;
    englishDocumentedTrainingVideoUri?: string | null;
    trackunitId?: number | null;
    leasingCompany?: string | null;
};

export async function fetchCustomers(): Promise<BjugstadCustomer[]> {
    const data = await apiGet<unknown>("/GetCustomers");
    if (!Array.isArray(data)) {
        throw new Error(
            `Unexpected GetCustomers response type: ${typeof data === "object" ? "object" : typeof data}`
        );
    }

    return data as BjugstadCustomer[];
}

export async function fetchMachinesFull(): Promise<BjugstadMachineFull[]> {
    const data = await apiGet<unknown>("/GetMachinesFull");
    if (!Array.isArray(data)) {
        throw new Error(
            `Unexpected GetMachinesFull response type: ${typeof data === "object" ? "object" : typeof data}`
        );
    }

    return data as BjugstadMachineFull[];
}
