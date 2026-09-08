# Goblin Companion — AI / maintainer playbook

Use this file as the source of truth for **any AI agent** working in this repo: how to develop, commit, bump versions, build the Windows installer, and publish a GitHub Release.

Repo: `https://github.com/diegovergarabustamante-boop/goblin-companion`  
Default branch: `main`  
Target OS: Windows 10/11 (PowerShell)

---

## 1. What this app is

Electron + React desktop companion for Auction-house-Profit. It watches WoW `SavedVariables`, syncs inventory/accounting to Django, writes TSM groups, and shows a local P&L dashboard (last 100 sales).

Do not commit `release/`, `out/`, or `node_modules/` (they are gitignored). The installer is a **build artifact**, not source.

---

## 2. Standing rules for AI agents

1. **Do not commit** unless the user explicitly asks (`commit`, `commitea`, etc.).
2. **Do not push** unless the user asks to push **or** to publish a release.
3. **Do not force-push**, amend published commits, skip hooks, or change git config.
4. **Do not run `git add .`**. Stage only the files that belong to the change.
5. Match existing commit style (English, conventional, optional version suffix on release commits):
   - `feat(pnl): add Gold Lost card for last 100 losing sales (v0.3.4)`
   - `feat(pnl): pin newly claimed sales at top with Latest first toggle`
6. On this Windows machine, shell commands usually need full permissions (sandbox cannot isolate the filesystem).
7. After UI changes, verify in the running Electron app when possible. There is no web browser for this app.

---

## 3. Local development

```powershell
npm install
npm run icon
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Electron + Vite HMR |
| `npm run icon` | Regenerates `build/icon.png` and `build/icon.ico` |
| `npm run typecheck` | `tsc` for main/preload and renderer |
| `npm run build` | Production compile into `out/` |
| `npm run dist` | Full Windows NSIS installer (see §5) |
| `npm run dist:dir` | Unpacked folder only (`release/win-unpacked/`) |

Typecheck both projects if you changed TS:

```powershell
npm run typecheck
```

---

## 4. Version numbers (must stay in sync)

Canonical version is `package.json` → `"version"`.

Also update the local HTTP status payload:

- `electron/main/local-server.ts` → `version: 'X.Y.Z'`

`package-lock.json` top-level version is **stale** (`0.1.0`) and is **not** used for releases. Do not rely on it.

Versioning in this repo is `0.Y.Z`. Bump **patch** (`0.3.5` → `0.3.6`) for features and fixes, matching recent history. Bump minor only if the user asks.

Current shipped GitHub release at the time this guide was written: **v0.3.5**. Always read `package.json` and `git tag --sort=-v:refname` before bumping — do not copy an old version from this paragraph.

---

## 5. Build the installer

```powershell
npm run dist
```

Pipeline: `icon` → `typecheck` → `electron-vite build` → `electron-builder --win`.

Expected artifact:

```
release/GoblinCompanion-Setup-X.Y.Z.exe
```

`X.Y.Z` comes from `package.json`. If typecheck fails, **stop** and fix it. Do not publish a broken build.

Build takes a few minutes. Signing via `signtool.exe` is normal on this machine.

---

## 6. Publish a GitHub release (full checklist)

Only do this when the user asks to **rebuild and publish** / **release**.

The in-app updater (`electron/main/updater.ts`) reads **GitHub Releases**, not git tags alone. A tag without a Release object + `.exe` asset is not enough.

### 6.1 Bump version

1. Set `"version"` in `package.json`.
2. Set `version:` in `electron/main/local-server.ts` to the same string.

### 6.2 Commit the source (not the installer)

Stage the feature files **plus** the two version files. Message pattern:

```text
feat(pnl): short description (vX.Y.Z)
```

If the feature was already committed and you are only bumping for publish:

```text
release: vX.Y.Z
```

### 6.3 Build

```powershell
npm run dist
```

Confirm `release/GoblinCompanion-Setup-X.Y.Z.exe` exists.

### 6.4 Tag and push `main`

```powershell
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin main --tags
```

Pushing `main` is required so GitHub has the commit the tag points at. Ask the user to approve the protected push if the environment blocks it.

### 6.5 Create the GitHub Release with the `.exe`

**Preferred:** GitHub CLI.

If `gh` is on PATH:

```powershell
gh release create vX.Y.Z "release/GoblinCompanion-Setup-X.Y.Z.exe" --title "Goblin Companion vX.Y.Z" --notes @"
## Goblin Companion vX.Y.Z

### Features
- ...

### Fixes
- ...

### Notes
- ...
"@
```

If `gh` is **not** on PATH, the known local binary used on this PC is:

```powershell
& "C:\Users\diego\.gemini\antigravity\brain\491b1bdc-74ee-4368-b3c1-ace7047fa44d\scratch\bin\gh.exe" release create vX.Y.Z "release/GoblinCompanion-Setup-X.Y.Z.exe" --title "Goblin Companion vX.Y.Z" --notes "..."
```

Search for `gh.exe` if that path moved. Uploading the installer can take ~1 minute.

**Fallback script:** `node scripts/publish-release.mjs`  
Warning: its `BODY` notes are **hardcoded and often stale**. Update them before using, or prefer `gh` with fresh notes.

**Manual fallback:**  
https://github.com/diegovergarabustamante-boop/goblin-companion/releases/new  
Tag `vX.Y.Z`, title `Goblin Companion vX.Y.Z`, attach the `.exe`, publish.

### 6.6 Return the URL

Give the user:

```
https://github.com/diegovergarabustamante-boop/goblin-companion/releases/tag/vX.Y.Z
```

---

## 7. Auto-updater behavior (do not break this)

1. App calls `https://api.github.com/repos/diegovergarabustamante-boop/goblin-companion/releases/latest`.
2. If that 404s, it falls back to the tags API.
3. SemVer compare vs the version baked into the running app (`package.json` at build time).
4. UI shows **Update Available (vX.Y.Z)** and can download `GoblinCompanion-Setup-X.Y.Z.exe`.

The asset **file name must stay** `GoblinCompanion-Setup-${version}.exe` (`electron-builder.yml`).

---

## 8. Typical “commit only” vs “release” requests

| User says | Do this |
| --- | --- |
| `commit` | Stage relevant files, commit, **do not** bump version, **do not** push |
| `push` | `git push origin main` (no tag unless asked) |
| `rebuildear y publicar` / `release` | Full §6: bump, commit, `npm run dist`, tag, push `--tags`, `gh release create` |

Unreleased commits can sit on `main` locally. Publishing is a **separate** step from committing features.

---

## 9. Quick copy-paste (replace X.Y.Z)

```powershell
# After package.json + local-server.ts are already bumped and committed:
npm run dist
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin main --tags
gh release create vX.Y.Z "release/GoblinCompanion-Setup-X.Y.Z.exe" --title "Goblin Companion vX.Y.Z" --notes "Release vX.Y.Z"
```

If `gh` is missing, use the `gh.exe` path in §6.5.
