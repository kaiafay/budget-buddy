export type Category = {
  id: string;
  name: string;
  icon: string;
  type: "expense" | "income";
  account_id?: string;
};

export type Transaction = {
  id: string;
  label: string;
  amount: number;
  date: string;
  recurring?: boolean;
  category_id?: string | null;
  account_id?: string | null;
};

export type RecurringRule = {
  id: string;
  label: string;
  amount: number;
  frequency: "weekly" | "biweekly" | "monthly" | "yearly";
  start_date: string;
  end_date?: string | null;
  category_id?: string | null;
  root_rule_id?: string | null;
  account_id?: string | null;
};

export type RecurringException = {
  id: string;
  rule_id: string;
  exception_date: string;
  type: "skip" | "modified";
  modified_amount?: number | null;
  modified_label?: string | null;
  category_id?: string | null;
};

export type Account = {
  id: string;
  name: string;
  starting_balance: number;
};

export type GroupedTransactions = {
  date: string;
  formatted: string;
  transactions: Transaction[];
};

export type PendingRecurringEdit = {
  ruleId: string;
  label: string;
  amount: number;
  frequency: "weekly" | "biweekly" | "monthly" | "yearly";
  category_id: string | null;
  occurrenceDate: string;
  newStartDate: string;
  endDate?: string | null;
  recurrenceCount?: number | null;
};
