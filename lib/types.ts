export type Transaction = {
  id: string;
  label: string;
  amount: number;
  date: string;
  recurring?: boolean;
};

export type RecurringRule = {
  id: string;
  label: string;
  amount: number;
  frequency: "weekly" | "biweekly" | "monthly" | "yearly";
  start_date: string;
  end_date?: string | null;
};

export type RecurringException = {
  id: string;
  rule_id: string;
  exception_date: string;
  type: "skip" | "modified";
  modified_amount?: number | null;
  modified_label?: string | null;
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
