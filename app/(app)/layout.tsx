"use client"

import { BottomNav } from "@/components/bottom-nav"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-background">
      <div className="pb-20">
        {children}
      </div>
      <BottomNav />
    </div>
  )
}
