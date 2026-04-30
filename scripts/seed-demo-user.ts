/**
 * Seeds a demo Supabase user and data for calendar demos.
 * Run: npx tsx scripts/seed-demo-user.ts
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_USER_PASSWORD
 */
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  addDays,
  addMonths,
  differenceInDays,
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
  subDays,
  getDay,
} from "date-fns";

loadEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const DEMO_EMAIL = "demo@budgetbuddy.app";

type CatSeed = { name: string; icon: string; type: "expense" | "income" };

const CATEGORY_SEEDS: CatSeed[] = [
  { name: "Food & Dining", icon: "UtensilsCrossed", type: "expense" },
  { name: "Transport", icon: "Car", type: "expense" },
  { name: "Entertainment", icon: "Film", type: "expense" },
  { name: "Bills", icon: "Receipt", type: "expense" },
  { name: "Freelance", icon: "Briefcase", type: "income" },
  { name: "Salary", icon: "Banknote", type: "income" },
];

async function findUserIdByEmail(
  supabase: any,
  email: string,
): Promise<string | null> {
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    const u = data.users.find(
      (x: any) => x.email?.toLowerCase() === email.toLowerCase(),
    );
    if (u) return u.id;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

/** Returns the most recent Monday on or before the given date */
function mostRecentMonday(date: Date): Date {
  const day = getDay(date); // 0 = Sunday, 1 = Monday, ...
  const daysBack = day === 0 ? 6 : day - 1;
  return subDays(date, daysBack);
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.DEMO_USER_PASSWORD;

  if (!url?.trim()) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local");
    process.exit(1);
  }
  if (!serviceKey?.trim()) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  if (!password?.trim()) {
    console.error("Missing DEMO_USER_PASSWORD in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId = await findUserIdByEmail(supabase, DEMO_EMAIL);
  let createdUser = false;

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { given_name: "Jane", family_name: "Doe" },
    });
    if (error) throw error;
    userId = data.user!.id;
    createdUser = true;
    console.log("Created auth user:", DEMO_EMAIL);
  } else {
    // Update metadata even if user already exists so initials show correctly
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { given_name: "Jane", family_name: "Doe" },
    });
    console.log("User already exists, re-seeding data:", DEMO_EMAIL);
  }

  // Clear previous demo data (idempotent re-seed)
  for (const table of [
    "recurring_exceptions",
    "recurring_rules",
    "transactions",
    "categories",
    "accounts",
  ]) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }

  // Insert account with low starting balance so recurring salary brings it
  // to a realistic few-thousand range
  const { data: accountRow, error: accErr } = await supabase
    .from("accounts")
    .insert({
      user_id: userId,
      name: "Checking",
      starting_balance: 500,
    })
    .select("id")
    .single();
  if (accErr) throw accErr;
  const accountId = accountRow.id as string;

  const categoryRows = CATEGORY_SEEDS.map((c) => ({
    user_id: userId,
    account_id: accountId,
    name: c.name,
    icon: c.icon,
    type: c.type,
  }));

  const { data: insertedCats, error: catErr } = await supabase
    .from("categories")
    .insert(categoryRows)
    .select("id,name");
  if (catErr) throw catErr;

  const catByName = Object.fromEntries(
    (insertedCats as { id: string; name: string }[]).map((r) => [r.name, r.id]),
  );

  const foodId = catByName["Food & Dining"]!;
  const transportId = catByName["Transport"]!;
  const entertainmentId = catByName["Entertainment"]!;
  const billsId = catByName["Bills"]!;
  const freelanceCatId = catByName["Freelance"]!;
  const salaryCatId = catByName["Salary"]!;

  const today = new Date();

  // Anchors start from current month so recurring rules don't accumulate
  // years of history and inflate the balance
  const monthlyAnchor = format(startOfMonth(today), "yyyy-MM-dd");
  const weeklyAnchor = format(mostRecentMonday(today), "yyyy-MM-dd");
  const biweeklyAnchor = format(startOfMonth(today), "yyyy-MM-dd");

  const recurringInserts = [
    {
      user_id: userId,
      account_id: accountId,
      label: "Salary",
      amount: 3200,
      frequency: "monthly" as const,
      start_date: monthlyAnchor,
      end_date: null,
      root_rule_id: null,
      category_id: salaryCatId,
    },
    {
      user_id: userId,
      account_id: accountId,
      label: "Rent",
      amount: -1200,
      frequency: "monthly" as const,
      start_date: monthlyAnchor,
      end_date: null,
      root_rule_id: null,
      category_id: billsId,
    },
    {
      user_id: userId,
      account_id: accountId,
      label: "Groceries",
      amount: -80,
      frequency: "weekly" as const,
      start_date: weeklyAnchor,
      end_date: null,
      root_rule_id: null,
      category_id: foodId,
    },
    {
      user_id: userId,
      account_id: accountId,
      label: "Freelance",
      amount: 800,
      frequency: "biweekly" as const,
      start_date: biweeklyAnchor,
      end_date: null,
      root_rule_id: null,
      category_id: freelanceCatId,
    },
  ];

  const { error: rrErr } = await supabase
    .from("recurring_rules")
    .insert(recurringInserts);
  if (rrErr) throw rrErr;

  const rangeStart = startOfMonth(subMonths(today, 2));
  const rangeEnd = endOfMonth(addMonths(today, 2));
  const rangeDays = differenceInDays(rangeEnd, rangeStart) + 1;

  const oneTimeSpecs: {
    offset: number;
    label: string;
    amount: number;
    category_id: string;
  }[] = [
    { offset: 0.04, label: "Starbucks", amount: -12.5, category_id: foodId },
    { offset: 0.09, label: "Uber", amount: -18.75, category_id: transportId },
    {
      offset: 0.14,
      label: "Netflix",
      amount: -15.99,
      category_id: entertainmentId,
    },
    { offset: 0.19, label: "Dinner out", amount: -68.0, category_id: foodId },
    {
      offset: 0.24,
      label: "Gym membership",
      amount: -45.0,
      category_id: entertainmentId,
    },
    {
      offset: 0.29,
      label: "Gas station",
      amount: -42.3,
      category_id: transportId,
    },
    { offset: 0.34, label: "Pharmacy", amount: -23.4, category_id: billsId },
    { offset: 0.39, label: "Amazon", amount: -34.99, category_id: billsId },
    { offset: 0.44, label: "Coffee shop", amount: -8.5, category_id: foodId },
    { offset: 0.49, label: "Parking", amount: -12.0, category_id: transportId },
    {
      offset: 0.54,
      label: "Spotify",
      amount: -11.99,
      category_id: entertainmentId,
    },
    {
      offset: 0.59,
      label: "Farmer's market",
      amount: -38.2,
      category_id: foodId,
    },
    {
      offset: 0.64,
      label: "Electric bill",
      amount: -95.0,
      category_id: billsId,
    },
    { offset: 0.69, label: "Haircut", amount: -35.0, category_id: billsId },
    {
      offset: 0.74,
      label: "Concert tickets",
      amount: -89.0,
      category_id: entertainmentId,
    },
  ];

  const transactionRows = oneTimeSpecs.map((spec) => {
    const dayIndex = Math.min(
      rangeDays - 1,
      Math.floor(spec.offset * rangeDays),
    );
    const d = addDays(rangeStart, dayIndex);
    return {
      user_id: userId,
      account_id: accountId,
      label: spec.label,
      amount: spec.amount,
      date: format(d, "yyyy-MM-dd"),
      category_id: spec.category_id,
    };
  });

  const { error: insTxErr } = await supabase
    .from("transactions")
    .insert(transactionRows);
  if (insTxErr) throw insTxErr;

  console.log("");
  console.log("--- Demo seed complete ---");
  console.log("User id:", userId);
  console.log("Account id:", accountId);
  console.log("Auth user created this run:", createdUser);
  console.log("One-time transactions inserted:", transactionRows.length);
  console.log("Recurring rules inserted:", recurringInserts.length);
  console.log(
    `Date window (approx.): ${format(rangeStart, "yyyy-MM-dd")} .. ${format(rangeEnd, "yyyy-MM-dd")}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
