// app/(main)/kart/page.tsx
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
