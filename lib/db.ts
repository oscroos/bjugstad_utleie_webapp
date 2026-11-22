// lib/db.ts
import { Pool } from "pg";
import type { QueryResult, QueryResultRow } from "pg";

declare global { var __pgPool: Pool | undefined }
function createPool() {
    return new Pool({
        host: process.env.PG_HOST,
        port: Number(process.env.PG_PORT ?? 5432),
        database: process.env.PG_DB,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        max: Number(process.env.PG_POOL_MAX ?? 10),
        // Encrypted and verified: the server must present a certificate for PG_HOST
        // that chains to a public root. Without the check, anyone on the network
        // path could pose as the database and read the password.
        ssl: process.env.PG_SSL?.toLowerCase() === "require" ? { rejectUnauthorized: true } : undefined,
    });
}
export const pool = global.__pgPool ?? createPool();
if (!global.__pgPool) global.__pgPool = pool;

export async function query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: any[]
): Promise<QueryResult<T>> {
    const client = await pool.connect();
    try {
        return await client.query<T>(text, params);
    } finally {
        client.release();
    }
}
