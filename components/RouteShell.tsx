"use client";

import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";

function isPublicPath(pathname: string) {
  return pathname.startsWith("/login") || pathname.startsWith("/onboarding");
}

export default function RouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const useFade = pathname !== "/kart";
  const contentClassName = useFade
    ? "bg-[radial-gradient(circle_at_top_left,_rgba(190,218,255,0.2),_transparent_24%),linear-gradient(180deg,_#fbfdff_0%,_#f3f7fb_100%)]"
    : "";

  if (isPublicPath(pathname)) {
    return <main className="min-h-screen overflow-y-auto">{children}</main>;
  }

  return <AppShell contentClassName={contentClassName}>{children}</AppShell>;
}
