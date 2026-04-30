"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  User,
  DollarSign,
  LogOut,
  Tags,
  Pencil,
  Trash2,
  Plus,
  RefreshCw,
  CheckCircle2,
  Wallet,
  Check,
} from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import useSWR, { useSWRConfig } from "swr";
import { GlassExpenseIncomeToggle } from "@/components/glass-expense-income-toggle";
import { InlineError } from "@/components/inline-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { glassInputClass, glassSectionIconClass } from "@/lib/glass-classes";
import {
  accountsSwrKey,
  calendarMonthSwrKey,
  categoriesSwrKey,
  transactionsSwrKey,
} from "@/lib/swr-keys";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CategoryIcon,
  ALLOWED_CATEGORY_ICON_NAMES,
  getCategoryColor,
} from "@/components/category-icons";
import { fetchCategories, fetchCategoryUsageCount, fetchCalendarData } from "@/lib/api";
import {
  createAccount,
  createCategory,
  updateAccount,
  updateCategory,
  deleteCategory,
  deleteBudget,
  recalibrateBalance,
} from "@/lib/transactions-mutations";
import { getProjectedBalances, sumRecurringBeforeDate } from "@/lib/projection";
import { USER_FACING_ERROR } from "@/lib/errors";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useActiveAccount } from "@/components/active-account-provider";

function formatCurrency(value: number): string {
  const abs = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-$${abs}` : `$${abs}`;
}

export default function SettingsForm() {
  const todayDate = new Date();
  const currentMonth = todayDate.getMonth() + 1;
  const currentYear = todayDate.getFullYear();
  const todayStr = format(todayDate, "yyyy-MM-dd");

  const {
    accounts,
    activeAccountId,
    activeAccount,
    setActiveAccount,
    isLoading: accountsLoading,
  } = useActiveAccount();

  const [accountName, setAccountName] = useState(activeAccount?.name ?? "");
  const [startingBalance, setStartingBalance] = useState(
    activeAccount ? String(activeAccount.starting_balance) : "",
  );
  const [hasSetBalance, setHasSetBalance] = useState(
    (activeAccount?.starting_balance ?? 0) !== 0,
  );
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [isSavingBalance, startSaveBalanceTransition] = useTransition();

  const [recalibrateOpen, setRecalibrateOpen] = useState(false);
  const [actualBalanceInput, setActualBalanceInput] = useState("");
  const [recalibrateError, setRecalibrateError] = useState<string | null>(null);
  const [savedDelta, setSavedDelta] = useState<number | null>(null);
  const [isRecalibrating, startRecalibrateTransition] = useTransition();

  const [createBudgetOpen, setCreateBudgetOpen] = useState(false);
  const [newBudgetName, setNewBudgetName] = useState("");
  const [newBudgetBalance, setNewBudgetBalance] = useState("");
  const [createBudgetError, setCreateBudgetError] = useState<string | null>(null);
  const [isCreatingBudget, startCreateBudgetTransition] = useTransition();

  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data: categories = [] } = useSWR(
    activeAccountId ? categoriesSwrKey(activeAccountId) : null,
    () => fetchCategories(activeAccountId as string),
  );

  // Sync editable fields when the active account changes (e.g. picker switches)
  // or when accounts finish loading.
  useEffect(() => {
    setAccountName(activeAccount?.name ?? "");
    setStartingBalance(
      activeAccount ? String(activeAccount.starting_balance) : "",
    );
    setHasSetBalance((activeAccount?.starting_balance ?? 0) !== 0);
    setAccountError(null);
    setBalanceError(null);
  }, [activeAccount?.id, activeAccount?.name, activeAccount?.starting_balance]);

  const calendarKey =
    recalibrateOpen && activeAccountId
      ? calendarMonthSwrKey(currentMonth, currentYear, activeAccountId)
      : null;
  const { data: calData, isLoading: calLoading } = useSWR(
    calendarKey,
    () => fetchCalendarData(currentMonth, currentYear, activeAccountId as string),
  );

  const projectedTodayBalance = useMemo(() => {
    if (!calData) return null;
    const accountStarting = Number(calData.account?.starting_balance ?? 0);
    const sumTxBefore = (calData.txBefore ?? []).reduce(
      (s, r) => s + Number(r.amount),
      0,
    );
    const mappedRules = (calData.recurringRules ?? []).map((r) => ({
      ...r,
      amount: Number(r.amount),
    }));
    const sumRecBefore = sumRecurringBeforeDate(
      mappedRules,
      calData.firstDayOfMonth,
      calData.exceptions ?? [],
    );
    const carryForward = accountStarting + sumTxBefore + sumRecBefore;
    const balances = getProjectedBalances(
      carryForward,
      (calData.transactions ?? []).map((t) => ({ ...t, amount: Number(t.amount) })),
      mappedRules,
      todayDate.getMonth(),
      currentYear,
      calData.exceptions ?? [],
    );
    return balances[todayStr] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calData]);

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    icon: "Tag",
    type: "expense" as "expense" | "income",
  });
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [deleteUsageCount, setDeleteUsageCount] = useState<{
    transactions: number;
    rules: number;
  } | null>(null);
  const [categoryDeleteError, setCategoryDeleteError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isCategoryPending, startCategoryTransition] = useTransition();
  const [isSigningOut, startSignOutTransition] = useTransition();
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [isDeletingAccount, startDeleteAccountTransition] = useTransition();
  const [budgetToDelete, setBudgetToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleteBudgetError, setDeleteBudgetError] = useState<string | null>(null);
  const [isDeletingBudget, startDeleteBudgetTransition] = useTransition();

  const saveSeqRef = useRef(0);
  const skipNextNameDebounceRef = useRef(true);

  const saveAccountName = useCallback(async () => {
    if (!activeAccountId) return;
    if (!accountName.trim()) return;
    if (activeAccount && accountName === activeAccount.name) return;
    setAccountError(null);
    const seq = ++saveSeqRef.current;
    const { error: updateError } = await updateAccount(activeAccountId, {
      name: accountName.trim(),
    });
    if (updateError) {
      if (seq !== saveSeqRef.current) return;
      setAccountError(USER_FACING_ERROR);
      return;
    }
    if (seq !== saveSeqRef.current) return;
    void mutate(accountsSwrKey);
  }, [accountName, activeAccountId, activeAccount, mutate]);

  const saveAccountNameRef = useRef(saveAccountName);
  saveAccountNameRef.current = saveAccountName;

  useEffect(() => {
    if (skipNextNameDebounceRef.current) {
      skipNextNameDebounceRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void saveAccountNameRef.current();
    }, 1000);
    return () => clearTimeout(timer);
  }, [accountName]);

  // Reset the "skip next debounce" flag whenever the active account changes so
  // the just-loaded name value doesn't trigger an autosave.
  useEffect(() => {
    skipNextNameDebounceRef.current = true;
  }, [activeAccountId]);

  function handleSaveInitialBalance() {
    setBalanceError(null);
    const balance = parseFloat(startingBalance);
    if (Number.isNaN(balance)) {
      setBalanceError("Please enter a valid starting balance.");
      return;
    }
    if (!activeAccountId) return;
    startSaveBalanceTransition(async () => {
      const { error } = await updateAccount(activeAccountId, {
        starting_balance: balance,
      });
      if (error) {
        setBalanceError(USER_FACING_ERROR);
        return;
      }
      setHasSetBalance(true);
      void mutate(accountsSwrKey);
      void mutate(calendarMonthSwrKey(currentMonth, currentYear, activeAccountId));
      void mutate(transactionsSwrKey(activeAccountId));
    });
  }

  function openRecalibrateModal() {
    setActualBalanceInput("");
    setRecalibrateError(null);
    setRecalibrateOpen(true);
  }

  function closeRecalibrateModal() {
    setRecalibrateOpen(false);
    setActualBalanceInput("");
    setRecalibrateError(null);
    setSavedDelta(null);
  }

  function handleRecalibrate() {
    if (projectedTodayBalance === null || !activeAccountId) return;
    const actual = parseFloat(actualBalanceInput);
    if (Number.isNaN(actual)) {
      setRecalibrateError("Please enter a valid amount.");
      return;
    }
    const delta = Math.round((actual - projectedTodayBalance) * 100) / 100;
    if (Math.abs(delta) > 1_000_000) {
      setRecalibrateError(
        "The difference exceeds the maximum adjustment of $1,000,000. Please check the value you entered.",
      );
      return;
    }
    setRecalibrateError(null);
    startRecalibrateTransition(async () => {
      const { error } = await recalibrateBalance({
        accountId: activeAccountId,
        delta,
        date: todayStr,
      });
      if (error) {
        setRecalibrateError(error.message);
        return;
      }
      mutate(transactionsSwrKey(activeAccountId));
      mutate(calendarMonthSwrKey(currentMonth, currentYear, activeAccountId));
      setSavedDelta(delta);
    });
  }

  function openCreateBudgetDialog() {
    setNewBudgetName("");
    setNewBudgetBalance("");
    setCreateBudgetError(null);
    setCreateBudgetOpen(true);
  }

  function closeCreateBudgetDialog() {
    setCreateBudgetOpen(false);
    setNewBudgetName("");
    setNewBudgetBalance("");
    setCreateBudgetError(null);
  }

  function handleCreateBudget(e: React.FormEvent) {
    e.preventDefault();
    setCreateBudgetError(null);
    const name = newBudgetName.trim();
    if (!name) {
      setCreateBudgetError("Enter a budget name.");
      return;
    }
    const parsedBalance =
      newBudgetBalance.trim() === "" ? 0 : parseFloat(newBudgetBalance);
    if (Number.isNaN(parsedBalance)) {
      setCreateBudgetError("Enter a valid starting balance.");
      return;
    }
    startCreateBudgetTransition(async () => {
      const { data, error } = await createAccount({
        name,
        starting_balance: parsedBalance,
      });
      if (error || !data?.id) {
        setCreateBudgetError(USER_FACING_ERROR);
        return;
      }
      await mutate(accountsSwrKey);
      setActiveAccount(data.id);
      closeCreateBudgetDialog();
    });
  }

  function openCategoryDialog(category?: Category) {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        icon: category.icon,
        type: category.type,
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({ name: "", icon: "Tag", type: "expense" });
    }
    setCategoryFormError(null);
    setCategoryDialogOpen(true);
  }

  function closeCategoryDialog() {
    setCategoryDialogOpen(false);
    setEditingCategory(null);
    setCategoryForm({ name: "", icon: "Tag", type: "expense" });
    setCategoryFormError(null);
  }

  function handleCategorySubmit(e: React.FormEvent) {
    e.preventDefault();
    setCategoryFormError(null);
    const name = categoryForm.name.trim();
    if (!name) {
      setCategoryFormError("Enter a name");
      return;
    }
    startCategoryTransition(async () => {
      if (!activeAccountId) {
        setCategoryFormError(USER_FACING_ERROR);
        return;
      }
      if (editingCategory) {
        const { error: err } = await updateCategory(editingCategory.id, {
          name,
          icon: categoryForm.icon,
          type: categoryForm.type,
        });
        if (err) {
          if (
            err.message.includes("categories_account_id_name_key") ||
            err.message.includes("duplicate key")
          ) {
            setCategoryFormError("A category with this name already exists.");
          } else {
            setCategoryFormError(USER_FACING_ERROR);
          }
          return;
        }
      } else {
        const { error: err } = await createCategory({
          accountId: activeAccountId,
          name,
          icon: categoryForm.icon,
          type: categoryForm.type,
        });
        if (err) {
          if (
            err.message.includes("categories_account_id_name_key") ||
            err.message.includes("duplicate key")
          ) {
            setCategoryFormError("A category with this name already exists.");
          } else {
            setCategoryFormError(USER_FACING_ERROR);
          }
          return;
        }
      }
      void mutate(categoriesSwrKey(activeAccountId));
      closeCategoryDialog();
    });
  }

  function requestDeleteCategory(cat: Category) {
    setCategoryDeleteError(null);
    startCategoryTransition(async () => {
      if (!activeAccountId) {
        setCategoryDeleteError(USER_FACING_ERROR);
        return;
      }
      try {
        const count = await fetchCategoryUsageCount(cat.id, activeAccountId);
        if (count.transactions === 0 && count.rules === 0) {
          const { error: err } = await deleteCategory(cat.id);
          if (err) {
            setCategoryDeleteError(USER_FACING_ERROR);
            return;
          }
          void mutate(categoriesSwrKey(activeAccountId));
          return;
        }
        setDeleteUsageCount(count);
        setCategoryToDelete(cat);
      } catch {
        setCategoryDeleteError(USER_FACING_ERROR);
      }
    });
  }

  function confirmDeleteCategory() {
    const id = categoryToDelete?.id;
    if (!id || !activeAccountId) return;
    setCategoryDeleteError(null);
    startCategoryTransition(async () => {
      try {
        const { error: err } = await deleteCategory(id);
        if (err) {
          setCategoryDeleteError(USER_FACING_ERROR);
          return;
        }
        void mutate(categoriesSwrKey(activeAccountId));
        setCategoryToDelete(null);
        setDeleteUsageCount(null);
      } catch {
        setCategoryDeleteError(USER_FACING_ERROR);
      }
    });
  }

  const signOutButtonClass =
    "flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 py-3 text-sm font-medium text-white/70 transition-colors hover:bg-secondary hover:text-foreground active:bg-white/15";
  const dialogSubmitButtonClass =
    "h-11 rounded-xl border border-white/20 bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80";

  if (!accountsLoading && accounts.length === 0) {
    return (
      <div className="flex flex-col gap-5 px-5 pb-8 text-white">
        <div className="page-enter-2 glass-card flex flex-col gap-4 rounded-2xl p-4">
          <div className="flex items-center gap-3 pb-1">
            <div className={glassSectionIconClass}>
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-white">
                Create your first budget
              </span>
              <span className="text-xs text-white/60">
                Track expenses against an opening balance.
              </span>
            </div>
          </div>
          <Button
            type="button"
            onClick={openCreateBudgetDialog}
            className={dialogSubmitButtonClass}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create budget
          </Button>
        </div>

        <CreateBudgetDialog
          open={createBudgetOpen}
          name={newBudgetName}
          balance={newBudgetBalance}
          error={createBudgetError}
          isPending={isCreatingBudget}
          onNameChange={setNewBudgetName}
          onBalanceChange={setNewBudgetBalance}
          onSubmit={handleCreateBudget}
          onClose={closeCreateBudgetDialog}
          submitClassName={dialogSubmitButtonClass}
        />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="flex flex-col gap-5 px-5 pb-8"
    >
      <div className="page-enter-2 glass-card flex flex-col gap-4 rounded-2xl p-4">
        <div className="flex items-center gap-3 pb-1">
          <div className={glassSectionIconClass}>
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">Budgets</span>
            <span className="text-xs text-white/60">
              {accounts.length === 1
                ? "1 budget"
                : `${accounts.length} budgets`}
            </span>
          </div>
        </div>
        {accounts.length > 1 && (
          <ul className="flex flex-col gap-1">
            {accounts.map((acc) => {
              const isActive = acc.id === activeAccountId;
              return (
                <li key={acc.id}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveAccount(acc.id)}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                        isActive
                          ? "border-white/30 bg-white/15 text-white"
                          : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
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
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${acc.name}`}
                      onClick={() => {
                        setDeleteBudgetError(null);
                        setBudgetToDelete({ id: acc.id, name: acc.name });
                      }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/50 transition-colors hover:border-destructive/40 hover:bg-destructive/15 hover:text-red-300 active:bg-destructive/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/20 active:bg-white/15"
          onClick={openCreateBudgetDialog}
        >
          <Plus className="mr-2 h-4 w-4" />
          New budget
        </Button>
      </div>

      <div className="page-enter-2 glass-card flex flex-col gap-4 rounded-2xl p-4">
        <div className="flex items-center gap-3 pb-1">
          <div className={glassSectionIconClass}>
            <User className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-medium text-white">
            {accounts.length > 1 ? "Selected budget" : "Account Details"}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="accountName"
            className="text-xs font-medium text-white/70"
          >
            Name
          </Label>
          <Input
            id="accountName"
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            className={glassInputClass}
            placeholder="e.g. Main Checking"
            disabled={!activeAccountId}
          />
          {accountError && <InlineError>{accountError}</InlineError>}
        </div>
      </div>

      <div className="page-enter-3 glass-card flex flex-col gap-4 rounded-2xl p-4">
        <div className="flex items-center gap-3 pb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DCFCE7]">
            <DollarSign className="h-4 w-4 text-[#16A34A]" />
          </div>
          <span className="text-sm font-medium text-white">
            Starting Balance
          </span>
        </div>

        {hasSetBalance ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-white/50">
              Your opening balance when you started tracking this budget. Use
              Recalibrate to sync Budget Buddy with your actual bank balance.
            </p>
            <div className="flex items-center justify-between rounded-xl border border-white/20 bg-white/10 px-4 py-3">
              <span className="text-xs font-medium text-white/60">
                Opening balance
              </span>
              <span className="tabular-nums text-sm font-medium text-white">
                {formatCurrency(Number(startingBalance))}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/20 active:bg-white/15"
              onClick={openRecalibrateModal}
              disabled={!activeAccountId}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Recalibrate balance
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-white/50">
              Enter your account balance at the time you started tracking in
              Budget Buddy.
            </p>
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="balance"
                className="text-xs font-medium text-white/70"
              >
                Amount
              </Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-white/70">
                  $
                </span>
                <Input
                  id="balance"
                  type="text"
                  inputMode="decimal"
                  value={startingBalance}
                  onChange={(e) => {
                    if (/^-?\d*\.?\d{0,2}$/.test(e.target.value)) {
                      setStartingBalance(e.target.value);
                    }
                  }}
                  className="h-11 rounded-xl border-white/20 bg-white/10 pl-8 tabular-nums text-white placeholder:text-white/40"
                  placeholder="0.00"
                  disabled={!activeAccountId}
                />
              </div>
              {balanceError && <InlineError>{balanceError}</InlineError>}
              <Button
                type="button"
                disabled={isSavingBalance || !startingBalance || !activeAccountId}
                onClick={handleSaveInitialBalance}
                className="h-11 rounded-xl border border-white/20 bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80"
              >
                Save starting balance
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="page-enter-3 glass-card flex flex-col gap-4 rounded-2xl p-4">
        <div className="flex items-center gap-3 pb-1">
          <div className={glassSectionIconClass}>
            <Tags className="h-4 w-4 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">Categories</span>
            <span className="text-xs text-white/60">
              Manage categories for transactions
            </span>
          </div>
        </div>
        {categories.length === 0 ? (
          <p className="text-sm text-white/70">No categories yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {categories.map((cat) => (
              <li
                key={cat.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: getCategoryColor(cat.icon) }}
                >
                  <CategoryIcon
                    iconName={cat.icon}
                    className="h-4 w-4 text-white/80"
                  />
                </div>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                  {cat.name}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium capitalize",
                    cat.type === "expense"
                      ? "bg-red-500/20 text-red-200"
                      : "bg-green-500/20 text-green-200",
                  )}
                >
                  {cat.type}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openCategoryDialog(cat)}
                    disabled={isCategoryPending}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white active:bg-white/15"
                    aria-label="Edit category"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => requestDeleteCategory(cat)}
                    disabled={isCategoryPending}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-destructive/20 hover:text-destructive active:bg-white/15"
                    aria-label="Delete category"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {categoryDeleteError && !categoryToDelete && (
          <InlineError>{categoryDeleteError}</InlineError>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={isCategoryPending}
          className="h-11 rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/20 active:bg-white/15"
          onClick={() => openCategoryDialog()}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add category
        </Button>
      </div>

      <div className="page-enter-4 flex flex-col gap-2">
        <div className="pt-4">
          <button
            type="button"
            className={signOutButtonClass}
            disabled={isSigningOut}
            onClick={() => {
              setSignOutError(null);
              startSignOutTransition(async () => {
                const supabase = createClient();
                const { error: signOutErr } = await supabase.auth.signOut();
                if (signOutErr) {
                  setSignOutError(signOutErr.message);
                  return;
                }
                if (activeAccountId) {
                  mutate(transactionsSwrKey(activeAccountId));
                  mutate(
                    calendarMonthSwrKey(currentMonth, currentYear, activeAccountId),
                  );
                }
                router.push("/login");
              });
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
          {signOutError && (
            <InlineError className="justify-center">{signOutError}</InlineError>
          )}
        </div>
        <div>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 py-3 text-sm font-medium text-red-300 transition-colors hover:bg-destructive/20 active:bg-destructive/15"
            onClick={() => setDeleteAccountOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            Delete account
          </button>
        </div>

        <Dialog
          open={recalibrateOpen}
          onOpenChange={(open) => !open && closeRecalibrateModal()}
        >
          <DialogContent className="border-white/20 bg-card text-card-foreground">
            <DialogHeader>
              <DialogTitle>Recalibrate balance</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              {savedDelta !== null ? (
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <CheckCircle2 className="h-10 w-10 text-[#4ade80]" />
                  {savedDelta === 0 ? (
                    <>
                      <p className="text-sm font-medium text-foreground">
                        Already up to date
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Your balance matches Budget Buddy&apos;s projection — no adjustment was needed.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-foreground">
                        Adjustment saved
                      </p>
                      <p className="tabular-nums text-xs text-muted-foreground">
                        {savedDelta > 0 ? "+" : ""}
                        {formatCurrency(savedDelta)} applied to today
                      </p>
                    </>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-1 h-10 w-full rounded-xl border-border bg-muted text-foreground hover:bg-muted/80"
                    onClick={closeRecalibrateModal}
                  >
                    Done
                  </Button>
                </div>
              ) : calLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading your current balance…
                </p>
              ) : projectedTodayBalance === null ? (
                <p className="text-sm text-destructive">
                  Unable to load your current balance. Please close and try again.
                </p>
              ) : (
                <>
                  <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                    <p className="text-xs text-muted-foreground">
                      Budget Buddy projects your balance today as
                    </p>
                    <p className="mt-1 tabular-nums text-lg font-semibold text-foreground">
                      {formatCurrency(projectedTodayBalance)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label
                      htmlFor="actualBalance"
                      className="text-sm font-medium text-muted-foreground"
                    >
                      Your actual balance
                    </Label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                        $
                      </span>
                      <Input
                        id="actualBalance"
                        type="text"
                        inputMode="decimal"
                        value={actualBalanceInput}
                        onChange={(e) => {
                          if (/^-?\d*\.?\d{0,2}$/.test(e.target.value)) {
                            setActualBalanceInput(e.target.value);
                          }
                        }}
                        className="h-11 rounded-xl border-border bg-background pl-8 tabular-nums text-foreground placeholder:text-muted-foreground"
                        placeholder="0.00"
                        autoFocus
                      />
                    </div>
                  </div>
                  {recalibrateError && (
                    <InlineError light>{recalibrateError}</InlineError>
                  )}
                  <Button
                    type="button"
                    disabled={isRecalibrating || !actualBalanceInput}
                    onClick={handleRecalibrate}
                    className={dialogSubmitButtonClass}
                  >
                    Save adjustment
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <CreateBudgetDialog
          open={createBudgetOpen}
          name={newBudgetName}
          balance={newBudgetBalance}
          error={createBudgetError}
          isPending={isCreatingBudget}
          onNameChange={setNewBudgetName}
          onBalanceChange={setNewBudgetBalance}
          onSubmit={handleCreateBudget}
          onClose={closeCreateBudgetDialog}
          submitClassName={dialogSubmitButtonClass}
        />

        <Dialog
          open={categoryDialogOpen}
          onOpenChange={(open) => !open && closeCategoryDialog()}
        >
          <DialogContent className="border-white/20 bg-card text-card-foreground">
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? "Edit category" : "Add category"}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={handleCategorySubmit}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="categoryName"
                  className="text-sm font-medium text-muted-foreground"
                >
                  Name
                </Label>
                <Input
                  id="categoryName"
                  value={categoryForm.name}
                  onChange={(e) =>
                    setCategoryForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="h-11 rounded-xl border-border bg-background text-foreground placeholder:text-muted-foreground"
                  placeholder="e.g. Groceries"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium text-muted-foreground">
                  Type
                </Label>
                <GlassExpenseIncomeToggle
                  variant="settings"
                  value={categoryForm.type}
                  onChange={(type) => setCategoryForm((f) => ({ ...f, type }))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium text-muted-foreground">
                  Icon
                </Label>
                <div className="grid max-h-40 grid-cols-6 gap-2 overflow-y-auto rounded-xl border border-border bg-muted/30 p-2">
                  {ALLOWED_CATEGORY_ICON_NAMES.map((iconName) => (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() =>
                        setCategoryForm((f) => ({ ...f, icon: iconName }))
                      }
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                        categoryForm.icon === iconName
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-muted",
                      )}
                      aria-label={iconName}
                    >
                      <CategoryIcon iconName={iconName} className="h-5 w-5" />
                    </button>
                  ))}
                </div>
              </div>
              {categoryFormError && (
                <InlineError light>{categoryFormError}</InlineError>
              )}
              <Button type="submit" disabled={isCategoryPending} className={dialogSubmitButtonClass}>
                {editingCategory ? "Save changes" : "Add category"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={!!categoryToDelete}
          onOpenChange={(open) => {
            if (!open) {
              setCategoryToDelete(null);
              setDeleteUsageCount(null);
              setCategoryDeleteError(null);
            }
          }}
        >
          <AlertDialogContent className="border-white/20 bg-card text-card-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete category?</AlertDialogTitle>
              <AlertDialogDescription>
                {categoryToDelete && deleteUsageCount && (
                  <>
                    This category is used by {deleteUsageCount.transactions}{" "}
                    transaction
                    {deleteUsageCount.transactions !== 1 ? "s" : ""} and{" "}
                    {deleteUsageCount.rules} recurring rule
                    {deleteUsageCount.rules !== 1 ? "s" : ""}. They will become
                    uncategorized. Delete anyway?
                  </>
                )}
                {categoryToDelete && !deleteUsageCount && (
                  <>Delete this category?</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {categoryDeleteError && (
              <InlineError light>{categoryDeleteError}</InlineError>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl border border-border bg-muted text-foreground hover:bg-muted/80">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  confirmDeleteCategory();
                }}
                disabled={isCategoryPending}
                className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={!!budgetToDelete}
          onOpenChange={(open) => {
            if (!open) {
              setBudgetToDelete(null);
              setDeleteBudgetError(null);
            }
          }}
        >
          <AlertDialogContent className="border-white/20 bg-card text-card-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &ldquo;{budgetToDelete?.name}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this budget and all its transactions
                and recurring rules. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteBudgetError && (
              <InlineError light>{deleteBudgetError}</InlineError>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl border border-border bg-muted text-foreground hover:bg-muted/80">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (!budgetToDelete) return;
                  const { id } = budgetToDelete;
                  setDeleteBudgetError(null);
                  startDeleteBudgetTransition(async () => {
                    const { error } = await deleteBudget(id);
                    if (error) {
                      setDeleteBudgetError(USER_FACING_ERROR);
                      return;
                    }
                    if (activeAccountId === id) {
                      const next = accounts.find((a) => a.id !== id);
                      if (next) setActiveAccount(next.id);
                    }
                    setBudgetToDelete(null);
                    void mutate(accountsSwrKey);
                  });
                }}
                disabled={isDeletingBudget}
                className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80"
              >
                Delete budget
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={deleteAccountOpen}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteAccountOpen(false);
              setDeleteAccountError(null);
            }
          }}
        >
          <AlertDialogContent className="border-white/20 bg-card text-card-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete account?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your account and all your data,
                including every budget. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteAccountError && (
              <InlineError light>{deleteAccountError}</InlineError>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl border border-border bg-muted text-foreground hover:bg-muted/80">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  startDeleteAccountTransition(async () => {
                    try {
                      const res = await fetch("/api/delete-account", {
                        method: "POST",
                      });
                      if (!res.ok) {
                        setDeleteAccountError(USER_FACING_ERROR);
                        return;
                      }
                      const supabase = createClient();
                      await supabase.auth.signOut();
                      if (activeAccountId) {
                        mutate(transactionsSwrKey(activeAccountId));
                        mutate(
                          calendarMonthSwrKey(
                            currentMonth,
                            currentYear,
                            activeAccountId,
                          ),
                        );
                      }
                      router.push("/login");
                    } catch {
                      setDeleteAccountError(USER_FACING_ERROR);
                    }
                  });
                }}
                disabled={isDeletingAccount}
                className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80"
              >
                Delete my account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </form>
  );
}

function CreateBudgetDialog({
  open,
  name,
  balance,
  error,
  isPending,
  onNameChange,
  onBalanceChange,
  onSubmit,
  onClose,
  submitClassName,
}: {
  open: boolean;
  name: string;
  balance: string;
  error: string | null;
  isPending: boolean;
  onNameChange: (v: string) => void;
  onBalanceChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  submitClassName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-white/20 bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle>New budget</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="newBudgetName"
              className="text-sm font-medium text-muted-foreground"
            >
              Name
            </Label>
            <Input
              id="newBudgetName"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="h-11 rounded-xl border-border bg-background text-foreground placeholder:text-muted-foreground"
              placeholder="e.g. Savings"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="newBudgetBalance"
              className="text-sm font-medium text-muted-foreground"
            >
              Starting balance
            </Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                $
              </span>
              <Input
                id="newBudgetBalance"
                type="text"
                inputMode="decimal"
                value={balance}
                onChange={(e) => {
                  if (/^\d*\.?\d{0,2}$/.test(e.target.value)) {
                    onBalanceChange(e.target.value);
                  }
                }}
                className="h-11 rounded-xl border-border bg-background pl-8 tabular-nums text-foreground placeholder:text-muted-foreground"
                placeholder="0.00"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leave blank to start at $0.00.
            </p>
          </div>
          {error && <InlineError light>{error}</InlineError>}
          <Button
            type="submit"
            disabled={isPending}
            className={submitClassName}
          >
            {isPending ? "Creating…" : "Create budget"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
