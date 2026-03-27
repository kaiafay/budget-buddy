import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type InlineErrorProps = {
  children: ReactNode;
  className?: string;
  light?: boolean;
};

export function InlineError({ children, className, light }: InlineErrorProps) {
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-sm",
        light ? "text-foreground" : "text-white",
        className,
      )}
      role="alert"
    >
      <AlertCircle
        className={cn(
          "h-4 w-4 shrink-0",
          light ? "text-red-500" : "text-red-300",
        )}
      />
      {children}
    </p>
  );
}
