"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, List, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Calendar", icon: CalendarDays },
  { href: "/transactions", label: "Transactions", icon: List },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="nav-opaque fixed bottom-0 left-0 right-0 z-50 pb-[var(--nav-bottom)]"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-lg items-center justify-around py-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-overlay flex flex-col items-center gap-0.5 px-4 py-1 text-xs transition-colors",
                isActive ? "text-white" : "text-white/50",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon className="h-5 w-5" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
