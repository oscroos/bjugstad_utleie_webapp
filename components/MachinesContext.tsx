// components/MachinesContext.tsx
"use client";

import { createContext, useContext } from "react";
import type { AppError } from "@/lib/errors";
import type {
    MachinesFC,
    MachineFeature,
    MachineProps,
    MachineListEntry,
    MachinesData,
    MachineAgreementSummary,
} from "@/types/machines";

function normalizeAgreementSummary(input: any): MachineAgreementSummary | null {
    if (!input || typeof input !== "object") return null;
    const agreementId = input.id;
    if (typeof agreementId !== "string" && typeof agreementId !== "number") {
        return null;
    }

    const machines = Array.isArray(input.machines)
        ? input.machines.map((machine: any) => ({
            id:
                typeof machine?.id === "string" || typeof machine?.id === "number"
                    ? machine.id
                    : undefined,
            name: machine?.name != null ? String(machine.name) : null,
            make: machine?.make != null ? String(machine.make) : null,
        }))
        : null;

    return {
        id: String(agreementId),
        customerId:
            input.customerId != null && input.customerId !== ""
                ? Number(input.customerId)
                : null,
        customerName: input.customerName != null ? String(input.customerName) : null,
        startDate: input.startDate != null ? String(input.startDate) : null,
        endDate: input.endDate != null ? String(input.endDate) : null,
        comment: input.comment != null ? String(input.comment) : null,
        projectNumber: input.projectNumber != null ? String(input.projectNumber) : null,
        contactPersonName: input.contactPersonName != null ? String(input.contactPersonName) : null,
        contactPersonTelephoneNumber:
            input.contactPersonTelephoneNumber != null
                ? String(input.contactPersonTelephoneNumber)
                : null,
        contactPersonEmail: input.contactPersonEmail != null ? String(input.contactPersonEmail) : null,
        customerContactPersonId:
            input.customerContactPersonId != null && input.customerContactPersonId !== ""
                ? Number(input.customerContactPersonId)
                : null,
        customerContactPersonName:
            input.customerContactPersonName != null ? String(input.customerContactPersonName) : null,
        customerContactPersonTelephoneNumber:
            input.customerContactPersonTelephoneNumber != null
                ? String(input.customerContactPersonTelephoneNumber)
                : null,
        customerContactPersonEmail:
            input.customerContactPersonEmail != null
                ? String(input.customerContactPersonEmail)
                : null,
        insuranceIncluded: typeof input.insuranceIncluded === "boolean" ? input.insuranceIncluded : null,
        contractPrice: typeof input.contractPrice === "boolean" ? input.contractPrice : null,
        location: input.location != null ? String(input.location) : null,
        createdBy: input.createdBy != null ? String(input.createdBy) : null,
        createdByTelephoneNumber:
            input.createdByTelephoneNumber != null ? String(input.createdByTelephoneNumber) : null,
        machines,
    };
}

/** Ensure we always have the core machine fields on properties */
function normalizeMachinesFC(input: any): MachinesFC {
    const features: MachineFeature[] = (input?.features ?? []).map((f: any) => {
        const p = f?.properties ?? {};
        const props: MachineProps = {
            id: p.id,
            name: p.name ?? "",
            oem_name: p.oem_name ?? "",
            category: p.category != null ? String(p.category) : null,
            active_agreement_id: p.active_agreement_id != null ? String(p.active_agreement_id) : null,
            active_agreement: normalizeAgreementSummary(p.active_agreement),
            active_customer_id:
                p.active_customer_id != null && p.active_customer_id !== ""
                    ? Number(p.active_customer_id)
                    : null,
            active_customer_name: p.active_customer_name != null ? String(p.active_customer_name) : null,
            last_pos_reported_at:
                p.last_pos_reported_at != null ? String(p.last_pos_reported_at) : null,
        };
        return {
            type: "Feature",
            geometry: f.geometry,
            properties: props,
        } as MachineFeature;
    });

    return { type: "FeatureCollection", features };
}

function normalizeMachinesList(input: any): MachineListEntry[] {
    const list = Array.isArray(input) ? input : [];
    return list.map((entry: any) => ({
        id: entry?.id,
        name: String(entry?.name ?? "N/A"),
        oem_name: String(entry?.oem_name ?? "N/A"),
        category: entry?.category != null ? String(entry.category) : null,
        active_agreement_id:
            entry?.active_agreement_id != null ? String(entry.active_agreement_id) : null,
        active_agreement: normalizeAgreementSummary(entry?.active_agreement),
        active_customer_id:
            entry?.active_customer_id != null && entry?.active_customer_id !== ""
                ? Number(entry.active_customer_id)
                : null,
        active_customer_name:
            entry?.active_customer_name != null ? String(entry.active_customer_name) : null,
        last_pos_reported_at:
            entry?.last_pos_reported_at != null ? String(entry.last_pos_reported_at) : null,
        lat: entry?.lat != null ? Number(entry.lat) : null,
        lng: entry?.lng != null ? Number(entry.lng) : null,
    }));
}

export type MachinesState =
    | { status: "ready"; data: MachinesData }
    | { status: "error"; error: AppError }
    | { status: "loading" }; // used by Suspense fallback only

const MachinesCtx = createContext<MachinesState | null>(null);

export function useMachinesState() {
    const v = useContext(MachinesCtx);
    if (!v) throw new Error("Machines context not available");
    return v;
}

/** Back-compat: returns data or throws a helpful error if not ready */
export function useMachines(): MachinesFC {
    const s = useMachinesState();
    if (s.status === "ready") return s.data.features;
    if (s.status === "error") throw new Error("Maskindata er ikke tilgjengelig (error state).");
    throw new Error("Maskindata lastes fortsatt."); // loading
}

export function useMachinesList(): MachineListEntry[] {
    const s = useMachinesState();
    if (s.status === "ready") return s.data.list;
    if (s.status === "error") throw new Error("Maskindata er ikke tilgjengelig (error state).");
    throw new Error("Maskindata lastes fortsatt."); // loading
}

export function MachinesProvider({
    value,
    children,
}: {
    // Allow legacy callers to pass loosely-typed data; we normalize below.
    value: any;
    children: React.ReactNode;
}) {
    let normalized: MachinesState;

    if (value?.status === "ready") {
        normalized = {
            status: "ready",
            data: {
                features: normalizeMachinesFC(value.data?.features),
                list: normalizeMachinesList(value.data?.list),
            },
        };
    } else if (value?.status === "error") {
        normalized = { status: "error", error: value.error };
    } else {
        normalized = { status: "loading" };
    }

    return <MachinesCtx.Provider value={normalized}>{children}</MachinesCtx.Provider>;
}

// Optional: export the normalizer if you want to reuse it elsewhere.
export { normalizeMachinesFC };
