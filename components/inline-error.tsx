import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type InlineErrorProps = {
  children: ReactNode;
  className?: string;
};

export function InlineError({ children, className }: InlineErrorProps) {
  return (
    <p className={cn("text-sm text-destructive", className)} role="alert">
      {children}
    </p>
  );
}
