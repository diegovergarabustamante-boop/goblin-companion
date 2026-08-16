# 🚀 Release & Deployment Guide - Goblin Companion

This document provides step-by-step instructions for AI agents and developers to build, package, tag, and publish official GitHub releases for **Goblin Companion**.

---

## 📋 Overview of Release Workflow

Publishing a new version involves five key steps:

1. **Version Bump**: Increment `version` in [`package.json`](file:///d:/Repos/goblin-companion/package.json).
2. **Build Distribution**: Run `npm run dist` to create the NSIS Windows installer (`.exe`).
3. **Git Commit & Tag**: Commit changes and tag the git commit with `vX.Y.Z`.
4. **Git Push**: Push the `main` branch and tags to GitHub (`git push origin main --tags`).
5. **GitHub Release**: Publish a formal release on GitHub with the installer `.exe` attached via `gh` CLI.

---

## 🛠️ Step-by-Step Execution Guide

### 1. Bump the Package Version
Update the `"version"` field in [`package.json`](file:///d:/Repos/goblin-companion/package.json):
```json
{
  "name": "goblin-companion",
  "version": "0.2.1"
}
```

### 2. Run Typechecks & Build Binary
Execute the complete packaging build command:
```bash
npm run dist
```
* **Script Pipeline**: `npm run icon` → `npm run typecheck` → `npm run build` → `electron-builder --win`.
* **Output Artifact**: Generated in `release/GoblinCompanion-Setup-X.Y.Z.exe`.

### 3. Stage, Commit, and Tag
```bash
git add .
git commit -m "feat: release description (vX.Y.Z)"
git tag -a vX.Y.Z -m "Release vX.Y.Z"
```

### 4. Push to Remote GitHub Repository
```bash
git push origin main --tags
```

### 5. Create & Publish Official GitHub Release

> [!IMPORTANT]
> Simply pushing git tags is **not enough** for the in-app auto-updater (`updater.ts`) to serve binary downloads. You MUST publish a formal GitHub Release object with the `.exe` attached.

#### Using GitHub CLI (`gh`)
If `gh` CLI is installed:
```bash
gh release create vX.Y.Z "release/GoblinCompanion-Setup-X.Y.Z.exe" --title "Goblin Companion vX.Y.Z" --notes "Release notes summary..."
```

If `gh` CLI is in the scratch folder (e.g. downloaded during agent runtime):
```powershell
& "C:\Users\diego\.gemini\antigravity\brain\<conversation-id>\scratch\bin\gh.exe" release create vX.Y.Z "release/GoblinCompanion-Setup-X.Y.Z.exe" --title "Goblin Companion vX.Y.Z" --notes "Release notes summary..."
```

#### Manual Browser Upload (Fallback)
1. Navigate to: `https://github.com/diegovergarabustamante-boop/goblin-companion/releases/new`
2. Select tag `vX.Y.Z`.
3. Set title to `Goblin Companion vX.Y.Z`.
4. Attach `release/GoblinCompanion-Setup-X.Y.Z.exe`.
5. Click **Publish release**.

---

## 🔍 How In-App Auto-Updates Work (`updater.ts`)

1. The client queries `https://api.github.com/repos/diegovergarabustamante-boop/goblin-companion/releases/latest`.
2. If `/releases/latest` returns `404` (e.g. no formal release object exists yet), it falls back to querying `https://api.github.com/repos/diegovergarabustamante-boop/goblin-companion/tags`.
3. Compares `currentVersion` vs `latestVersion` using SemVer matching (`isNewerVersion`).
4. If a newer version exists, the React UI (`App.tsx`) renders the green **Update Available (vX.Y.Z)** badge that links directly to the `.exe` download URL.

---

## ⚡ Quick One-Liner Script for AI Agents

When executing a full release for version `0.2.2`:

```powershell
# 1. Typecheck & Build
npm run dist

# 2. Git Commit & Tag
git add .
git commit -m "release: v0.2.2"
git tag -a v0.2.2 -m "Release v0.2.2"
git push origin main --tags

# 3. GitHub Release Creation via gh.exe
& "$HOME\.gemini\antigravity\brain\491b1bdc-74ee-4368-b3c1-ace7047fa44d\scratch\bin\gh.exe" release create v0.2.2 "release/GoblinCompanion-Setup-0.2.2.exe" --title "Goblin Companion v0.2.2" --notes "Release v0.2.2"
```
