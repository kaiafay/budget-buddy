"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="animated-gradient mx-auto min-h-screen max-w-lg">
      <div className="animate-in fade-in duration-200 pb-20">{children}</div>
      {pathname === "/" && (
        <Link
          href="/add"
          className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-[calc(50%-14rem)]"
          aria-label="Add transaction"
        >
          <Plus className="h-5 w-5 text-white" />
        </Link>
      )}
      <BottomNav />
    </div>
  );
}
