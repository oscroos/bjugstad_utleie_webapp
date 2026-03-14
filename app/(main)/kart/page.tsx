// app/(main)/kart/page.tsx
import MachinesProviderServer from "@/components/MachinesProvider.server";
import MachinesGate from "@/components/MachinesGate";
import MapClient from "./MapClient";

export default function KartPage() {
    return (
        <MachinesProviderServer>
            <MachinesGate>
                <MapClient />
            </MachinesGate>
        </MachinesProviderServer>
    );
}
