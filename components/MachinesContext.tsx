// components/MachinesContext.tsx
"use client";

import { createContext, useContext } from "react";
import type { AppError } from "@/lib/errors";
import type { MachinesFC, MachineFeature, MachineProps, MachineListEntry, MachinesData } from "@/types/machines";

/** Ensure we always have { id, name, last_pos_reported_at } on properties */
function normalizeMachinesFC(input: any): MachinesFC {
    const features: MachineFeature[] = (input?.features ?? []).map((f: any) => {
        const p = f?.properties ?? {};
        const props: MachineProps = {
            id: p.id,
            name: p.name ?? "",
            oem_name: p.oem_name ?? "",
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
