import type {
  Account,
  Category,
  RecurringException,
  RecurringRule,
  Transaction,
} from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { USER_FACING_ERROR } from "@/lib/errors";
import { uuidSchema } from "@/lib/validation";

export async function fetchAccounts(): Promise<Account[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, starting_balance")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    starting_balance: Number(row.starting_balance),
  }));
}

export async function fetchCalendarData(
  month: number,
  year: number,
  accountId: string,
): Promise<{
  account: Account | null;
  txBefore: { amount: number }[];
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  exceptions: RecurringException[];
  firstDayOfMonth: string;
  lastDayOfMonth: string;
}> {
  const parsedAccountId = uuidSchema.parse(accountId);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const month1Based = month;
  const firstDayOfMonth = `${year}-${String(month1Based).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month1Based, 0).getDate();
  const lastDayOfMonth = `${year}-${String(month1Based).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [accountRes, txBeforeRes, txRes, rulesRes, exceptionsRes] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, starting_balance")
        .eq("id", parsedAccountId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", user.id)
        .eq("account_id", parsedAccountId)
        .lt("date", firstDayOfMonth),
      supabase
        .from("transactions")
        .select("id, label, amount, date, category_id, account_id")
        .eq("user_id", user.id)
        .eq("account_id", parsedAccountId)
        .gte("date", firstDayOfMonth)
        .lte("date", lastDayOfMonth)
        .order("date", { ascending: true }),
      supabase
        .from("recurring_rules")
        .select(
          "id, start_date, end_date, root_rule_id, amount, label, frequency, category_id, account_id",
        )
        .eq("user_id", user.id)
        .eq("account_id", parsedAccountId),
      supabase
        .from("recurring_exceptions")
        .select(
          "id, rule_id, exception_date, type, modified_amount, modified_label, category_id",
        )
        .eq("user_id", user.id),
    ]);

  if (accountRes.error) throw new Error(accountRes.error.message);
  if (txBeforeRes.error) throw new Error(txBeforeRes.error.message);
  if (txRes.error) throw new Error(txRes.error.message);
  if (rulesRes.error) throw new Error(rulesRes.error.message);
  if (exceptionsRes.error) throw new Error(exceptionsRes.error.message);

  const accountRow = accountRes.data
    ? {
        id: accountRes.data.id,
        name: accountRes.data.name,
        starting_balance: Number(accountRes.data.starting_balance),
      }
    : null;

  // recurring_exceptions are joined to recurring_rules via rule_id and the rules
  // are already account-scoped above; exceptions are filtered to the user.
  // Filter exceptions to only those whose rule was returned in this account scope
  // so unrelated accounts' rule exceptions never reach the projection inputs.
  const ruleIdSet = new Set((rulesRes.data ?? []).map((r) => r.id));
  const filteredExceptions = (exceptionsRes.data ?? []).filter((e) =>
    ruleIdSet.has(e.rule_id),
  );

  return {
    account: accountRow,
    txBefore: (txBeforeRes.data ?? []) as { amount: number }[],
    transactions: (txRes.data ?? []) as Transaction[],
    recurringRules: (rulesRes.data ?? []) as RecurringRule[],
    exceptions: filteredExceptions as RecurringException[],
    firstDayOfMonth,
    lastDayOfMonth,
  };
}

export async function fetchTransactions(accountId: string): Promise<{
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  exceptions: RecurringException[];
}> {
  const parsedAccountId = uuidSchema.parse(accountId);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const [txRes, rulesRes, exceptionsRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, label, amount, date, category_id, account_id")
      .eq("user_id", user.id)
      .eq("account_id", parsedAccountId)
      .order("date", { ascending: false }),
    supabase
      .from("recurring_rules")
      .select(
        "id, start_date, end_date, root_rule_id, amount, label, frequency, category_id, account_id",
      )
      .eq("user_id", user.id)
      .eq("account_id", parsedAccountId),
    supabase
      .from("recurring_exceptions")
      .select(
        "id, rule_id, exception_date, type, modified_amount, modified_label, category_id",
      )
      .eq("user_id", user.id),
  ]);

  if (txRes.error) throw new Error(txRes.error.message);
  if (rulesRes.error) throw new Error(rulesRes.error.message);
  if (exceptionsRes.error) throw new Error(exceptionsRes.error.message);

  const ruleIdSet = new Set((rulesRes.data ?? []).map((r) => r.id));
  const filteredExceptions = (exceptionsRes.data ?? []).filter((e) =>
    ruleIdSet.has(e.rule_id),
  );

  return {
    transactions: (txRes.data ?? []) as Transaction[],
    recurringRules: (rulesRes.data ?? []) as RecurringRule[],
    exceptions: filteredExceptions as RecurringException[],
  };
}

const DEFAULT_CATEGORIES: {
  name: string;
  icon: string;
  type: "expense" | "income";
}[] = [
  { name: "Groceries", icon: "ShoppingCart", type: "expense" },
  { name: "Food & Dining", icon: "UtensilsCrossed", type: "expense" },
  { name: "Transport", icon: "Car", type: "expense" },
  { name: "Bills", icon: "FileText", type: "expense" },
  { name: "Entertainment", icon: "Ticket", type: "expense" },
  { name: "Salary", icon: "Briefcase", type: "income" },
  { name: "Freelance", icon: "Laptop", type: "income" },
  { name: "Gifts", icon: "Gift", type: "expense" },
];

export async function fetchCategories(): Promise<Category[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, icon, type")
    .eq("user_id", user.id)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  const categories = (data ?? []) as Category[];
  if (categories.length === 0) {
    const rows = DEFAULT_CATEGORIES.map((c) => ({
      user_id: user.id,
      name: c.name,
      icon: c.icon,
      type: c.type,
    }));
    await supabase
      .from("categories")
      .upsert(rows, { onConflict: "user_id,name", ignoreDuplicates: true });
    const { data: reselect, error: reselectError } = await supabase
      .from("categories")
      .select("id, name, icon, type")
      .eq("user_id", user.id)
      .order("name", { ascending: true });
    if (reselectError) throw new Error(reselectError.message);
    return (reselect ?? []) as Category[];
  }
  return categories;
}

export async function fetchTransaction(
  id: string,
): Promise<{
  id: string;
  label: string;
  amount: number;
  date: string;
  category_id: string | null;
  account_id: string;
} | null> {
  let parsedId: string;
  try {
    parsedId = uuidSchema.parse(id);
  } catch {
    throw new Error("Invalid ID");
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("transactions")
    .select("id, label, amount, date, category_id, account_id")
    .eq("id", parsedId)
    .eq("user_id", user.id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }
  return data as {
    id: string;
    label: string;
    amount: number;
    date: string;
    category_id: string | null;
    account_id: string;
  };
}

export async function fetchRecurringRule(
  id: string,
): Promise<RecurringRule | null> {
  let parsedId: string;
  try {
    parsedId = uuidSchema.parse(id);
  } catch {
    throw new Error("Invalid ID");
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("recurring_rules")
    .select(
      "id, label, amount, frequency, start_date, end_date, category_id, root_rule_id, account_id",
    )
    .eq("id", parsedId)
    .eq("user_id", user.id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }
  return {
    id: data.id,
    label: data.label,
    amount: Number(data.amount),
    frequency: data.frequency as "weekly" | "biweekly" | "monthly" | "yearly",
    start_date: data.start_date,
    end_date: data.end_date ?? null,
    category_id: data.category_id ?? null,
    root_rule_id: data.root_rule_id ?? null,
    account_id: data.account_id ?? null,
  } as RecurringRule;
}

function normalizeRuleDateKey(value: string): string {
  return String(value).slice(0, 10);
}

export async function fetchNextChainSegment(
  ruleId: string,
  occurrenceDate: string,
): Promise<string | null> {
  let parsedRuleId: string;
  try {
    parsedRuleId = uuidSchema.parse(ruleId);
  } catch {
    throw new Error("Invalid ID");
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const occ = normalizeRuleDateKey(occurrenceDate);

  const { data: rule, error: ruleError } = await supabase
    .from("recurring_rules")
    .select("root_rule_id")
    .eq("id", parsedRuleId)
    .eq("user_id", user.id)
    .single();
  if (ruleError || !rule) return null;

  const rootId = rule.root_rule_id ?? parsedRuleId;
  const safeId = uuidSchema.parse(rootId);

  const { data: next, error: nextError } = await supabase
    .from("recurring_rules")
    .select("start_date")
    .eq("user_id", user.id)
    .or(`id.eq.${safeId},root_rule_id.eq.${safeId}`)
    .gt("start_date", occ)
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (nextError) return null;

  return next?.start_date
    ? normalizeRuleDateKey(String(next.start_date))
    : null;
}

export async function fetchCategoryUsageCount(
  categoryId: string,
): Promise<{ transactions: number; rules: number }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const [txRes, rulesRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("category_id", categoryId),
    supabase
      .from("recurring_rules")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("category_id", categoryId),
  ]);
  if (txRes.error || rulesRes.error) {
    throw new Error(USER_FACING_ERROR);
  }
  return {
    transactions: txRes.count ?? 0,
    rules: rulesRes.count ?? 0,
  };
}
