import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type InlineErrorProps = {
  children: ReactNode;
  className?: string;
};

export function InlineError({ children, className }: InlineErrorProps) {
  return (
    <p
      className={cn("flex items-center gap-1.5 text-sm text-white", className)}
      role="alert"
    >
      <AlertCircle className="h-4 w-4 shrink-0 text-red-300" />
      {children}
    </p>
  );
}
