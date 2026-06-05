Explore deployment config

Read [](file:///c%3A/Projects/AP/ChildrensTasks/.github/workflows)

Read [](file:///c%3A/Projects/AP/ChildrensTasks/supabase/migrations)

Read [](file:///c%3A/Projects/AP/ChildrensTasks/wrangler.jsonc)

Read [](file:///c%3A/Projects/AP/ChildrensTasks/astro.config.mjs)

Read [](file:///c%3A/Projects/AP/ChildrensTasks/package.json)

Read [](file:///c%3A/Projects/AP/ChildrensTasks/src/middleware.ts)

Read [](file:///c%3A/Projects/AP/ChildrensTasks/.github/workflows/ci.yml)

Read [](file:///c%3A/Projects/AP/ChildrensTasks/.env.example)

Created memory file [](file:///c%3A/Users/adam.pajak/AppData/Roaming/Code/User/workspaceStorage/01ff6b49ea8a493ddd3770006244f912/GitHub.copilot-chat/memory-tool/memories/YWRiOTQ0ODQtODk5Zi00NWY1LWE3YmUtNGNiODA4ZGNiNzcz/plan.md)

## Plan: Pierwsze wdrożenie na Cloudflare Workers

Dwa pliki do zmiany w kodzie, potem trzy ręczne bramki (tokeny/sekrety), a następnie push na `master` wywołuje pełne CI z deployem.

---

### Phase 1 — Zmiany w kodzie *(agent wykonuje)*

**Krok 1 — Popraw nazwę workera w wrangler.jsonc**
`"name": "10x-astro-starter"` → `"name": "children-tasks"`
(aktualnie jest nazwa startera; `infrastructure.md` definiuje projekt jako `children-tasks`)

**Krok 2 — Dodaj krok deploy do ci.yml**
Nowy krok `wrangler deploy` po `npm run build`, z warunkiem `if: github.event_name == 'push'` — żeby PR-y tylko lintowały i budowały, a merge na `master` automatycznie wdrażał:
```yaml
- name: Deploy to Cloudflare Workers
  if: github.event_name == 'push'
  run: npx wrangler deploy
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

---

### Phase 2 — Ręczne bramki *(ty wykonujesz, w tej kolejności)*

**Krok 3 — Utwórz Cloudflare API Token**
dash.cloudflare.com → My Profile → API Tokens → szablon *"Edit Cloudflare Workers"* → ogranicz scope do workera `children-tasks`

**Krok 4 — Ustaw sekrety produkcyjne w Cloudflare** (przez CLI lub dashboard):
```bash
npx wrangler login          # jednorazowo, otwiera OAuth w przeglądarce
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

**Krok 5 — Dodaj sekrety do GitHub Actions**
GitHub repo → Settings → Secrets and variables → Actions → cztery sekrety:
- `CLOUDFLARE_API_TOKEN` *(z kroku 3)*
- `CLOUDFLARE_ACCOUNT_ID` *(prawy pasek boczny w Workers dashboard)*
- `SUPABASE_URL`
- `SUPABASE_KEY`

---

### Phase 3 — Deploy i weryfikacja *(agent + ty)*

**Krok 6** — Push na `master` wyzwala CI: `lint → build → wrangler deploy`

**Krok 7 — Weryfikacja**:
- `npx wrangler tail` (logi real-time) lub Workers dashboard → Logs
- Sprawdź żywy URL widoczny w dashboardzie po deploy
- Zaloguj się do `/auth/signin` i potwierdź, że auth z Supabase działa

---

**Pliki do modyfikacji:** wrangler.jsonc, ci.yml
**Brak migracji DB** — `supabase/migrations/` jest puste, nie ma akcji po stronie bazy.

---

Czy zatwierdzasz ten plan? Mogę od razu wykonać Phase 1 (zmiany kodu), a Ty w tym czasie zajmiesz się bramkami w Phase 2.