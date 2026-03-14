import { Suspense } from "react";
import SideNav from "@/components/Navbar";
import Spinner from "@/components/Spinner";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SideNav />
      <Suspense
        fallback={
          <main className="md:ml-56 min-h-screen grid place-items-center">
            <Spinner label="Laster side..." />
          </main>
        }
      >
        <main className="md:ml-56 min-h-screen overflow-y-auto">{children}</main>
      </Suspense>
    </>
  );
}
