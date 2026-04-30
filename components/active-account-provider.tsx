"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import type { Account } from "@/lib/types";
import { fetchAccounts } from "@/lib/api";
import { accountsSwrKey } from "@/lib/swr-keys";

const ACTIVE_ACCOUNT_STORAGE_KEY = "budget-buddy:active-account";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readStoredActiveAccount(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(ACTIVE_ACCOUNT_STORAGE_KEY);
    return value && UUID_REGEX.test(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStoredActiveAccount(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) {
      window.localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(ACTIVE_ACCOUNT_STORAGE_KEY);
    }
  } catch {
    // ignore quota / privacy-mode failures — falls back to first available
  }
}

type ActiveAccountContextValue = {
  accounts: Account[];
  activeAccountId: string | null;
  activeAccount: Account | null;
  setActiveAccount: (id: string) => void;
  isLoading: boolean;
  hasNoAccounts: boolean;
  error: Error | null;
};

const ActiveAccountContext = createContext<ActiveAccountContextValue | null>(null);

export function ActiveAccountProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const urlAccountParam = searchParams.get("account");
  const urlAccountId =
    urlAccountParam && UUID_REGEX.test(urlAccountParam) ? urlAccountParam : null;

  const {
    data: accounts,
    isLoading: accountsLoading,
    error,
  } = useSWR<Account[]>(accountsSwrKey, fetchAccounts);

  const [activeAccountId, setActiveAccountIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Resolve active account once accounts load.
  // Resolution order: URL (?account=) when valid + present → localStorage → first available.
  // URL is read-only input; the picker (setActiveAccount) only writes to localStorage.
  useEffect(() => {
    if (!accounts) return;
    if (accounts.length === 0) {
      setActiveAccountIdState(null);
      setHydrated(true);
      return;
    }
    const accountIds = new Set(accounts.map((a) => a.id));
    if (urlAccountId && accountIds.has(urlAccountId)) {
      setActiveAccountIdState(urlAccountId);
      writeStoredActiveAccount(urlAccountId);
      setHydrated(true);
      return;
    }
    const stored = readStoredActiveAccount();
    if (stored && accountIds.has(stored)) {
      setActiveAccountIdState(stored);
      setHydrated(true);
      return;
    }
    const first = accounts[0].id;
    setActiveAccountIdState(first);
    writeStoredActiveAccount(first);
    setHydrated(true);
  }, [accounts, urlAccountId]);

  const setActiveAccount = useCallback(
    (id: string) => {
      if (!UUID_REGEX.test(id)) return;
      if (!accounts?.some((a) => a.id === id)) return;
      setActiveAccountIdState(id);
      writeStoredActiveAccount(id);
    },
    [accounts],
  );

  const value = useMemo<ActiveAccountContextValue>(() => {
    const resolvedAccounts = accounts ?? [];
    const activeAccount =
      resolvedAccounts.find((a) => a.id === activeAccountId) ?? null;
    return {
      accounts: resolvedAccounts,
      activeAccountId,
      activeAccount,
      setActiveAccount,
      isLoading: accountsLoading || !hydrated,
      hasNoAccounts: !accountsLoading && (accounts?.length ?? 0) === 0,
      error: (error as Error | undefined) ?? null,
    };
  }, [accounts, accountsLoading, activeAccountId, error, hydrated, setActiveAccount]);

  return (
    <ActiveAccountContext.Provider value={value}>
      {children}
    </ActiveAccountContext.Provider>
  );
}

export function useActiveAccount(): ActiveAccountContextValue {
  const ctx = useContext(ActiveAccountContext);
  if (!ctx) {
    throw new Error("useActiveAccount must be used within ActiveAccountProvider");
  }
  return ctx;
}
