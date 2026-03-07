"use client";

import { BottomNav } from "@/components/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="animated-gradient mx-auto min-h-screen max-w-lg">
      <div className="animate-in fade-in duration-200 pb-20">{children}</div>
      <BottomNav />
    </div>
  );
}
