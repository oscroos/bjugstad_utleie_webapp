"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import SideNav from "@/components/Navbar";
import { RouteSkeleton } from "@/components/PageSkeleton";
import Spinner from "@/components/Spinner";

// A navigation that has not finished after this long is treated as failed, and
// the page the user was on is shown again.
const PENDING_TIMEOUT_MS = 20_000;

export default function AppShell({
  children,
  contentClassName = "",
}: {
  children: React.ReactNode;
  contentClassName?: string;
}) {
  const pathname = usePathname();

  // The sidebar tab the user has clicked but whose page has not arrived yet.
  // While it is set, the tab is highlighted and its skeleton replaces the old
  // page at once, instead of the old page staying up until the server answers.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const startNavigation = useCallback((href: string) => {
    setPendingHref(href);
    window.scrollTo(0, 0);
  }, []);

  // The new page (or a redirect target, such as the last opened project) has arrived.
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (!pendingHref) return;
    const clear = () => setPendingHref(null);
    const timeout = window.setTimeout(clear, PENDING_TIMEOUT_MS);
    // Back/forward during a pending navigation cancels it.
    window.addEventListener("popstate", clear);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("popstate", clear);
    };
  }, [pendingHref]);

  return (
    <>
      <SideNav pendingHref={pendingHref} onNavigate={startNavigation} />
      <Suspense
        fallback={
          <main className="md:ml-56 min-h-screen grid place-items-center">
            <Spinner label="Laster side..." />
          </main>
        }
      >
        <main className={`md:ml-56 min-h-screen overflow-y-auto ${contentClassName}`.trim()}>
          {pendingHref ? <RouteSkeleton href={pendingHref} /> : null}
          {/* The current page stays mounted but hidden, so nothing is lost if the navigation is cancelled. */}
          <div className={pendingHref ? "hidden" : "contents"}>{children}</div>
        </main>
      </Suspense>
    </>
  );
}
