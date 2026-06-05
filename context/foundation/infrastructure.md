---
project: children-tasks
researched_at: 2026-05-27
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19
  runtime: Cloudflare Workers (via @astrojs/cloudflare adapter)
  database: Supabase (external)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project already ships with the `@astrojs/cloudflare` adapter (`v13.5.0`), a `wrangler.jsonc` config, and GitHub Actions CI — all wired for Workers. Zero adapter migration cost, zero monthly cost at the expected MVP traffic (100k requests/day free tier), and the developer has existing Cloudflare familiarity. The cost-minimization constraint (interview Q2) combined with the already-configured stack (Q3 familiarity) makes any other platform a regression without a compelling offset. The identified risks (CPU time limits, secret synchronization, `wrangler tail` reliability) are pre-populated in the risk register with concrete mitigations.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ⚠️ Partial | **9 / 10** |
| Vercel | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ⚠️ Partial (beta) | **8 / 10** |
| Netlify | ⚠️ Partial | ✅ Pass | ⚠️ Partial | ✅ Pass | ✅ Pass | **7 / 10** |
| Fly.io | ✅ Pass | ⚠️ Partial | ✅ Pass | ✅ Pass | ⚠️ Partial (preview) | **6 / 10** |
| Railway | ✅ Pass | ✅ Pass | ⚠️ Partial | ✅ Pass | ❌ Fail | **5 / 10** |
| Render | ⚠️ Partial | ✅ Pass | ⚠️ Partial | ⚠️ Partial | ❌ Fail | **3 / 10** |

**Scoring notes:**

- **CLI-first**: Cloudflare (`wrangler`), Vercel (`vercel`), Railway (`railway`), and Fly.io (`flyctl`) all offer full CLI coverage for deploy, logs, and secrets. Netlify's CLI lacks rollback (UI-only). Render's CLI cannot edit env vars or stream logs.
- **Managed/Serverless**: All platforms are managed. Fly.io requires a Dockerfile and manual container configuration — partial because operational surface is higher. Render free tier auto-spins-down after 15 min inactivity — partial because the free tier is unusable for production without cold-start mitigation.
- **Agent-readable docs**: Cloudflare publishes `llms.txt` and markdown on GitHub. Vercel and Fly.io publish MDX on GitHub. Netlify, Railway, and Render docs are web-only HTML — readable but require scraping.
- **Stable deploy API**: `wrangler deploy`, `vercel --prod`, `netlify deploy --prod`, and `fly deploy` all return deterministic success/failure. Railway (`railway up`) is equally solid. Render's deploy hooks are reliable but the CLI feedback loop is weaker.
- **MCP / Integration**: Netlify has the strongest story — an official GA MCP server. Cloudflare and Vercel both have MCP presence but scoped to specific products or in beta. Fly.io is preview-only. Railway and Render have no MCP.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Already configured in the repository (`wrangler.jsonc`, `@astrojs/cloudflare` adapter, GitHub Actions CI with `wrangler deploy`). Free tier covers 100k requests/day — the entire expected MVP load at zero cost. Cloudflare publishes `llms.txt` and markdown docs, giving an agent the ability to reason over current API docs directly. The developer has existing familiarity. No adapter migration required. The main limitations — CPU time per invocation and manual secret sync — are manageable with the mitigations in the risk register.

#### 2. Vercel

Strong second: excellent CLI (`vercel rollback` works natively), MDX docs on GitHub, solid Astro 6 SSR support via `@astrojs/vercel@10.0.7`. The Vercel MCP server is in beta (status checked May 2026). Requires adapter migration (replace `@astrojs/cloudflare` with `@astrojs/vercel`, remove `wrangler.jsonc`, update CI). Cost at 100k requests/month is $10–30/month — penalized by the cost-minimization constraint. Cold starts of 50–200ms are acceptable for this use case.

#### 3. Netlify

Only platform in the shortlist with a GA MCP server — a meaningful differentiator if agent-driven operations are a priority. Astro 6 SSR supported via `@astrojs/netlify@7.0.10`. Requires adapter migration. CLI rollback is UI-only (significant gap vs. the other two). Cold starts of 1–3s (Lambda-backed) are the worst in the shortlist. Cost at 100k requests/month is $25–30/month — the most expensive of the three and furthest from the cost-minimization preference.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **CPU time limits are real and silent.** The Workers free tier caps at 10ms CPU per invocation; paid tier at 50ms. The schedule-generation algorithm (O(n²) constraint solving across children × chores × days) has a realistic path to hitting the limit on complex households — and the error surface is a 1101 with no useful stack trace.
2. **No native CLI rollback.** `wrangler rollback` does not exist in the way `fly rollback` or `vercel rollback` does. Reverting requires redeploying a previous Git commit through CI — which requires the CI pipeline to be functional at the exact moment something is broken.
3. **`wrangler tail` is beta and region-limited.** This is the primary real-time debugging tool. In regions where it is unreliable, logs must be parsed manually from the Cloudflare dashboard — significant friction when diagnosing production issues. *(Status checked May 2026.)*
4. **Workers runtime ≠ Node.js.** The `nodejs_compat` flag bridges many gaps but is not full Node.js. Supabase SDK updates that use Node.js-native APIs (e.g., `http2`, certain `crypto` methods) can silently break on Workers with no build-time warning.
5. **Secret synchronization is entirely manual.** `astro:env/server`, `.dev.vars`, and the Workers dashboard are three separate sources of truth. There is no auto-sync — a variable declared in the schema but missing in the dashboard causes a cryptic runtime error at first request, not a build error.

### Pre-mortem — How This Could Fail

The team shipped ChildrensTasks on Cloudflare Workers, driven by the free tier and existing stack familiarity. Early weeks were smooth. By month three, users reported intermittent 504 errors when generating schedules for households with five children and over twenty chores. The schedule-generation logic — running constraint checks across every child-chore-day combination — was hitting the 50ms CPU limit. The fix required refactoring the algorithm or offloading computation to a Durable Object, adding $0.15/day minimum cost and scope not budgeted for MVP. Simultaneously, `wrangler tail` was flaky in the team's region, so debugging required correlating dashboard logs manually. A contributor accidentally committed a key into a file that wasn't gitignored, requiring a full Supabase key rotation. The CI auto-deploy stopped working when the `CLOUDFLARE_API_TOKEN` secret expired silently — no email, no dashboard alert. By month four, the platform was technically free but operationally expensive: multiple weekends spent on infrastructure instead of features.

### Unknown Unknowns

- **`astro:env/server` variables are not validated at build time against the Workers dashboard.** A variable in the schema but missing in the dashboard causes a runtime panic on first request — not a build failure, not a lint warning. Always verify secrets are present in the dashboard before deploying.
- **The free tier's 100k requests/day limit resets at midnight UTC**, not your local timezone. A usage spike in a European evening can exhaust the daily budget, causing 429s for the rest of the day with no notification by default.
- **`wrangler.jsonc` uses JSONC (comment-aware JSON), not standard JSON.** CI scripts, tooling, or log parsers that read it with a standard JSON parser will fail silently. Be aware when integrating third-party tooling.
- **Wrangler's local dev server uses Miniflare** — a faithful but not identical simulation of the Workers runtime. Subtle differences in timing, crypto, and URL handling mean passing locally is not a production guarantee. Test schedule generation under realistic data volumes before shipping.
- **Global deployment is non-negotiable on Workers.** There is no "deploy to a single EU region" for Workers (unlike Cloudflare Pages with regional routing). If GDPR data-residency requirements ever arise for this app, the architecture must change at the platform level.

## Operational Story

- **Preview deploys**: Cloudflare Workers does not auto-generate preview URLs per branch the way Pages does. With the current Workers setup, branch previews require either a second Workers name (e.g., `children-tasks-preview`) or switching the CI to deploy PRs to a separate environment. The GitHub Actions CI currently auto-deploys on merge to `master` only. Preview URLs are not available out of the box on Workers — this is a Pages feature.
- **Secrets**: Environment secrets live in the Cloudflare Workers dashboard (Settings → Variables) and are set via `npx wrangler secret put KEY`. For local dev, secrets go in `.dev.vars` (gitignored). GitHub Actions CI needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets, plus `SUPABASE_URL` and `SUPABASE_KEY` for the build step. Rotation: `wrangler secret put KEY` again — no downtime, takes effect on next deployment.
- **Rollback**: Redeploy the previous commit via `git revert` + push, or manually trigger the prior workflow run in GitHub Actions. Time-to-revert: typically 2–5 minutes via CI. Supabase database migrations do not roll back automatically — schema changes must be handled manually via a down-migration SQL file.
- **Approval**: Production deployments happen automatically on merge to `master` (CI `wrangler deploy`). Agent may deploy unattended to production via CI trigger. Human action required for: rotating `CLOUDFLARE_API_TOKEN`, dropping or migrating Supabase tables, changing the Workers plan tier, or adding a custom domain.
- **Logs**: `npx wrangler tail` (beta, region-limited as of May 2026) streams real-time logs to the terminal. Dashboard logs available at dash.cloudflare.com → Workers → your-worker → Logs. For structured log queries, Cloudflare Workers Logpush (GA, requires paid plan) exports to R2 or a third-party sink.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Schedule generation hits 50ms CPU time limit on complex households | Devil's advocate | Medium | High | Add a request-time budget check; offload to a Cloudflare Queue or Durable Object if needed; test with max realistic dataset before launch |
| No CLI rollback — CI pipeline must be healthy when reverting | Devil's advocate | Low | Medium | Keep a `git revert` runbook in docs; test rollback path before first production deploy |
| `wrangler tail` unreliable in some regions (beta) | Devil's advocate | Medium | Medium | Use Cloudflare dashboard logs as fallback; add structured `console.error` to all catch blocks for dashboard searchability |
| `nodejs_compat` gaps cause silent runtime failures after Supabase SDK updates | Devil's advocate | Low | High | Pin Supabase SDK version; run `wrangler dev` smoke test after every dependency update before merging |
| `CLOUDFLARE_API_TOKEN` or `SUPABASE_KEY` expires silently, breaking CI | Pre-mortem | Medium | High | Set calendar reminders for token rotation; add a weekly CI health-check job that fails loudly if secrets are missing |
| Variable declared in `astro:env/server` but missing in Workers dashboard causes runtime panic | Unknown unknowns | Medium | High | Maintain a `REQUIRED_SECRETS.md` checklist; validate secrets exist via a startup check in middleware |
| Free-tier daily limit (100k req/day) reset at midnight UTC causes unexpected 429s | Unknown unknowns | Low | Medium | Monitor via Cloudflare analytics; upgrade to paid Workers Unbound if daily traffic approaches 80k |
| Contributor exposes key by committing `.dev.vars`-like file | Pre-mortem | Low | High | `.gitignore` enforced; add a pre-commit secret-scanning step via `git-secrets` or GitHub secret scanning (GA) |
| `wrangler.jsonc` fails with standard JSON parsers in CI tooling | Unknown unknowns | Low | Low | Document the JSONC format in AGENTS.md; avoid piping it to `jq` or standard JSON tools |

## Getting Started

The project is already configured for Cloudflare Workers deployment. Verify and ship with these steps:

1. **Authenticate wrangler**: `npx wrangler login` (opens browser OAuth — one-time per machine).
2. **Set production secrets** in the Workers dashboard or via CLI:
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```
3. **Add CI secrets** to the GitHub repository (Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN` — create a scoped token at dash.cloudflare.com → My Profile → API Tokens (template: "Edit Cloudflare Workers")
   - `CLOUDFLARE_ACCOUNT_ID` — found in the Workers dashboard right sidebar
   - `SUPABASE_URL` and `SUPABASE_KEY` — needed by the build step (`npm run build`)
4. **Trigger the first deploy** by pushing to `master` — the existing `.github/workflows/ci.yml` runs lint + build + `wrangler deploy`.
5. **Verify the deployment**: `npx wrangler tail` (beta) or check the Workers dashboard for the live URL and first request logs.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (existing pipeline in `.github/workflows/ci.yml` was not modified)
- Production-scale architecture (multi-region, HA, DR)
- Supabase deployment or migration strategy
- Custom domain and SSL provisioning (handled by Cloudflare automatically once a domain is routed)
