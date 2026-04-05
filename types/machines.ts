// types/machines.ts
import type { Feature, FeatureCollection, Point } from "geojson";

export type MachineProps = {
    id: string | number;
    name: string;
    oem_name: string;
    category: string | null;
    oem_id?: string | null;
    serial_number?: string | null;
    // not optional: the server returns either ISO string or null
    last_pos_reported_at: string | null;
};

export type MachineFeature = Feature<Point, MachineProps>;
export type MachinesFC = FeatureCollection<Point, MachineProps>;

export type MachineListEntry = MachineProps & {
    lat: number | null;
    lng: number | null;
};

export type MachinesData = {
    features: MachinesFC;
    list: MachineListEntry[];
};

export type MachinePositionHistoryEntry = {
    id: string;
    source: string;
    reported_at: string;
    received_at: string;
    lat: number;
    lng: number;
    altitude: number | null;
    speed: number | null;
    heading: number | null;
    km: number | null;
};
