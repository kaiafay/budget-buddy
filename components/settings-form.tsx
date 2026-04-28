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
import { calendarMonthSwrKey } from "@/lib/swr-keys";
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
  createCategory,
  updateCategory,
  deleteCategory,
  recalibrateBalance,
} from "@/lib/transactions-mutations";
import { getProjectedBalances, sumRecurringBeforeDate } from "@/lib/projection";
import { USER_FACING_ERROR } from "@/lib/errors";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  initialName: string;
  initialBalance: string;
  accountId: string | null;
}

function formatCurrency(value: number): string {
  const abs = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-$${abs}` : `$${abs}`;
}

export default function SettingsForm({
  initialName,
  initialBalance,
  accountId: initialAccountId,
}: Props) {
  const todayDate = new Date();
  const currentMonth = todayDate.getMonth() + 1; // 1-based for fetchCalendarData
  const currentYear = todayDate.getFullYear();
  const todayStr = format(todayDate, "yyyy-MM-dd");

  const [accountName, setAccountName] = useState(initialName);
  const [startingBalance, setStartingBalance] = useState(initialBalance);
  const [hasSetBalance, setHasSetBalance] = useState(initialBalance !== "");
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(initialAccountId);

  const [recalibrateOpen, setRecalibrateOpen] = useState(false);
  const [actualBalanceInput, setActualBalanceInput] = useState("");
  const [recalibrateError, setRecalibrateError] = useState<string | null>(null);
  const [savedDelta, setSavedDelta] = useState<number | null>(null);
  const [isRecalibrating, startRecalibrateTransition] = useTransition();
  const [isSavingBalance, startSaveBalanceTransition] = useTransition();

  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data: categories = [] } = useSWR("categories", fetchCategories);

  // Only fetch calendar data while the recalibrate modal is open — reuses cached data
  // if the user already visited the calendar this session.
  const { data: calData, isLoading: calLoading } = useSWR(
    recalibrateOpen ? calendarMonthSwrKey(currentMonth, currentYear) : null,
    () => fetchCalendarData(currentMonth, currentYear),
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
      todayDate.getMonth(), // 0-indexed
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
  const [categoryFormError, setCategoryFormError] = useState<string | null>(
    null,
  );
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(
    null,
  );
  const [deleteUsageCount, setDeleteUsageCount] = useState<{
    transactions: number;
    rules: number;
  } | null>(null);
  const [categoryDeleteError, setCategoryDeleteError] = useState<string | null>(
    null,
  );
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isCategoryPending, startCategoryTransition] = useTransition();
  const [isSigningOut, startSignOutTransition] = useTransition();
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(
    null,
  );
  const [isDeletingAccount, startDeleteAccountTransition] = useTransition();

  const saveSeqRef = useRef(0);
  const skipNextDebounceRef = useRef(true);

  // Autosaves account name only — balance is never written via autosave.
  // Short-circuits when no account exists yet (account is created on initial balance save).
  const saveAccountName = useCallback(async () => {
    if (!accountId) return;
    setAccountError(null);

    const seq = ++saveSeqRef.current;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      if (seq !== saveSeqRef.current) return;
      setAccountError("You must be signed in.");
      return;
    }

    const { error: updateError } = await supabase
      .from("accounts")
      .update({ name: accountName })
      .eq("id", accountId)
      .eq("user_id", user.id);

    if (updateError) {
      if (seq !== saveSeqRef.current) return;
      setAccountError(updateError.message);
    }
  }, [accountName, accountId]);

  const saveAccountNameRef = useRef(saveAccountName);
  saveAccountNameRef.current = saveAccountName;

  useEffect(() => {
    if (skipNextDebounceRef.current) {
      skipNextDebounceRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void saveAccountNameRef.current();
    }, 1000);
    return () => clearTimeout(timer);
  }, [accountName]);

  // Called once when a new user explicitly sets their starting balance for the first time.
  // Creates the account record if it doesn't exist yet, then flips to read-only mode.
  function handleSaveInitialBalance() {
    setBalanceError(null);
    const balance = parseFloat(startingBalance);
    if (Number.isNaN(balance)) {
      setBalanceError("Please enter a valid starting balance.");
      return;
    }
    startSaveBalanceTransition(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setBalanceError("You must be signed in.");
        return;
      }
      if (accountId) {
        const { error } = await supabase
          .from("accounts")
          .update({ starting_balance: balance })
          .eq("id", accountId)
          .eq("user_id", user.id);
        if (error) {
          setBalanceError(error.message);
          return;
        }
      } else {
        const { data: inserted, error } = await supabase
          .from("accounts")
          .insert({ user_id: user.id, name: accountName, starting_balance: balance })
          .select("id")
          .single();
        if (error) {
          setBalanceError(error.message);
          return;
        }
        if (inserted?.id) setAccountId(inserted.id);
      }
      setHasSetBalance(true);
      mutate(calendarMonthSwrKey(new Date().getMonth() + 1, new Date().getFullYear()));
      mutate("transactions");
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
    if (projectedTodayBalance === null || !accountId) return;
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
        accountId,
        delta,
        date: todayStr,
      });
      if (error) {
        setRecalibrateError(error.message);
        return;
      }
      mutate("transactions");
      mutate(calendarMonthSwrKey(currentMonth, currentYear));
      setSavedDelta(delta);
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
      if (editingCategory) {
        const { error: err } = await updateCategory(editingCategory.id, {
          name,
          icon: categoryForm.icon,
          type: categoryForm.type,
        });
        if (err) {
          if (
            err.message.includes("categories_user_id_name_key") ||
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
          name,
          icon: categoryForm.icon,
          type: categoryForm.type,
        });
        if (err) {
          if (
            err.message.includes("categories_user_id_name_key") ||
            err.message.includes("duplicate key")
          ) {
            setCategoryFormError("A category with this name already exists.");
          } else {
            setCategoryFormError(USER_FACING_ERROR);
          }
          return;
        }
      }
      mutate("categories");
      closeCategoryDialog();
    });
  }

  function requestDeleteCategory(cat: Category) {
    setCategoryDeleteError(null);
    startCategoryTransition(async () => {
      try {
        const count = await fetchCategoryUsageCount(cat.id);
        if (count.transactions === 0 && count.rules === 0) {
          const { error: err } = await deleteCategory(cat.id);
          if (err) {
            setCategoryDeleteError(USER_FACING_ERROR);
            return;
          }
          mutate("categories");
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
    if (!id) return;
    setCategoryDeleteError(null);
    startCategoryTransition(async () => {
      try {
        const { error: err } = await deleteCategory(id);
        if (err) {
          setCategoryDeleteError(USER_FACING_ERROR);
          return;
        }
        mutate("categories");
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

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="flex flex-col gap-5 px-5 pb-8"
    >
      <div className="page-enter-2 glass-card flex flex-col gap-4 rounded-2xl p-4">
        <div className="flex items-center gap-3 pb-1">
          <div className={glassSectionIconClass}>
            <User className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-medium text-white">
            Account Details
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="accountName"
            className="text-xs font-medium text-white/70"
          >
            Account Name
          </Label>
          <Input
            id="accountName"
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            className={glassInputClass}
            placeholder="e.g. Main Checking"
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
              Your opening balance when you started tracking. Use Recalibrate to sync Budget Buddy with your actual bank balance.
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
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Recalibrate balance
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-white/50">
              Enter your account balance at the time you started tracking in Budget Buddy.
            </p>
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
              />
            </div>
            {balanceError && <InlineError>{balanceError}</InlineError>}
            <Button
              type="button"
              disabled={isSavingBalance || !startingBalance}
              onClick={handleSaveInitialBalance}
              className={dialogSubmitButtonClass}
            >
              Save starting balance
            </Button>
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
                mutate("transactions");
                mutate(
                  calendarMonthSwrKey(
                    new Date().getMonth() + 1,
                    new Date().getFullYear(),
                  ),
                );
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

        {/* Recalibrate balance modal */}
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
                This will permanently delete your account and all your data.
                This cannot be undone.
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
                      mutate("transactions");
                      mutate(
                        calendarMonthSwrKey(
                          new Date().getMonth() + 1,
                          new Date().getFullYear(),
                        ),
                      );
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
