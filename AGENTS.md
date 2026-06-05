# Repository Guidelines

ChildrenTasks is an Astro 6 SSR application with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components, deployed to Cloudflare Workers.

## Hard Rules

- Never concatenate Tailwind class strings manually — always use the `cn()` helper from `@/lib/utils`.
- Never use Next.js directives (`"use client"`, `"use server"`) in React components.
- Always enable RLS on new Supabase tables with granular per-operation, per-role policies.
- API route files must export `const prerender = false` and use uppercase HTTP method names (`GET`, `POST`).
- Validate all API input with zod.
- Environment secrets (`SUPABASE_URL`, `SUPABASE_KEY`) are server-only — access via `astro:env/server`, never expose to client bundles.

## Build, Test, and Development

- `npm run dev` — local dev server (Cloudflare workerd runtime)
- `npm run build` — production build
- `npm run lint` — ESLint (type-checked rules)
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (astro + tailwindcss plugins)

Pre-commit hooks run `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Project Structure

```
src/
  components/       # Astro (static) + React (interactive) components
  components/ui/    # shadcn/ui primitives ("new-york" style)
  components/hooks/ # extracted React hooks
  components/auth/  # auth-related UI
  layouts/          # Astro layouts
  lib/              # helpers, services, Supabase client
  lib/services/     # extracted business logic
  pages/            # file-based routing (Astro pages + API routes)
  pages/api/        # server endpoints
  types.ts          # shared entity types and DTOs
  middleware.ts     # auth guard (PROTECTED_ROUTES array)
supabase/migrations/ # SQL migrations (YYYYMMDDHHmmss_description.sql)
```

## Coding Conventions

- Path alias `@/*` → `./src/*`.
- Astro components for static content; React only when interactivity is needed.
- shadcn/ui components: install via `npx shadcn@latest add [name]`.
- Services/helpers in `src/lib/`; shared types in `src/types.ts`.
- Supabase client created in `@/lib/supabase.ts` using `@supabase/ssr` with cookie sessions.

## Commit & CI

- CI (`.github/workflows/ci.yml`) runs lint + build on every push/PR to `master`. Both must pass.
- Only one commit exists so far — no established commit convention yet. Adopt Conventional Commits style (`feat:`, `fix:`, `chore:`, etc.) going forward.

## Environment Setup

- Node.js v22.14.0 (see `.nvmrc`)
- Copy `.env.example` → `.env` (Node) or `.dev.vars` (Cloudflare local dev)
- Local Supabase: `npx supabase start` (requires Docker)
- Deploy: `npx wrangler deploy`
