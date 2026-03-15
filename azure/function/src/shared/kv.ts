// azure/function/src/shared/kv.ts
import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";

let secretClient: SecretClient | null = null;
const cache = new Map<string, string>();

function getKeyVaultUrl(): string | undefined {
    return process.env.KEY_VAULT_URL;
}

function getClient(): SecretClient | null {
    if (secretClient) return secretClient;
    const url = getKeyVaultUrl();
    if (!url) return null;
    secretClient = new SecretClient(url, new DefaultAzureCredential());
    return secretClient;
}

/**
 * Get a configuration value: prefer process.env, else Key Vault secret of same name.
 * Caches results in-memory for the process lifetime.
 */
export async function getConfig(name: string): Promise<string> {
    // 1) env first
    const envVal = process.env[name];
    if (envVal !== undefined && envVal !== null && envVal !== "") return envVal;

    // 2) cache
    if (cache.has(name)) return cache.get(name)!;

    // 3) key vault (if configured)
    const client = getClient();
    if (!client) {
        throw new Error(
            `Config "${name}" not found in env or KEY_VAULT_URL is not set.`
        );
    }

    const secret = await client.getSecret(name);
    if (!secret?.value) {
        throw new Error(`Secret "${name}" not found in Key Vault.`);
    }
    cache.set(name, secret.value);
    return secret.value;
}

/** Convenience loader that throws with a tidy message if missing. */
export async function requireConfig(name: string): Promise<string> {
    const v = await getConfig(name);
    if (!v) throw new Error(`Required config "${name}" is empty.`);
    return v;
}

export async function optionalConfig(name: string): Promise<string | null> {
    try {
        const value = await getConfig(name);
        return value ? value : null;
    } catch {
        return null;
    }
}
