// azure/function/src/shared/db.ts
import { Pool, PoolClient, QueryResult } from "pg";

type SSLMode = "disable" | "allow" | "prefer" | "require" | "verify-ca" | "verify-full";

let pool: Pool | null = null;

function buildPool(): Pool {
    const host = process.env.PG_HOST!;
    const port = Number(process.env.PG_PORT || "5432");
    const database = process.env.PG_DB!;
    const user = process.env.PG_USER!;
    const password = process.env.PG_PASSWORD!;
    const max = Number(process.env.PG_POOL_MAX || "10");
    const sslMode = (process.env.PG_SSL || "require").toLowerCase() as SSLMode;

    const ssl =
        sslMode === "require" || sslMode === "verify-ca" || sslMode === "verify-full"
            ? { rejectUnauthorized: false }
            : undefined;

    return new Pool({ host, port, database, user, password, max, ssl });
}

function getPool(): Pool {
    if (!pool) pool = buildPool();
    return pool;
}

export async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const p = getPool();
    const client = await p.connect();
    try {
        return await fn(client);
    } finally {
        client.release();
    }
}

export async function query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const p = getPool();
    return p.query(text, params);
}

export type MachineRow = {
    id: string;
    oem_id: string | null;
    serial_number: string | null;
    name: string | null;
    oem_name: string | null;
    last_pos_reported_at?: Date | null;
    last_pos_latitude?: number | null;
    last_pos_longitude?: number | null;
};

export type CustomerRow = {
    // Values from Bjugstad API
    customer_id: number;
    name?: string | null;
    email?: string | null;
    address?: string | null;
    postal_code?: string | null;
    city?: string | null;
    contact?: string | null;
    telephone_number?: string | null;
    organization_number?: string | null;
    customer_number?: number | null;

    // Added values
    phone_normalized?: string | null;
};

export type CustomerContactRow = {
    // Values from Bjugstad API
    customer_id: number;
    contact_person_id: number;
    name?: string | null;
    telephone_number?: string | null;
    email?: string | null;

    // Added values
    phone_normalized?: string | null;
};

/**
 * Bulk UPSERT machines:
 * - insert new rows with first_seen=now(), last_updated=now()
 * - update existing rows' name, oem_name and last_updated=now()
 * - update last position *only if* we get a non-null new value (avoids wiping previous known position)
 */
export async function upsertMachines(rows: MachineRow[]): Promise<number> {
    if (!rows.length) return 0;

    const cols = [
        "id",
        "oem_id",
        "serial_number",
        "name",
        "oem_name",
        "last_pos_reported_at",
        "last_pos_latitude",
        "last_pos_longitude",
    ];
    const values: any[] = [];
    const placeholders: string[] = [];

    rows.forEach((r, i) => {
        const offset = i * cols.length;
        values.push(
            r.id,
            r.oem_id ?? null,
            r.serial_number ?? null,
            r.name ?? null,
            r.oem_name ?? null,
            r.last_pos_reported_at ?? null,
            r.last_pos_latitude ?? null,
            r.last_pos_longitude ?? null,
        );
        placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
        );
    });

    const sql = `
    INSERT INTO machines (
      id,
      oem_id,
      serial_number,
      name,
      oem_name,
      last_pos_reported_at,
      last_pos_latitude,
      last_pos_longitude
    )
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (id) DO UPDATE
      SET oem_id = EXCLUDED.oem_id,
          serial_number = EXCLUDED.serial_number,
          name = EXCLUDED.name,
          oem_name = EXCLUDED.oem_name,
          last_updated = now(),
          last_pos_reported_at = COALESCE(EXCLUDED.last_pos_reported_at, machines.last_pos_reported_at),
          last_pos_latitude    = COALESCE(EXCLUDED.last_pos_latitude,    machines.last_pos_latitude),
          last_pos_longitude   = COALESCE(EXCLUDED.last_pos_longitude,   machines.last_pos_longitude)
  `;

    const res = await query(sql, values);
    return res.rowCount ?? rows.length;
}

export async function upsertCustomers(rows: CustomerRow[]): Promise<number> {
    if (!rows.length) return 0;

    const cols = [
        "customer_id",
        "name",
        "email",
        "address",
        "postal_code",
        "city",
        "contact",
        "telephone_number",
        "organization_number",
        "customer_number",
        "phone_normalized",
    ];

    const values: any[] = [];
    const placeholders: string[] = [];

    rows.forEach((r, idx) => {
        const offset = idx * cols.length;
        values.push(
            r.customer_id,
            r.name ?? null,
            r.email ?? null,
            r.address ?? null,
            r.postal_code ?? null,
            r.city ?? null,
            r.contact ?? null,
            r.telephone_number ?? null,
            r.organization_number ?? null,
            r.customer_number ?? null,
            r.phone_normalized ?? null
        );
        placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`
        );
    });

    const sql = `
    INSERT INTO customers (
        customer_id,
        name,
        email,
        address,
        postal_code,
        city,
        contact,
        telephone_number,
        organization_number,
        customer_number,
        phone_normalized
    )
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (customer_id) DO UPDATE
      SET name = EXCLUDED.name,
          email = EXCLUDED.email,
          address = EXCLUDED.address,
          postal_code = EXCLUDED.postal_code,
          city = EXCLUDED.city,
          contact = EXCLUDED.contact,
          telephone_number = EXCLUDED.telephone_number,
          organization_number = EXCLUDED.organization_number,
          customer_number = EXCLUDED.customer_number,
          phone_normalized = EXCLUDED.phone_normalized
  `;

    const res = await query(sql, values);
    return res.rowCount ?? rows.length;
}

export async function replaceCustomerContacts(
    customerIds: number[],
    rows: CustomerContactRow[],
): Promise<number> {
    if (!customerIds.length) return 0;

    return withClient(async (client) => {
        await client.query("BEGIN");
        try {
            await client.query(
                `DELETE FROM customer_contact_persons WHERE customer_id = ANY($1::int[])`,
                [customerIds],
            );

            let inserted = 0;
            if (rows.length) {
                const cols = [
                    "customer_id",
                    "contact_person_id",
                    "name",
                    "telephone_number",
                    "email",
                    "phone_normalized",
                ];
                const values: any[] = [];
                const placeholders: string[] = [];

                rows.forEach((r, idx) => {
                    const offset = idx * cols.length;
                    values.push(
                        r.customer_id,
                        r.contact_person_id,
                        r.name ?? null,
                        r.telephone_number ?? null,
                        r.email ?? null,
                        r.phone_normalized ?? null,
                    );
                    placeholders.push(
                        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`,
                    );
                });

                const sql = `
                INSERT INTO customer_contact_persons (
                    customer_id,
                    contact_person_id,
                    name,
                    telephone_number,
                    email,
                    phone_normalized
                )
                VALUES ${placeholders.join(", ")}
                ON CONFLICT (customer_id, contact_person_id) DO UPDATE
                  SET name = EXCLUDED.name,
                      telephone_number = EXCLUDED.telephone_number,
                      email = EXCLUDED.email,
                      phone_normalized = EXCLUDED.phone_normalized`;

                const res = await client.query(sql, values);
                inserted = res.rowCount ?? rows.length;
            }

            await client.query("COMMIT");
            return inserted;
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        }
    });
}
