"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SWRConfig } from "swr";
import { Plus } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      }}
    >
      <div className="animated-gradient mx-auto flex h-fill-available max-w-lg flex-col">
        <div className="animate-in fade-in duration-200 animated-gradient scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto pt-[env(safe-area-inset-top)] pb-[var(--nav-height)]">
          {children}
        </div>
        {pathname === "/" && (
          <Link
            href="/add"
            className="fixed bottom-[calc(var(--nav-height)+var(--fab-gap))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-[calc(50%-14rem)]"
            aria-label="Add transaction"
          >
            <Plus className="h-5 w-5 text-white" />
          </Link>
        )}
        <BottomNav />
      </div>
    </SWRConfig>
  );
}
