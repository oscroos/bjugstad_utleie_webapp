// types/machines.ts
import type { Feature, FeatureCollection, Point } from "geojson";

export type MachineAgreementMachine = {
    id?: string | number;
    name?: string | null;
    make?: string | null;
};

export type MachineAgreementSummary = {
    id: string;
    customerId?: number | null;
    customerName?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    comment?: string | null;
    projectNumber?: string | null;
    contactPersonName?: string | null;
    contactPersonTelephoneNumber?: string | null;
    contactPersonEmail?: string | null;
    customerContactPersonId?: number | null;
    customerContactPersonName?: string | null;
    customerContactPersonTelephoneNumber?: string | null;
    customerContactPersonEmail?: string | null;
    insuranceIncluded?: boolean | null;
    contractPrice?: boolean | null;
    location?: string | null;
    createdBy?: string | null;
    createdByTelephoneNumber?: string | null;
    machines?: MachineAgreementMachine[] | null;
};

export type MachineProps = {
    id: string | number;
    name: string;
    oem_name: string;
    category: string | null;
    active_agreement_id?: string | null;
    active_agreement?: MachineAgreementSummary | null;
    active_customer_id?: number | null;
    active_customer_name?: string | null;
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
