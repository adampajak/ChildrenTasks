---
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
---

## Why this stack

A solo developer shipping a children's chore-scheduling web-app with email+password auth needs a battle-tested, agent-friendly starter that handles auth, database, and deploy out of the box. The 10x Astro Starter (Astro + React + Supabase + Cloudflare) is the recommended default for `(web, js)` and clears all four agent-friendly gates — typed (TypeScript + Zod), convention-based (Astro file routing), popular in training data, and well-documented. Supabase provides PostgreSQL + auth + row-level security, covering FR-008 without custom auth infrastructure. Cloudflare Pages fits the small-scale, mobile-first profile with edge-fast responses. CI runs on GitHub Actions with auto-deploy-on-merge — the starter's standard shape.
