"use client";

import { ChevronDown, Check, UserCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Account } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AccountPickerProps {
  accounts: Account[];
  activeAccountId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

export function AccountPicker({
  accounts,
  activeAccountId,
  onSelect,
  className,
}: AccountPickerProps) {
  const active = accounts.find((a) => a.id === activeAccountId) ?? null;
  const label = active?.name ?? "\u00A0";

  if (accounts.length <= 1) {
    return (
      <h1
        className={cn(
          "account-enter flex min-h-7 items-center gap-1.5 text-xl font-semibold text-white",
          className,
        )}
      >
        {label}
        {active?.role === "member" && (
          <UserCheck
            className="h-4 w-4 shrink-0 text-white/60"
            aria-label="Shared budget"
          />
        )}
      </h1>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "account-enter -ml-1 inline-flex max-w-full items-center gap-1 rounded-lg px-1 py-0.5 text-left text-xl font-semibold text-white transition-colors hover:bg-white/10 active:bg-white/15",
            className,
          )}
          aria-label="Switch budget"
        >
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-white/70"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[12rem]">
        {accounts.map((acc) => {
          const isActive = acc.id === activeAccountId;
          return (
            <DropdownMenuItem
              key={acc.id}
              onSelect={() => onSelect(acc.id)}
              className={cn(
                "flex items-center gap-2",
                isActive && "font-semibold",
              )}
            >
              <Check
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive ? "opacity-100" : "opacity-0",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{acc.name}</span>
              {acc.role === "member" && (
                <UserCheck
                  className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-label="Shared budget"
                />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
