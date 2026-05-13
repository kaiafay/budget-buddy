# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Budget Buddy is a single Next.js 16 (App Router) PWA. There is no separate backend service — the backend is Supabase (hosted Postgres + Auth + RLS). See `.cursorrules` for full schema and architecture details.

### Running services

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Next.js dev server (port 3000) |
| `npm run lint` | ESLint |
| `npm test` | Vitest (194 unit/component tests; runs without Supabase) |
| `npm run build` | Production build |

### Environment variables

A `.env.local` file is required with at minimum:

```
NEXT_PUBLIC_SUPABASE_URL=<supabase project url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<supabase service role key>
```

Without real Supabase credentials, the dev server starts and renders pages but authentication/data flows will fail. Tests run without any env vars (they mock Supabase).

These secrets are configured in the Cursor Cloud secrets panel and are injected as environment variables. To populate `.env.local` from them:

```bash
printf 'NEXT_PUBLIC_SUPABASE_URL=%s\nNEXT_PUBLIC_SUPABASE_ANON_KEY=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\n' \
  "$NEXT_PUBLIC_SUPABASE_URL" "$NEXT_PUBLIC_SUPABASE_ANON_KEY" "$SUPABASE_SERVICE_ROLE_KEY" > .env.local
```

### Important caveats

- **No local database**: Supabase is remote-only. There is no `supabase/` CLI config, no Docker, no local Postgres.
- **Lockfile**: Uses `package-lock.json` (npm). Do not use pnpm/yarn.
- **Tailwind v4**: Configured via CSS variables in `app/globals.css`, not via `tailwind.config.ts` (which doesn't exist).
- **Tests are fully mocked**: All 14 test files in `__tests__/` use mocked Supabase clients and run in Node with happy-dom. They do not require network or env vars.
- **Proxy auth (not middleware)**: Auth is handled by `proxy.ts` (Next.js 16 proxy convention), not `middleware.ts`.
- **Node.js 22+** works fine with this project.
- **Email confirmation required**: Supabase has email confirmation enabled. To create a test user that can sign in, use the admin API with `email_confirm: true`. The service role key is required for this.
- **Auto-created first account**: A DB trigger auto-creates a default budget (account) on user signup.
- **Invite code gate**: Signup can be gated by `NEXT_PUBLIC_INVITE_CODE`. When unset/empty, the gate is disabled.
- **AGENTS.md is gitignored**: The `.gitignore` excludes `*.md` except `README.md`. Use `git add -f AGENTS.md` when committing changes to this file.
