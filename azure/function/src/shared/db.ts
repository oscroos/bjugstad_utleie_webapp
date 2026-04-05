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
    model?: string | null;
    production_year?: string | null;
    category?: string | null;
    registration_number?: string | null;
    rail_control_date?: Date | null;
    control_date?: Date | null;
    trackunit_id?: string | null;
    leasing_company?: string | null;
    last_pos_reported_at?: Date | null;
    last_pos_latitude?: number | null;
    last_pos_longitude?: number | null;
    altitude?: number | null;
    speed?: number | null;
    heading?: number | null;
    km?: number | null;
    telemetry_source?: string | null;
};

export type TrackunitTelemetryRow = {
    trackunit_id: string;
    last_pos_reported_at?: Date | null;
    last_pos_latitude?: number | null;
    last_pos_longitude?: number | null;
    altitude?: number | null;
    speed?: number | null;
    heading?: number | null;
    km?: number | null;
};

type MachineHistorySourceRow = Pick<
    MachineRow,
    | "id"
    | "telemetry_source"
    | "last_pos_reported_at"
    | "last_pos_latitude"
    | "last_pos_longitude"
    | "altitude"
    | "speed"
    | "heading"
    | "km"
>;

export type MachineTelemetryRow = Omit<MachineHistorySourceRow, "telemetry_source"> & {
    telemetry_source: string;
};

type MachinePositionHistoryRow = {
    machine_id: string;
    source: string;
    reported_at: Date;
    latitude: number;
    longitude: number;
    altitude?: number | null;
    speed?: number | null;
    heading?: number | null;
    km?: number | null;
};

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function toMachineHistoryRows(rows: MachineHistorySourceRow[]): MachinePositionHistoryRow[] {
    return rows.flatMap((row) => {
        if (!row.telemetry_source || !row.last_pos_reported_at) return [];
        if (!isFiniteNumber(row.last_pos_latitude) || !isFiniteNumber(row.last_pos_longitude)) return [];

        return [{
            machine_id: row.id,
            source: row.telemetry_source,
            reported_at: row.last_pos_reported_at,
            latitude: row.last_pos_latitude,
            longitude: row.last_pos_longitude,
            altitude: row.altitude ?? null,
            speed: row.speed ?? null,
            heading: row.heading ?? null,
            km: row.km ?? null,
        }];
    });
}

async function insertMachinePositionHistory(
    client: PoolClient,
    rows: MachinePositionHistoryRow[],
): Promise<number> {
    if (!rows.length) return 0;

    const cols = [
        "machine_id",
        "source",
        "reported_at",
        "latitude",
        "longitude",
        "altitude",
        "speed",
        "heading",
        "km",
    ];

    const values: any[] = [];
    const placeholders: string[] = [];

    rows.forEach((row, i) => {
        const offset = i * cols.length;
        values.push(
            row.machine_id,
            row.source,
            row.reported_at,
            row.latitude,
            row.longitude,
            row.altitude ?? null,
            row.speed ?? null,
            row.heading ?? null,
            row.km ?? null,
        );
        placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`
        );
    });

    const sql = `
    INSERT INTO machine_position_history (
      machine_id,
      source,
      reported_at,
      latitude,
      longitude,
      altitude,
      speed,
      heading,
      km
    )
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (machine_id, source, reported_at) DO NOTHING
  `;

    const res = await client.query(sql, values);
    return res.rowCount ?? 0;
}

function buildTelemetryUpdateSql(placeholders: string[], keyColumn: "id" | "trackunit_id") {
    return `
    UPDATE machines AS m
       SET last_updated = now(),
           last_pos_reported_at = CASE
             WHEN v.last_pos_reported_at::timestamp IS NOT NULL
              AND (m.last_pos_reported_at IS NULL OR v.last_pos_reported_at::timestamp > m.last_pos_reported_at)
             THEN v.last_pos_reported_at::timestamp
             ELSE m.last_pos_reported_at
           END,
           last_pos_latitude = CASE
             WHEN v.last_pos_reported_at::timestamp IS NOT NULL
              AND (m.last_pos_reported_at IS NULL OR v.last_pos_reported_at::timestamp > m.last_pos_reported_at)
             THEN COALESCE(v.last_pos_latitude::double precision, m.last_pos_latitude)
             ELSE m.last_pos_latitude
           END,
           last_pos_longitude = CASE
             WHEN v.last_pos_reported_at::timestamp IS NOT NULL
              AND (m.last_pos_reported_at IS NULL OR v.last_pos_reported_at::timestamp > m.last_pos_reported_at)
             THEN COALESCE(v.last_pos_longitude::double precision, m.last_pos_longitude)
             ELSE m.last_pos_longitude
           END,
           altitude = CASE
             WHEN v.last_pos_reported_at::timestamp IS NOT NULL
              AND (m.last_pos_reported_at IS NULL OR v.last_pos_reported_at::timestamp > m.last_pos_reported_at)
             THEN COALESCE(v.altitude::double precision, m.altitude)
             ELSE m.altitude
           END,
           speed = CASE
             WHEN v.last_pos_reported_at::timestamp IS NOT NULL
              AND (m.last_pos_reported_at IS NULL OR v.last_pos_reported_at::timestamp > m.last_pos_reported_at)
             THEN COALESCE(v.speed::double precision, m.speed)
             ELSE m.speed
           END,
           heading = CASE
             WHEN v.last_pos_reported_at::timestamp IS NOT NULL
              AND (m.last_pos_reported_at IS NULL OR v.last_pos_reported_at::timestamp > m.last_pos_reported_at)
             THEN COALESCE(v.heading::double precision, m.heading)
             ELSE m.heading
           END,
           km = CASE
             WHEN v.last_pos_reported_at::timestamp IS NOT NULL
              AND (m.last_pos_reported_at IS NULL OR v.last_pos_reported_at::timestamp > m.last_pos_reported_at)
             THEN COALESCE(v.km::double precision, m.km)
             ELSE m.km
           END
      FROM (
        VALUES ${placeholders.join(", ")}
      ) AS v(
        ${keyColumn},
        last_pos_reported_at,
        last_pos_latitude,
        last_pos_longitude,
        altitude,
        speed,
        heading,
        km
      )
     WHERE m.${keyColumn} = v.${keyColumn}
  `;
}

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
 * - update existing identity/metadata fields and last_updated=now()
 * - append valid telemetry points to machine_position_history
 * - update the current snapshot only when the incoming telemetry is newer
 */
export async function upsertMachines(rows: MachineRow[]): Promise<number> {
    if (!rows.length) return 0;

    const cols = [
        "id",
        "oem_id",
        "serial_number",
        "name",
        "oem_name",
        "model",
        "production_year",
        "category",
        "registration_number",
        "rail_control_date",
        "control_date",
        "trackunit_id",
        "leasing_company",
        "last_pos_reported_at",
        "last_pos_latitude",
        "last_pos_longitude",
        "altitude",
        "speed",
        "heading",
        "km",
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
            r.model ?? null,
            r.production_year ?? null,
            r.category ?? null,
            r.registration_number ?? null,
            r.rail_control_date ?? null,
            r.control_date ?? null,
            r.trackunit_id ?? null,
            r.leasing_company ?? null,
            r.last_pos_reported_at ?? null,
            r.last_pos_latitude ?? null,
            r.last_pos_longitude ?? null,
            r.altitude ?? null,
            r.speed ?? null,
            r.heading ?? null,
            r.km ?? null,
        );
        placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19}, $${offset + 20})`
        );
    });

    const sql = `
    INSERT INTO machines (
      id,
      oem_id,
      serial_number,
      name,
      oem_name,
      model,
      production_year,
      category,
      registration_number,
      rail_control_date,
      control_date,
      trackunit_id,
      leasing_company,
      last_pos_reported_at,
      last_pos_latitude,
      last_pos_longitude,
      altitude,
      speed,
      heading,
      km
    )
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (id) DO UPDATE
      SET oem_id = EXCLUDED.oem_id,
          serial_number = EXCLUDED.serial_number,
          name = EXCLUDED.name,
          oem_name = EXCLUDED.oem_name,
          model = EXCLUDED.model,
          production_year = EXCLUDED.production_year,
          category = EXCLUDED.category,
          registration_number = EXCLUDED.registration_number,
          rail_control_date = EXCLUDED.rail_control_date,
          control_date = EXCLUDED.control_date,
          trackunit_id = EXCLUDED.trackunit_id,
          leasing_company = EXCLUDED.leasing_company,
          last_updated = now(),
          last_pos_reported_at = CASE
            WHEN EXCLUDED.last_pos_reported_at IS NOT NULL
             AND (machines.last_pos_reported_at IS NULL OR EXCLUDED.last_pos_reported_at > machines.last_pos_reported_at)
            THEN EXCLUDED.last_pos_reported_at
            ELSE machines.last_pos_reported_at
          END,
          last_pos_latitude = CASE
            WHEN EXCLUDED.last_pos_reported_at IS NOT NULL
             AND (machines.last_pos_reported_at IS NULL OR EXCLUDED.last_pos_reported_at > machines.last_pos_reported_at)
            THEN COALESCE(EXCLUDED.last_pos_latitude, machines.last_pos_latitude)
            ELSE machines.last_pos_latitude
          END,
          last_pos_longitude = CASE
            WHEN EXCLUDED.last_pos_reported_at IS NOT NULL
             AND (machines.last_pos_reported_at IS NULL OR EXCLUDED.last_pos_reported_at > machines.last_pos_reported_at)
            THEN COALESCE(EXCLUDED.last_pos_longitude, machines.last_pos_longitude)
            ELSE machines.last_pos_longitude
          END,
          altitude = CASE
            WHEN EXCLUDED.last_pos_reported_at IS NOT NULL
             AND (machines.last_pos_reported_at IS NULL OR EXCLUDED.last_pos_reported_at > machines.last_pos_reported_at)
            THEN COALESCE(EXCLUDED.altitude, machines.altitude)
            ELSE machines.altitude
          END,
          speed = CASE
            WHEN EXCLUDED.last_pos_reported_at IS NOT NULL
             AND (machines.last_pos_reported_at IS NULL OR EXCLUDED.last_pos_reported_at > machines.last_pos_reported_at)
            THEN COALESCE(EXCLUDED.speed, machines.speed)
            ELSE machines.speed
          END,
          heading = CASE
            WHEN EXCLUDED.last_pos_reported_at IS NOT NULL
             AND (machines.last_pos_reported_at IS NULL OR EXCLUDED.last_pos_reported_at > machines.last_pos_reported_at)
            THEN COALESCE(EXCLUDED.heading, machines.heading)
            ELSE machines.heading
          END,
          km = CASE
            WHEN EXCLUDED.last_pos_reported_at IS NOT NULL
             AND (machines.last_pos_reported_at IS NULL OR EXCLUDED.last_pos_reported_at > machines.last_pos_reported_at)
            THEN COALESCE(EXCLUDED.km, machines.km)
            ELSE machines.km
          END
  `;

    return withClient(async (client) => {
        await client.query("BEGIN");

        try {
            await insertMachinePositionHistory(client, toMachineHistoryRows(rows));
            const res = await client.query(sql, values);
            await client.query("COMMIT");
            return res.rowCount ?? rows.length;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
    });
}

export async function updateMachineTelemetry(rows: MachineTelemetryRow[]): Promise<number> {
    if (!rows.length) return 0;

    const cols = [
        "id",
        "last_pos_reported_at",
        "last_pos_latitude",
        "last_pos_longitude",
        "altitude",
        "speed",
        "heading",
        "km",
    ];

    const values: any[] = [];
    const placeholders: string[] = [];

    rows.forEach((row, i) => {
        const offset = i * cols.length;
        values.push(
            row.id,
            row.last_pos_reported_at ?? null,
            row.last_pos_latitude ?? null,
            row.last_pos_longitude ?? null,
            row.altitude ?? null,
            row.speed ?? null,
            row.heading ?? null,
            row.km ?? null,
        );
        placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
        );
    });

    const sql = buildTelemetryUpdateSql(placeholders, "id");

    return withClient(async (client) => {
        await client.query("BEGIN");

        try {
            const machineIds = [...new Set(
                rows
                    .filter((row) => String(row.id ?? "").trim())
                    .map((row) => String(row.id)),
            )];

            if (machineIds.length) {
                const { rows: matchedRows } = await client.query<{ id: string }>(
                    `
                    SELECT id
                    FROM machines
                    WHERE id = ANY($1::text[])
                    `,
                    [machineIds],
                );

                const matchedIds = new Set(matchedRows.map((row) => row.id));
                const resolvedHistoryRows = toMachineHistoryRows(
                    rows.filter((row) => matchedIds.has(String(row.id))),
                );

                await insertMachinePositionHistory(client, resolvedHistoryRows);
            }

            const res = await client.query(sql, values);
            await client.query("COMMIT");
            return res.rowCount ?? 0;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
    });
}

export async function updateTrackunitTelemetry(rows: TrackunitTelemetryRow[]): Promise<number> {
    if (!rows.length) return 0;

    const cols = [
        "trackunit_id",
        "last_pos_reported_at",
        "last_pos_latitude",
        "last_pos_longitude",
        "altitude",
        "speed",
        "heading",
        "km",
    ];

    const values: any[] = [];
    const placeholders: string[] = [];

    rows.forEach((r, i) => {
        const offset = i * cols.length;
        values.push(
            r.trackunit_id,
            r.last_pos_reported_at ?? null,
            r.last_pos_latitude ?? null,
            r.last_pos_longitude ?? null,
            r.altitude ?? null,
            r.speed ?? null,
            r.heading ?? null,
            r.km ?? null,
        );
        placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
        );
    });

    const sql = buildTelemetryUpdateSql(placeholders, "trackunit_id");

    return withClient(async (client) => {
        await client.query("BEGIN");

        try {
            const trackunitIds = [...new Set(
                rows
                    .filter((row) =>
                        !!row.trackunit_id &&
                        !!row.last_pos_reported_at &&
                        isFiniteNumber(row.last_pos_latitude) &&
                        isFiniteNumber(row.last_pos_longitude),
                    )
                    .map((row) => row.trackunit_id as string),
            )];

            if (trackunitIds.length) {
                const { rows: matchedRows } = await client.query<{
                    id: string;
                    trackunit_id: string;
                }>(
                    `
                    SELECT id, trackunit_id
                    FROM machines
                    WHERE trackunit_id = ANY($1::text[])
                    `,
                    [trackunitIds],
                );

                const machineIdByTrackunitId = new Map(
                    matchedRows.map((matched) => [matched.trackunit_id, matched.id]),
                );

                const resolvedHistoryRows = rows.flatMap((row) => {
                    if (!row.last_pos_reported_at) return [];
                    if (!isFiniteNumber(row.last_pos_latitude) || !isFiniteNumber(row.last_pos_longitude)) return [];

                    const machineId = machineIdByTrackunitId.get(row.trackunit_id);
                    if (!machineId) return [];

                    return [{
                        machine_id: machineId,
                        source: "trackunit",
                        reported_at: row.last_pos_reported_at,
                        latitude: row.last_pos_latitude,
                        longitude: row.last_pos_longitude,
                        altitude: row.altitude ?? null,
                        speed: row.speed ?? null,
                        heading: row.heading ?? null,
                        km: row.km ?? null,
                    }];
                });

                await insertMachinePositionHistory(client, resolvedHistoryRows);
            }

            const res = await client.query(sql, values);
            await client.query("COMMIT");
            return res.rowCount ?? 0;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
    });
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
