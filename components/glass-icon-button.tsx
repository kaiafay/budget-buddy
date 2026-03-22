"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const glassIconButtonClassName =
  "flex h-9 w-9 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white active:bg-white/15";

export type GlassIconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  "aria-label": string;
};

export const GlassIconButton = React.forwardRef<
  HTMLButtonElement,
  GlassIconButtonProps
>(function GlassIconButton({ className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(glassIconButtonClassName, className)}
      {...props}
    />
  );
});
