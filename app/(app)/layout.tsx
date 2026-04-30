"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SWRConfig } from "swr";
import { Plus } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { ActiveAccountProvider, useActiveAccount } from "@/components/active-account-provider";
import { withActiveAccountQuery } from "@/lib/url";

const fabClass =
  "fixed bottom-[calc(56px+env(safe-area-inset-bottom,0px)+12px)] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-[calc(50%-14rem)]";

function CalendarFabLink() {
  const { activeAccountId } = useActiveAccount();
  return (
    <Link
      href={withActiveAccountQuery("/add", activeAccountId)}
      className={fabClass}
      aria-label="Add transaction"
    >
      <Plus className="h-5 w-5 text-white" />
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const contentScrollClass =
    "animate-in fade-in duration-200 flex-1 overflow-y-auto pt-[env(safe-area-inset-top,0px)] pb-[calc(56px+env(safe-area-inset-bottom,0px))]";

  return (
    <SWRConfig
      value={{
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
      }}
    >
      <Suspense fallback={null}>
        <ActiveAccountProvider>
          <div className="animated-gradient mx-auto min-h-screen max-w-lg flex flex-col">
            <div className={contentScrollClass}>{children}</div>
            {pathname === "/" && <CalendarFabLink />}
            <BottomNav />
          </div>
        </ActiveAccountProvider>
      </Suspense>
    </SWRConfig>
  );
}
