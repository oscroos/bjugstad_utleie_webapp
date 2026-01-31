// components/MachinesProvider.server.tsx
// (Server Component)
import { auth } from "@/lib/auth";
import { getVisibleMachinesForUser } from "@/lib/machines";
import { MachinesProvider } from "./MachinesContext";
import { normalizeError } from "@/lib/errors";

export const revalidate = 300;

export default async function MachinesProviderServer({
    children,
}: { children: React.ReactNode }) {
    try {
        const session = await auth();
        const machines = await getVisibleMachinesForUser(session?.user ?? null);
        return (
            <MachinesProvider value={{ status: "ready", data: machines }}>
                {children}
            </MachinesProvider>
        );
    } catch (e) {
        const appErr = normalizeError(e);
        // Don’t throw — we want to render the UI with an error panel instead of crashing
        return (
            <MachinesProvider value={{ status: "error", error: appErr }}>
                {children}
            </MachinesProvider>
        );
    }
}
