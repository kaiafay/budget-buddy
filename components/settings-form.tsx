"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  User,
  DollarSign,
  LogOut,
  Tags,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import useSWR from "swr";
import { GlassExpenseIncomeToggle } from "@/components/glass-expense-income-toggle";
import { InlineError } from "@/components/inline-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
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
import { fetchCategories, fetchCategoryUsageCount } from "@/lib/api";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/transactions-mutations";
import { USER_FACING_ERROR } from "@/lib/errors";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  initialName: string;
  initialBalance: string;
  accountId: string | null;
}

export default function SettingsForm({
  initialName,
  initialBalance,
  accountId: initialAccountId,
}: Props) {
  const [accountName, setAccountName] = useState(initialName);
  const [startingBalance, setStartingBalance] = useState(initialBalance);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(initialAccountId);
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data: categories = [] } = useSWR("categories", fetchCategories);

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

  const saveSeqRef = useRef(0);
  const skipNextDebounceRef = useRef(true);

  const saveAccountSettings = useCallback(async () => {
    setBalanceError(null);
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

    const balance = parseFloat(startingBalance);
    if (Number.isNaN(balance)) {
      if (seq !== saveSeqRef.current) return;
      setBalanceError("Please enter a valid starting balance.");
      return;
    }

    if (accountId) {
      const { error: updateError } = await supabase
        .from("accounts")
        .update({ name: accountName, starting_balance: balance })
        .eq("id", accountId)
        .eq("user_id", user.id);
      if (updateError) {
        if (seq !== saveSeqRef.current) return;
        setAccountError(updateError.message);
        return;
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("accounts")
        .insert({
          user_id: user.id,
          name: accountName,
          starting_balance: balance,
        })
        .select("id")
        .single();
      if (insertError) {
        if (seq !== saveSeqRef.current) return;
        setAccountError(insertError.message);
        return;
      }
      if (inserted?.id) setAccountId(inserted.id);
    }

    if (seq !== saveSeqRef.current) return;

    const now = new Date();
    mutate(calendarMonthSwrKey(now.getMonth() + 1, now.getFullYear()));
    mutate("transactions");
  }, [accountName, startingBalance, accountId, mutate]);

  const saveAccountSettingsRef = useRef(saveAccountSettings);
  saveAccountSettingsRef.current = saveAccountSettings;

  useEffect(() => {
    if (skipNextDebounceRef.current) {
      skipNextDebounceRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void saveAccountSettingsRef.current();
    }, 1000);
    return () => clearTimeout(timer);
  }, [accountName, startingBalance]);

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

  async function handleCategorySubmit(e: React.FormEvent) {
    e.preventDefault();
    setCategoryFormError(null);
    const name = categoryForm.name.trim();
    if (!name) {
      setCategoryFormError("Enter a name");
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
  }

  async function requestDeleteCategory(cat: Category) {
    setCategoryDeleteError(null);
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
  }

  async function confirmDeleteCategory() {
    try {
      const id = categoryToDelete?.id;
      if (!id) return;
      setCategoryDeleteError(null);
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
        <div className="flex flex-col gap-2">
          {/* TODO: replace in v.1.1 */}
          <p className="text-xs text-white/50">
            Balance before tracking in Budget Buddy. Set this to your account
            balance when you started.
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
              type="number"
              step="0.01"
              value={startingBalance}
              onChange={(e) => setStartingBalance(e.target.value)}
              className="h-11 rounded-xl border-white/20 bg-white/10 pl-8 tabular-nums text-white placeholder:text-white/40"
            />
          </div>
          {balanceError && <InlineError>{balanceError}</InlineError>}
        </div>
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
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white active:bg-white/15"
                    aria-label="Edit category"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => requestDeleteCategory(cat)}
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
            onClick={async () => {
              setSignOutError(null);
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
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
          {signOutError && (
            <InlineError className="text-center">{signOutError}</InlineError>
          )}
        </div>
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
                <InlineError>{categoryFormError}</InlineError>
              )}
              <Button type="submit" className={dialogSubmitButtonClass}>
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
              <InlineError>{categoryDeleteError}</InlineError>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl border border-border bg-muted text-foreground hover:bg-muted/80">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void confirmDeleteCategory();
                }}
                className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </form>
  );
}
