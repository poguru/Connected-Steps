"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import UserMenu, { MenuUser } from "@/components/ui/UserMenu";
import NotificationBell from "@/components/ui/NotificationBell";

const NAV_LINKS = [
  { label: "Dashboard",    href: "/dashboard"         },
  { label: "Events",       href: "/dashboard/events"  },
  { label: "Sessions",     href: "/weekend-run"       },
  { label: "Leaderboard",  href: "/leaderboard"  },
  { label: "My Points",    href: "/points"       },
  { label: "Feed",         href: "/feed"         },
  { label: "Community",    href: "/community"    },
  { label: "Achievements", href: "/achievements" },
  { label: "Pricing",      href: "/pricing"      },
];

interface Props {
  user: MenuUser;
  onUserUpdate: (u: MenuUser) => void;
  activeLabel: string;
}

export default function AppNav({ user, onUserUpdate, activeLabel }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="cs-app-nav">
        <div className="cs-app-nav-inner">
          <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
            <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
            <span className="font-display" style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap" }}>
              Connected Steps
            </span>
          </Link>

          <nav className="cs-app-nav-links">
            {NAV_LINKS.map(item => (
              <Link key={item.label} href={item.href}
                style={{ fontSize: "0.875rem", textDecoration: "none", color: item.label === activeLabel ? "var(--primary)" : "var(--muted-foreground)" }}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="cs-app-nav-user">
            <NotificationBell userEmail={user.email} />
            <button
              className="cs-mobile-nav-toggle"
              onClick={() => setOpen(o => !o)}
              aria-label={open ? "Close menu" : "Open menu"}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
            >
              {open ? <X size={22} color="var(--foreground)" /> : <Menu size={22} color="var(--foreground)" />}
            </button>
            <UserMenu user={user} onUserUpdate={onUserUpdate} />
          </div>
        </div>
      </header>

      {open && (
        <div className="cs-mobile-menu" style={{ position: "fixed", top: "var(--nav-total)", left: 0, right: 0, zIndex: 49 }}>
          {NAV_LINKS.map(item => (
            <Link key={item.label} href={item.href}
              onClick={() => setOpen(false)}
              style={{ color: item.label === activeLabel ? "var(--primary)" : "var(--muted-foreground)", fontWeight: item.label === activeLabel ? 600 : 400 }}>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
