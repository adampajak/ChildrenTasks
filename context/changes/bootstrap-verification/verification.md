---
bootstrapped_at: 2026-05-25T08:56:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: children-tasks
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: children-tasks
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

A solo developer shipping a children's chore-scheduling web-app with email+password auth needs a battle-tested, agent-friendly starter that handles auth, database, and deploy out of the box. The 10x Astro Starter (Astro + React + Supabase + Cloudflare) is the recommended default for `(web, js)` and clears all four agent-friendly gates — typed (TypeScript + Zod), convention-based (Astro file routing), popular in training data, and well-documented. Supabase provides PostgreSQL + auth + row-level security, covering FR-008 without custom auth infrastructure. Cloudflare Pages fits the small-scale, mobile-first profile with edge-fast responses. CI runs on GitHub Actions with auto-deploy-on-merge — the starter's standard shape.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | not run | — | cmd_template uses git clone; npm recency check skipped |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh | from card.docs_url |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 18
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: append-merged (28 new lines from starter)
**.github handling**: merged workflows/ci.yml (no file-level conflicts)
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW

#### HIGH findings

- **devalue** 5.6.3–5.8.0 — DoS via sparse array deserialization (GHSA-77vg-94rm-hx3p). Fix available via `npm audit fix`.

#### MODERATE findings

- **ws** 8.0.0–8.20.0 — Uninitialized memory disclosure (GHSA-58qx-3vcg-4xpx). Transitive via @supabase/realtime-js and @cloudflare/vite-plugin. Fix available via `npm audit fix`.
- **@cloudflare/vite-plugin** — depends on vulnerable miniflare, wrangler, ws. Transitive.
- **miniflare** — depends on vulnerable ws. Transitive.
- **wrangler** — depends on vulnerable miniflare. Transitive.
- **yaml** 2.0.0–2.8.2 — Stack Overflow via deeply nested YAML collections (GHSA-48c2-rrv3-qjmp). Transitive via yaml-language-server. Fix requires breaking change (`npm audit fix --force`).
- **yaml-language-server** — depends on vulnerable yaml. Transitive.
- **volar-service-yaml** — depends on vulnerable yaml-language-server. Transitive.
- **@astrojs/language-server** — depends on vulnerable volar-service-yaml. Transitive.
- **@astrojs/check** — depends on vulnerable @astrojs/language-server. Transitive.

**Direct vs transitive**: 0 direct / 1 HIGH transitive, 9 MODERATE transitive. All findings are transitive dependencies.

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| bootstrapper_confidence | first-class |
| quality_override | false |
| path_taken | standard |
| self_check_answers | null |
| team_size | solo |
| deployment_target | cloudflare-pages |
| ci_provider | github-actions |
| ci_default_flow | auto-deploy-on-merge |
| has_auth | true |
| has_payments | false |
| has_realtime | false |
| has_ai | false |
| has_background_jobs | false |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
