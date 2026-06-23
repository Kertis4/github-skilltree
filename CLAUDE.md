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
├─ .gitignore           # repo-wide: ignores .env + keys/certs
└─ frontend/            # Vite + React 19 + TypeScript 6 + Tailwind v4
   ├─ .env.example      # safe template — VITE_GITHUB_CLIENT_ID, VITE_API_BASE_URL
   ├─ .gitignore        # also ignores .env*
   └─ src/
      ├─ components/{ui,terminal,effects,landing,game}
      ├─ hooks/  lib/  config/  data/  pages/
      └─ App.tsx → pages/LandingPage.tsx
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
