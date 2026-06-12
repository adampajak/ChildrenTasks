---
project: "ChildrensTasks"
version: 1
status: draft
created: 2026-06-05
updated: 2026-06-12
prd_version: 1
main_goal: market-feedback
top_blocker: none
---

# Roadmap: ChildrensTasks

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Rodzic wielodzietnej rodziny potrzebuje narzędzia, które automatycznie generuje tygodniowy plan obowiązków domowych — uwzględniając wiek dzieci, ich dostępność czasową i częstotliwość obowiązków — zamiast koordynować to ręcznie. Problem nie polega na śledzeniu obowiązków, lecz na wygenerowaniu planu, który jest jednocześnie sprawiedliwy i wykonalny.

## North star

**S-03: Rodzic generuje i przegląda tygodniowy harmonogram** — pierwsza historyjka, która udowadnia, że produkt działa (ang. "north star" — najmniejszy end-to-end kawałek, którego dostarczenie waliduje główną hipotezę produktu: automatyczny harmonogram rozwiązuje problem koordynacji). Umieszczony jak najwcześniej po koniecznych prerequisitach (definicja dzieci i obowiązków).

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| S-01 | children-crud | zdefiniować profile dzieci (imię, kategoria wiekowa, dostępność) | — | FR-001, FR-008, US-01 | done |
| S-02 | chores-crud | zdefiniować obowiązki (nazwa, kategoria wiekowa, częstotliwość, czas) | — | FR-002, US-01 | done |
| S-03 | schedule-generation | wygenerować tygodniowy harmonogram i zobaczyć plan na dziś / cały tydzień | S-01, S-02 | FR-003, FR-004, US-01 | proposed |
| S-04 | schedule-manual-adjust | ręcznie przenieść lub zmienić przypisanie po generacji | S-03 | FR-010, US-01 | proposed |
| S-05 | child-daily-view | przełączyć na widok jednego dziecka z zadaniami na dziś | S-03 | FR-006 | proposed |
| S-06 | task-completion | oznaczyć zadanie jako wykonane z dowolnego widoku | S-03 | FR-007 | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | Rdzeń generowania | `S-01` / `S-02` (parallel) → `S-03` → `S-04` | Main validation path: od danych wejściowych po edytowalny harmonogram — priorytet market-feedback. |
| B | Konsumpcja harmonogramu | `S-05` / `S-06` (parallel, po S-03) | Widoki i interakcje z wygenerowanym planem — rozszerzenia po walidacji rdzenia. |

## Baseline

What's already in place in the codebase as of `2026-06-05` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19, shadcn/ui (button.tsx), Tailwind 4, file-based routing (src/pages/)
- **Backend / API:** present — Astro SSR (output: "server"), API routes src/pages/api/auth/{signup,signin,signout}.ts, middleware
- **Data:** partial — Supabase client wired (@supabase/ssr), brak migracji i tabel domenowych
- **Auth:** present — Supabase auth, cookie sessions, middleware chroni /dashboard, signup/signin/signout endpointy. **FR-008 (email+password auth) jest już zrealizowany przez istniejącą implementację.**
- **Deploy / infra:** present — Cloudflare Workers (wrangler.jsonc), GitHub Actions CI (lint + build + deploy)
- **Observability:** absent — brak logowania, error trackingu, metryk (PRD nie wymaga na MVP)

## Foundations

Brak wyodrębnionych foundations. Wszystkie warstwy cross-cutting (auth, deploy, CI) są już obecne w baseline. Schemat danych jest wprowadzany progresywnie w ramach vertical slices — pierwszy slice (S-01) ustanawia wzorzec migracji + RLS, kolejne go powielają.

## Slices

### S-01: Definicja profili dzieci

- **Outcome:** user can create, edit, and delete child profiles (name, age category, available time per weekday)
- **Change ID:** children-crud
- **PRD refs:** FR-001, FR-008, US-01
- **Prerequisites:** —
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Pierwszy slice ustanawiający wzorzec migracji Supabase + RLS. Jeśli wzorzec będzie zły, kolejne slices odziedziczą problem. Mitygacja: prosty schemat (1 tabela, 1 policy), łatwy do korekty.
- **Status:** done

### S-02: Definicja obowiązków domowych

- **Outcome:** user can create, edit, and delete chores (name, age category [małe/średnie/duże], min weekly frequency, time to complete)
- **Change ID:** chores-crud
- **PRD refs:** FR-002, US-01
- **Prerequisites:** —
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Analogiczny wzorzec do S-01. Jeśli S-01 i S-02 są robione równolegle, trzeba uzgodnić konwencję RLS i nazewnictwa kolumn między agentami.
- **Status:** done

### S-03: Generowanie i widok tygodniowego harmonogramu

- **Outcome:** user can generate a weekly chore schedule respecting age/time/frequency constraints, then view today's tasks across all children and the full weekly schedule
- **Change ID:** schedule-generation
- **PRD refs:** FR-003, FR-004, US-01
- **Prerequisites:** S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Algorytm schedulera to serce produktu — PRD Business Logic jest dobrze opisany (round-robin z filtrem wiekowym i limitem czasu), ale implementacja może ujawnić edge-case'y (np. brak eligible children na dany dzień). Mitygacja: algorytm deterministyczny, testowalny jednostkowo.
- **Status:** proposed

### S-04: Ręczna korekta harmonogramu

- **Outcome:** user can manually reassign or reschedule individual tasks after generation
- **Change ID:** schedule-manual-adjust
- **PRD refs:** FR-010, US-01
- **Prerequisites:** S-03
- **Parallel with:** S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** UX drag-and-drop lub inline-edit na mobile może być złożone. Mitygacja: PRD mówi "reassign or reschedule" — wystarczy prosty select/datepicker, nie drag-and-drop.
- **Status:** proposed

### S-05: Widok dziecka na dziś

- **Outcome:** user can switch to a single child's view showing only that child's tasks for today
- **Change ID:** child-daily-view
- **PRD refs:** FR-006
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Minimalny — to filtrowanie istniejących danych po child_id + today. Brak nowych endpointów, jedynie nowy widok UI.
- **Status:** proposed

### S-06: Oznaczanie zadań jako wykonane

- **Outcome:** user can mark a task as done from any view (today view, weekly view, child view)
- **Change ID:** task-completion
- **PRD refs:** FR-007
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Minimalny — dodanie kolumny `completed_at` do tabeli assignments + toggle w UI. Kwestia: czy completed tasks znikają z widoku czy są przekreślone — decyzja UX do podjęcia w `/10x-plan`.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| S-01 | children-crud | Implement child profiles CRUD | yes | Run `/10x-plan children-crud` |
| S-02 | chores-crud | Implement chores CRUD | yes | Run `/10x-plan chores-crud`. Parallel with S-01. |
| S-03 | schedule-generation | Implement schedule generation + weekly/daily view | no | Requires S-01 + S-02 done first |
| S-04 | schedule-manual-adjust | Manual schedule adjustment after generation | no | Requires S-03 |
| S-05 | child-daily-view | Child-specific daily task view | no | Requires S-03 |
| S-06 | task-completion | Mark tasks as done | no | Requires S-03 |

## Open Roadmap Questions

1. **Jaki jest budżet czasowy (mvp_weeks, hard_deadline, after_hours_only)?** — Owner: user. Block: roadmap-wide (nie blokuje planowania, ale wpływa na priorytetyzację jeśli czas jest ograniczony).

## Parked

- **Powiadomienia i przypomnienia (push, email, SMS)** — Why parked: PRD §Non-Goals. Rodzic sprawdza aplikację manualnie.
- **Gamifikacja / system nagród / punkty** — Why parked: PRD §Non-Goals. Motywacja pochodzi z planu i nadzoru rodzicielskiego.
- **Observability (logging, error tracking, metrics)** — Why parked: PRD nie wymaga na MVP; brak NFR dotyczącego monitoringu. Rozważyć po walidacji rdzenia.

## Done

- **S-01: user can create, edit, and delete child profiles (name, age category, available time per weekday)** — Archived 2026-06-12 → `context/archive/2026-06-05-children-crud/`. Lesson: —.
- **S-02: user can create, edit, and delete chores (name, age category [małe/średnie/duże], min weekly frequency, time to complete)** — Archived 2026-06-12 → `context/archive/2026-06-12-chores-crud/`. Lesson: —.
