// app/(main)/kart/page.tsx
export const revalidate = 0; // page itself doesn't fetch; let provider control caching

import MachinesProviderServer from "@/components/MachinesProvider.server";
import MachinesGate from "@/components/MachinesGate";
import Map from "./Map";

export default function KartPage() {
    return (
        <MachinesProviderServer>
            <MachinesGate>
                <Map />
            </MachinesGate>
        </MachinesProviderServer>
    );
}
