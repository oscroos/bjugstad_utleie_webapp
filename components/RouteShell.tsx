"use client";

import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";

function isPublicPath(pathname: string) {
  return pathname.startsWith("/login") || pathname.startsWith("/onboarding");
}

export default function RouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isPublicPath(pathname)) {
    return <main className="min-h-screen overflow-y-auto">{children}</main>;
  }

  return <AppShell>{children}</AppShell>;
}
