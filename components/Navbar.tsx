// components/Navbar.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { signOut } from "next-auth/react";
import {
  Bars3Icon,
  XMarkIcon,
  ListBulletIcon,
  Squares2X2Icon,
  DocumentTextIcon,
  MapIcon,
  UserIcon,
  UsersIcon,
  BuildingOfficeIcon,
  ArrowLeftEndOnRectangleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { IS_DEV } from "@/lib/constants";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

export default function ResponsiveNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const { data } = useSession();
  const isAdmin = data?.user?.role === "super_admin";

  const mainItems: NavItem[] = [
    { href: "/avtaler", label: "Aktive avtaler", icon: <ListBulletIcon className="h-5 w-5" /> },
    { href: "/historikk", label: "Avtalehistorikk", icon: <Squares2X2Icon className="h-5 w-5" /> },
    { href: "/dokumenter", label: "Dokumenter", icon: <DocumentTextIcon className="h-5 w-5" /> },
    { href: "/kart", label: "Kart", icon: <MapIcon className="h-5 w-5" /> },
    { href: "/profil", label: "Min profil", icon: <UserIcon className="h-5 w-5" /> },
  ];

  // Only shown for admins
  const adminItems: NavItem[] = [
    { href: "/brukere", label: "Brukere", icon: <UsersIcon className="h-5 w-5" /> },
    { href: "/kunder", label: "Kunder", icon: <BuildingOfficeIcon className="h-5 w-5" /> },
    { href: "/aktivitet", label: "Aktivitet", icon: <ClockIcon className="h-5 w-5" /> },
  ];

  const renderLinks = (list: NavItem[]) =>
    list.map(({ href, label, icon }) => {
      const active = pathname === href;
      return (
        <Link
          key={href}
          href={href}
          onClick={() => setIsOpen(false)}
          className={`flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors cursor-pointer
            ${active
              ? "bg-white/20 text-white"
              : "text-slate-200 hover:bg-white/10 hover:text-white"
            }`}
        >
          {icon}
          <span>{label}</span>
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
      <header className="md:hidden flex items-center justify-between bg-gradient-to-b from-[#001a4d] via-[#002c6d] to-[#1c1464] p-4 text-white">
        <button onClick={() => setIsOpen(true)} aria-label="Open menu">
          <Bars3Icon className="h-6 w-6" />
        </button>
        <Image
          src="/bjugstad-logos/horizontal/White.png"
          alt="Bjugstad"
          width={160}
          height={36}
          className="h-9 w-auto"
          priority
        />
      </header>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:fixed md:inset-y-0 md:left-0 md:w-56
                   md:bg-gradient-to-b md:from-[#001a4d] md:via-[#002c6d] md:to-[#1c1464]
                   md:flex md:flex-col"
      >
        <div className="flex h-16 items-center justify-center border-b border-white/10 px-6">
          <Image
            src="/bjugstad-logos/horizontal/White.png"
            alt="Bjugstad"
            width={180}
            height={44}
            className="h-11 w-auto"
            priority
          />
        </div>

        <nav className="mt-4 flex flex-col gap-1 px-4 flex-1">
          {renderLinks(mainItems)}

          {isAdmin && (
            <>
              <AdminDivider />
              {renderLinks(adminItems)}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-white/10 flex flex-col gap-3">
          {IS_DEV && (
            <div className="rounded bg-yellow-500 text-black text-xs font-bold px-2 py-1 text-center">
              DEV MODE
            </div>
          )}

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 w-full rounded px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <ArrowLeftEndOnRectangleIcon className="h-5 w-5" />
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
            <XMarkIcon className="h-6 w-6 text-white" />
          </button>
        </div>

        <nav className="mt-2 flex flex-col gap-1 px-4">
          {renderLinks(mainItems)}

          {isAdmin && (
            <>
              <AdminDivider />
              {renderLinks(adminItems)}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-white/10 flex flex-col gap-3">
          {IS_DEV && (
            <div className="rounded bg-yellow-500 text-black text-xs font-bold px-2 py-1 text-center">
              DEV MODE
            </div>
          )}

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 w-full rounded px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <ArrowLeftEndOnRectangleIcon className="h-5 w-5" />
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
