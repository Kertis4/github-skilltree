# CLAUDE.md

Guidance for AI coding agents (Claude, Copilot) and humans working in this repo.
Keep changes small, follow the conventions below, and **never commit secrets**.

> 📖 **Source of truth:** [`README.md`](README.md) is the canonical hackathon plan —
> architecture, API contract, skill taxonomy, and the XP rubric. Read it before
> building features. This file explains *how we work*; the README explains *what we build*.

---

## What this is

GitHub SkillTree turns a developer's GitHub into a gamified profile — **XP**, an
interactive **skill tree**, and a **radar chart** — wrapped in a hacker / terminal /
video-game theme. The pipeline is: GitHub OAuth → cheap signal ingestion (file tree,
languages, dependency manifests) → map-reduce LLM analysis on an **internal Azure
OpenAI** endpoint → **deterministic** XP scoring → report rendered by the frontend.

---

## 🔒 Secrets & security — hard rules (do not break)

**Never commit or push secrets. This is the top priority, above any feature work.**

- **Never** place real credentials in a tracked file. This includes: GitHub OAuth
  **client secrets**, personal access tokens (PATs), API keys, **Azure OpenAI** keys or
  endpoints, database connection strings, JWTs, cookies, or session tokens.
- Secrets live **only** in untracked `.env` files (git-ignored) or a proper secret
  manager. Commit only `.env.example` with **empty / placeholder** values.
- **Frontend caveat:** anything in a Vite `VITE_*` variable is bundled into the browser
  and is therefore **public**. Never put a secret (OAuth *client secret*, Azure key,
  any token) in a `VITE_*` var. Client secrets and tokens stay **server-side only**
  (see README §7).
- OAuth access/refresh tokens are stored **server-side**, never in the repo and never in
  browser local storage.
- **Before staging, review the diff.** Run `git status` and inspect what you're adding.
  If a file might contain a secret, do **not** add it. Never run `git add -A` blindly.
- **If a secret is ever committed, treat it as compromised:** rotate/revoke it
  immediately, then remove it from history. Deleting it in a later commit is *not*
  enough — it stays in the git history.
- Do **not** disable safety checks to force work through (`git push --no-verify`,
  force-pushing over review). Never `console.log` a secret.

**Pre-push checklist:** no `.env` staged · no keys/tokens/connection strings in the diff ·
`.env.example` holds placeholders only · `git status` shows no credential files.

The repo-wide [`.gitignore`](.gitignore) ignores **every dotfile by default** (`.*`) —
so a stray `.env`, `.aws/`, `.ssh/`, or `.netrc` can never be committed — and allowlists
only the safe dotfiles the repo needs (`.gitignore`, `.env.example`, `.github/`, …). It
also nets non-dot secrets (`id_rsa`, `secrets.json`, `*.pem`, `*.key`). **Adding a new
legitimate dotfile? Add a matching `!` allowlist line**, or it stays ignored.

---

## Project structure

```
github-skilltree/
├─ README.md            # canonical plan — source of truth
├─ CLAUDE.md            # this file
├─ .gitignore           # repo-wide: ignores .env + keys/certs + Python artifacts
├─ backend/             # FastAPI — server-side GitHub OAuth (holds the client secret)
│  ├─ .env.example      # safe template — GITHUB_CLIENT_ID/SECRET, redirect, origin
│  ├─ requirements.txt  # frozen deps (pip freeze)
│  └─ app/
│     ├─ main.py          # FastAPI app + /health, /auth/github/{login,callback}
│     ├─ config.py        # pydantic-settings (reads backend/.env)
│     ├─ github_oauth.py  # authorize URL, code→token exchange
│     └─ github_graphql.py # GraphQL repo analysis (languages → estimated LOC)
└─ frontend/            # Vite + React 19 + TypeScript 6 + Tailwind v4
   ├─ .env.example      # safe template — VITE_API_BASE_URL (backend holds OAuth creds)
   ├─ .gitignore        # also ignores .env*
   └─ src/
      ├─ components/{ui,terminal,effects,landing,game}
      ├─ hooks/  lib/  config/  data/  pages/
      └─ App.tsx → LandingPage (sign in) | DashboardPage (analysis)
```

---

## Commands (Windows PowerShell)

Run from `frontend/`. `npm.ps1` is blocked by the default execution policy, so prefix
each **new** shell session once:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned -Force
npm install      # install dependencies
npm run dev      # dev server → http://localhost:5173/
npm run build    # tsc -b && vite build  (must pass before pushing)
npm run lint
```

---

## Backend — GitHub OAuth (FastAPI)

The `backend/` service runs the **server-side half** of GitHub OAuth so the OAuth
*client secret never reaches the browser*. Flow (popup + `postMessage`, stores nothing):

1. Frontend opens `GET /auth/github/login` in a popup.
2. Backend sets an httpOnly `state` cookie (CSRF defense) and redirects to GitHub.
3. GitHub returns to `GET /auth/github/callback`; the backend exchanges the `code` for a
   token (using the secret), runs the **GraphQL repo analysis** (see below), **prints a
   per-repo summary to its console**, then discards the token.
4. The callback page `postMessage`s the analysis to the frontend origin (never `*`) and
   closes. The frontend, already showing a loading **dashboard** page, renders it.

Nothing is persisted — no tokens, no credential cookies, no repo data. The analysis is
public-repo data only and lives in browser memory for the session.

**Endpoints:** `GET /health` · `GET /auth/github/login` · `GET /auth/github/callback`.

### Run (Windows PowerShell, from `backend/`)

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned -Force
python -m venv .venv                 # first time only
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt      # first time only
uvicorn app.main:app --reload --port 8000   # → http://localhost:8000
```

> **ARM64 Windows note:** use **plain** `uvicorn` (not `uvicorn[standard]`) — the
> `httptools` extra has no ARM64 wheel and fails to build from source.

### Configure OAuth (to go live)

`GET /auth/github/login` returns **503** until credentials exist. Create a GitHub OAuth
app (Settings → Developer settings → OAuth Apps) with callback
`http://localhost:8000/auth/github/callback`, then copy `backend/.env.example` →
`backend/.env` and fill in `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`. The secret stays
**only** in `backend/.env` (git-ignored) — never in a `VITE_*` var or any tracked file.
Scopes are minimal and **public-only** (`read:user public_repo`).

> The server reads `backend/.env` **once at startup**. After editing `.env`, restart
> uvicorn (or rely on `--reload`) or `/health` will still report `oauth_configured:false`.

### Repo analysis (data pipeline — stage 1)

After sign-in the callback calls `analyze_user_repositories(token)` in
[`github_graphql.py`](backend/app/github_graphql.py). One paginated **GraphQL** query
pulls every public repo with its per-language byte sizes (GitHub's own whole-repo measure)
and top-level file entries. Bytes become a clearly-labelled **estimated** line count
(`bytes / 48`, `BYTES_PER_LINE`) — true per-file counting is a deliberate later stage. The
call returns `{ user, totals, repos }` (all **camelCase**, consumed by the frontend
as-is) and prints a per-repo line to the server console. Keep estimates honestly labelled
"est." in any UI.

---

## Conventions (frontend)

- **TypeScript is strict.** `verbatimModuleSyntax` is on → type-only imports **must** be
  `import type { … }`. `noUnusedLocals` / `noUnusedParameters` are on → remove unused
  imports/vars or the build fails.
- **Path alias** `@/* → ./src/*` is defined via `paths` in `tsconfig.app.json` **only**.
  Do **not** add `baseUrl` — TS 6 deprecates it and the build errors (TS5101).
- **Tailwind v4 is CSS-first.** There is no `tailwind.config.js`. Design tokens live in
  `@theme {}` in `src/index.css`; custom effect classes use `@utility name {}` so
  `hover:` / `group-hover:` variants are emitted. Runtime theme swap uses `--accent`
  with `@theme inline`.
- **Motion is reduced-motion-safe.** Scroll reveals use the `useInView` hook + the
  `Reveal` wrapper (which re-hide when scrolled away); background drift uses `useScroll`.
  Every effect no-ops under `prefers-reduced-motion` — preserve that when adding motion.
- **No router.** `App.tsx` switches between the landing and dashboard views from the
  `useGitHubAuth` hook (state + `#/dashboard` hash sync, back-button aware). Clicking
  *Authenticate* navigates to the dashboard's loading state immediately; the OAuth
  `postMessage` then fills in the analysis.
- Match existing patterns. Don't add dependencies, refactor, or "improve" code beyond
  what the task needs.

---

## Git

- **Don't push directly to `main`.** Branch for every change, push the branch, and open a
  Pull Request — even for small fixes. `main` stays green and reviewable.
  ```powershell
  git switch -c feature/short-description   # branch off main
  # …commit your work…
  git push -u origin feature/short-description
  # then open a PR on GitHub and request a review
  ```
  Use short, prefixed branch names (`feature/…`, `fix/…`, `chore/…`). Pull/rebase the
  latest `main` before opening the PR. Get at least one teammate's review before merging;
  never force-push to `main` or a shared branch.
