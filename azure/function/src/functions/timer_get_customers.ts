// azure/function/src/functions/timer_get_customers.ts
import { app, InvocationContext, Timer } from "@azure/functions";
import { fetchCustomers } from "../services/bjugstad";
import {
    CustomerContactRow,
    CustomerRow,
    replaceCustomerContacts,
    upsertCustomers,
} from "../shared/db";

function asNumber(value: any): number | null {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

app.timer("timer_get_customers", {
    schedule: "0 0 0 * * *",
    runOnStartup: false,
    handler: async (_: Timer, ctx: InvocationContext): Promise<void> => {
        const startedAt = new Date().toISOString();
        ctx.log(`timer_get_customers fired at ${startedAt}`);

        try {
            const customers = await fetchCustomers();
            ctx.log(`Fetched ${customers.length} customers from external API`);

            const customerMap = new Map<number, CustomerRow>();
            const contactMap = new Map<string, CustomerContactRow>();

            for (const customer of customers) {
                const customer_id = asNumber(customer?.customerId);

                if (customer_id === null) {
                    ctx.warn?.(`Skipping customer with invalid id: ${customer?.customerId}`);
                    continue;
                }

                customerMap.set(customer_id, {
                    customer_id: customer_id,
                    name: customer.name ?? null,
                    email: customer.email ?? null,
                    address: customer.address ?? null,
                    postal_code: customer.postalCode ?? null,
                    city: customer.city ?? null,
                    contact: customer.contact ?? null,
                    telephone_number: customer.telephoneNumber ?? null,
                    organization_number: customer.organizationNumber ?? null,
                    customer_number: asNumber(customer.customerNumber),
                    phone_normalized: normalizePhone(customer.telephoneNumber),
                });

                const contacts = Array.isArray(customer.contactPersons) ? customer.contactPersons : [];
                for (const person of contacts) {
                    const contactId = asNumber(person?.contactPersonId);
                    if (contactId === null) continue;
                    const key = `${customer_id}:${contactId}`;
                    contactMap.set(key, {
                        customer_id: customer_id,
                        contact_person_id: contactId,
                        name: person.name ?? null,
                        telephone_number: person.telephoneNumber ?? null,
                        email: person.email ?? null,
                        phone_normalized: normalizePhone(person.telephoneNumber),
                    });
                }
            }

            const customerRows = Array.from(customerMap.values());
            const contactRows = Array.from(contactMap.values());
            const customerIds = Array.from(customerMap.keys());

            let upsertedCustomers = 0;
            let affectedContacts = 0;

            if (customerRows.length) {
                upsertedCustomers = await upsertCustomers(customerRows);
            }

            if (customerIds.length) {
                affectedContacts = await replaceCustomerContacts(customerIds, contactRows);
            }

            ctx.log(
                `Customers upserted=${upsertedCustomers}, contact-person rows synced=${affectedContacts}`,
            );

            ctx.log(
                `Customers fetched=${customers.length}; upserted=${upsertedCustomers}; contact-person rows synced=${affectedContacts}`,
            );
        } catch (err: any) {
            const message = err?.message || String(err);
            ctx.error?.(`timer_get_customers error: ${message}`);
            throw (err instanceof Error ? err : new Error(String(err)));
        }
    },
});

/**
 * Normalize a phone number to E.164-ish format.
 *
 * Rules:
 *  - Remove whitespace and common separators.
 *  - If it starts with "+", keep it and ensure the rest is digits.
 *  - If it starts with "00", convert to "+" (e.g. "0046..." -> "+46...").
 *  - If it has only digits (no country prefix), assume Norwegian and prefix "+47".
 *  - If it contains letters or otherwise looks invalid, return null.
 *
 * Examples:
 *   "90914271"          -> "+4790914271"
 *   "476 84 728"        -> "+4747684728"
 *   "+370 65849390"     -> "+37065849390"
 *   "0046 702289760"    -> "+46702289760"
 *   "Roos"              -> null
 */
export function normalizePhone(raw: unknown): string | null {
    if (raw === null || raw === undefined) return null;

    let s = String(raw).trim();
    if (!s) return null;

    // treat literal "null"/"undefined"/"NaN" as missing
    if (/^(null|undefined|nan)$/i.test(s)) return null;

    // remove whitespace and common separators
    s = s.replace(/[\s\-().]/g, "");
    if (!s) return null;

    // already in +<digits> form
    if (s.startsWith("+")) {
        const digits = s.slice(1);
        if (/^\d+$/.test(digits)) {
            return "+" + digits;
        }
        return null; // contains invalid chars after +
    }

    // "00" international prefix -> "+"
    if (s.startsWith("00")) {
        const digits = s.slice(2);
        if (/^\d+$/.test(digits) && digits.length > 0) {
            return "+" + digits;
        }
        return null;
    }

    // Must be all digits from here
    if (!/^\d+$/.test(s)) return null;

    // Too short to be a real phone number -> discard
    if (s.length < 7) return null;

    // Local style (no country code) -> assume Norway (+47)
    if (s.length === 8) {
        return "+47" + s;
    }

    // Probably already includes country code but missing "+" (e.g. "4791234567")
    return "+" + s;
}