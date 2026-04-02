import type { ReactNode } from "react";
import Image from "next/image";

interface AuthCardProps {
  children: ReactNode;
  subtitle?: ReactNode;
}

export function AuthCard({ children, subtitle }: AuthCardProps) {
  return (
    <div className="animated-gradient flex min-h-screen items-center justify-center px-6">
      <div className="glass-card w-full max-w-sm rounded-3xl p-6">
        <div className="flex flex-col items-center gap-2 pb-10">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl">
            <Image
              src="/apple-touch-icon.png"
              alt=""
              width={56}
              height={56}
              className="object-cover"
              priority
            />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Budget Buddy
          </h1>
          {subtitle && (
            <p className="text-sm text-white/70">{subtitle}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
