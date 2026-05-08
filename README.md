# Budget Buddy

Personal budget calendar: transactions on a month grid, rolling balance projection, recurring rules with exceptions, and optional shared budgets.

## Overview

Budget Buddy puts your money on a calendar so you can see when things land and how your balance shifts day by day—not just monthly totals. Switch between budgets, invite someone to share one, and open the full list or charts whenever you want more detail.

**Status:** Beta—live at [budgetbuddy.kaiafay.com](https://budgetbuddy.kaiafay.com/). Personal project / portfolio piece.

## Why I Built This

Spreadsheets work, but they rarely match how I actually spend: rent hits on the 1st, subscriptions drift across weeks, and “what’s left mid-month?” is the question that matters. This app started as a way to pin amounts to calendar days and keep recurring logic honest (skips, one-off edits, splits) without fighting a grid of formulas.

## Live Demo

- **Production (beta):** [https://budgetbuddy.kaiafay.com/](https://budgetbuddy.kaiafay.com/)

## Features

- **Calendar home** — Swipe between months and tap a day to focus it; each day shows how your balance moves after bills and income land.
- **Transactions** — Full list with search, filters, and date range; edit or remove entries, or skip a single instance of something recurring without killing the whole rule.
- **Add & edit** — Log one-off purchases and income, or set repeating entries (weekly through yearly) with categories. When you change a repeating item, you can limit edits to just one day or everything from that day forward.
- **Analytics** — Pie chart for where money went by category, plus weekly bar charts—either this month or the last three months side by side.
- **Multiple budgets** — Run separate budgets from one login and switch between them; links remember which budget you were using when it matters.
- **Sharing** — Budget owners invite people by email; invites open on a simple accept page, and settings cover who’s on the budget and pending invites.
- **Auth** — Sign up and sign in with email and password; optional invite-only signup if you enable it in config. Password reset is supported.
- **Account deletion** — Users can wipe their own data and auth account from the app when they’re done.
- **Installable app** — Add to home screen on a phone; opens like an app with your branding colors.

## Tech Stack

### Frontend

- **Next.js** (App Router) with **React** and **TypeScript**
- **Tailwind CSS** for styling and **shadcn/ui** for accessible UI building blocks
- **SWR** so lists and calendar data stay fresh without full page reloads
- **Charts** for analytics; **date-fns** for dates; **Lucide** icons and swipe gestures tuned for touch

### Backend & data

- **Supabase** for hosted Postgres, authentication, and row-level security so each user only sees their own budgets and memberships

### Hosting & ops

- **Vercel Analytics** for basic traffic insight
- A **daily scheduled request** against the database as a lightweight health check (infrastructure detail, not something users see)

## Architecture / How It Works

**Routing and auth.** `proxy.ts` runs on matched routes: unauthenticated users hit `/login`; `/login`, `/auth/*`, `/invite/*`, and `/api/keep-alive` stay public. Authenticated users leaving login respect `?next=` when it is an app path.

**Data reads.** `lib/api.ts` exposes fetchers (`fetchAccounts`, `fetchCalendarData`, `fetchTransactions`, `fetchCategories`, …) used with `useSWR`. Keys live in `lib/swr-keys.ts`; account-scoped keys are gated so nothing loads without an active budget id.

**Writes.** Mutations are centralized in `lib/transactions-mutations.ts` (validation via `safeParseMutation`). After changes, components call `mutate()` with the right keys—calendar months use helpers like `invalidateNext12CalendarMonths` for recurring churn instead of blanket router refresh.

**Balances.** `lib/projection.ts` folds starting balance, one-time transactions, and expanded recurring rules into per-date deltas; recurring exceptions (`skip` / `modified`) apply during expansion.

**Recurring model.** Rules form chains (`root_rule_id`); exceptions attach per rule and date. Synthetic recurring transaction ids (`ruleId-yyyy-MM-dd`) are parsed in `lib/recurring-rules.ts`.

**Multi-budget access.** Membership is modeled in `account_members`; RLS governs access. Client queries on shared tables rely on RLS rather than redundant `user_id` filters so co-owner edits behave correctly.

## Future Improvements

- [ ] Broader E2E coverage (Playwright or similar) for auth and recurring flows
- [ ] Offline or degraded-mode caching for calendar reads on flaky networks
- [ ] Deeper a11y audit (focus traps, chart semantics)
- [ ] Export (CSV) for transactions per budget

## Screenshots

Coming soon.
