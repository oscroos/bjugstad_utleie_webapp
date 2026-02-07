// components/Navbar.tsx
"use client";

import { useState, useEffect, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import {
  IconMenu2,
  IconX,
  IconListDetails,
  IconFileText,
  IconBackhoe,
  IconMap2,
  IconUser,
  IconUsers,
  IconBuilding,
  IconLogout,
  IconClock,
  IconLoader2,
} from "@tabler/icons-react";
import { IS_DEV } from "@/lib/constants";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

export default function ResponsiveNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [loadingHref, setLoadingHref] = useState<string | null>(null);

  useEffect(() => {
    setLoadingHref(null);
  }, [pathname]);

  const { data } = useSession();
  const isAdmin = (data?.user as any)?.role === "super_admin";

  const mainItems: NavItem[] = [
    { href: "/avtaler", label: "Avtaler", icon: <IconListDetails className="h-5 w-5" /> },
    { href: "/dokumenter", label: "Dokumenter", icon: <IconFileText className="h-5 w-5" /> },
    { href: "/maskiner", label: "Maskiner", icon: <IconBackhoe className="h-5 w-5" /> },
    { href: "/kart", label: "Kart", icon: <IconMap2 className="h-5 w-5" /> },
    { href: "/profil", label: "Min profil", icon: <IconUser className="h-5 w-5" /> },
  ];

  // Only shown for admins
  const adminItems: NavItem[] = [
    { href: "/brukere", label: "Brukere", icon: <IconUsers className="h-5 w-5" /> },
    { href: "/kunder", label: "Kunder", icon: <IconBuilding className="h-5 w-5" /> },
    { href: "/aktivitet", label: "Aktivitet", icon: <IconClock className="h-5 w-5" /> },
  ];

  const renderLinks = (list: NavItem[]) =>
    list.map(({ href, label, icon }) => {
      const active = pathname === href;
      const isLoading = loadingHref === href && !active;

      const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
          return;
        }

        setIsOpen(false);
        if (!active) {
          setLoadingHref(href);
        }
      };

      return (
        <Link
          key={href}
          href={href}
          onClick={handleClick}
          className={`flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors cursor-pointer
            ${active
              ? "bg-white/20 text-white"
              : "text-slate-200 hover:bg-white/10 hover:text-white"
            }`}
          aria-busy={isLoading}
        >
          {icon}
          <span className="flex-1">{label}</span>
          {isLoading && (
            <IconLoader2 className="h-4 w-4 animate-spin text-white" />
          )}
        </Link>
      );
    });

  const AdminDivider = () => (
    <div className="mt-4 mb-2 px-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
        <span className="flex-1 h-px bg-white/10" />
        <span>Admin</span>
        <span className="flex-1 h-px bg-white/10" />
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile topbar */}
      <header className="md:hidden relative flex items-center justify-center bg-gradient-to-b from-[#001a4d] via-[#002c6d] to-[#1c1464] p-4 text-white">
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open menu"
          className="absolute left-4"
        >
          <IconMenu2 className="h-6 w-6" />
        </button>
        <Link href="/" aria-label="Gå til startsiden">
          <Image
            src="/bjugstad-logos/horizontal/White.png"
            alt="Bjugstad"
            width={160}
            height={36}
            className="h-9 w-auto"
            priority
          />
        </Link>
      </header>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:fixed md:inset-y-0 md:left-0 md:w-56
                   md:bg-gradient-to-b md:from-[#001a4d] md:via-[#002c6d] md:to-[#1c1464]
                   md:flex md:flex-col"
      >
        <div className="flex h-16 items-center justify-center border-b border-white/10 px-6">
          <Link href="/" aria-label="Gå til startsiden">
            <Image
              src="/bjugstad-logos/horizontal/White.png"
              alt="Bjugstad"
              width={180}
              height={44}
              className="h-11 w-auto"
              priority
            />
          </Link>
        </div>

        <nav className="mt-4 flex flex-col gap-1 px-2 flex-1">
          {renderLinks(mainItems)}

          {isAdmin && (
            <>
              <AdminDivider />
              {renderLinks(adminItems)}
            </>
          )}
        </nav>

        <div className="p-2 border-t border-white/10 flex flex-col gap-3">
          {IS_DEV && (
            <div className="rounded bg-yellow-500 text-black text-xs font-bold px-2 py-1 text-center">
              DEV MODE
            </div>
          )}

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 w-full rounded px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <IconLogout className="h-5 w-5" />
            <span>Logg ut</span>
          </button>
        </div>
      </aside>

      {/* Mobile sidebar */}
      <div
        className={`fixed inset-y-0 left-0 w-56
                    bg-gradient-to-b from-[#001a4d] via-[#002c6d] to-[#1c1464]
                    transform transition-transform duration-200 ease-in-out z-50
                    ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex justify-end p-4">
          <button onClick={() => setIsOpen(false)} aria-label="Close menu">
            <IconX className="h-6 w-6 text-white" />
          </button>
        </div>

        <nav className="mt-2 flex flex-col gap-1 px-2">
          {renderLinks(mainItems)}

          {isAdmin && (
            <>
              <AdminDivider />
              {renderLinks(adminItems)}
            </>
          )}
        </nav>

        <div className="p-2 border-t border-white/10 flex flex-col gap-3">
          {IS_DEV && (
            <div className="rounded bg-yellow-500 text-black text-xs font-bold px-2 py-1 text-center">
              DEV MODE
            </div>
          )}

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 w-full rounded px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <IconLogout className="h-5 w-5" />
            <span>Logg ut</span>
          </button>
        </div>
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
        />
      )}
    </>
  );
}
