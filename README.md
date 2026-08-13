# 🪙 Goblin Companion

[![License: UNLICENSED](https://img.shields.io/badge/License-UNLICENSED-amber.svg)](https://github.com/diegovergarabustamante-boop/goblin-companion)
[![Electron](https://img.shields.io/badge/Electron-43.4-4785D4.svg?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

**Goblin Companion** is an automated, lightweight desktop assistant built with **Electron, React, and TypeScript** for [Auction-house-Profit](https://github.com/diegovergarabustamante-boop/Auction-house-Profit). 

It continuously monitors World of Warcraft `SavedVariables` files (`TradeSkillMaster.lua` & `TradeSkillMaster_AppHelper.lua`) and seamlessly synchronizes inventory, purchases, sales, and auction stats directly with the web application in real time—eliminating all manual file uploads.

---

## 🌟 Key Features & Capabilities

* ⚡ **Zero Manual Uploads**: Automatically detects changes to your WoW `SavedVariables` whenever you log out or type `/reload` in-game.
* 📦 **Instant TSM Group Writing**: Safely writes TSM group assignments back into your WoW files without breaking formatting or losing data.
* 🛡️ **Automated Rotating Backups**: Creates timestamped safety backups before every file write or sync operation.
* 🌐 **Built-in Local API Server**: Runs a lightweight local HTTP server (`http://127.0.0.1:8765/status` and `/sync`) allowing web browser tabs to check companion status and trigger syncs seamlessly.
* 📈 **Real-Time P&L Dashboard**: Displays your last 100 sold items with accurate buy prices, sell prices, net profit/loss, exact buy & sell dates in your local PC timezone, and auction post counts before sale.
* 🗡️ **Wowhead Item Integration**: Displays official 3D WoW item icon thumbnails, exact WoW item quality colors (Lime Green, Blue, Epic Purple, Legendary Orange), and interactive Wowhead hover tooltips.
* 🔔 **System Tray Integration**: Runs silently in the system tray with custom status indicators (Green, Yellow, Gray, Red) and starts automatically with Windows.

---

## 🗺️ Integration Across Auction House Profit

Goblin Companion connects directly with key modules in the Auction House Profit web application:

1. **Arbitrage**: Instantly filters arbitrage opportunities against items you already own across your connected WoW characters and bank alt inventories.
2. **Cart**: Export shopping lists or auto-write TSM group strings directly into your WoW configuration files with zero copy-pasting.
3. **TSM Analyzer & Restock**: Evaluates total inventory valuation, unit margins, and automatically generates restock targets.
4. **P&L (Profit & Loss)**: Tracks item flips and resale history with precise buy dates, sell dates, and number of posts before each sale.

---

## 💻 Tech Stack

* **Core**: Electron 43, Node.js 22
* **Frontend**: React 19, TypeScript 5, Vite 7
* **Styling**: Vanilla CSS (Custom WoW RPG Design System with Glassmorphism & Gold Tokens)
* **Storage**: `electron-store` (Persistent user settings & local cache)
* **Watcher**: `chokidar` (File system watcher for WoW SavedVariables)
* **Packaging**: `electron-builder` (NSIS Windows Installer)

---

## 🚀 Development & Build

### Prerequisites

* Node.js 22+
* Windows 10/11 (Primary target OS)

### Installation & Setup

```bash
# Clone the repository
git clone https://github.com/diegovergarabustamante-boop/goblin-companion.git
cd goblin-companion

# Install dependencies
npm install

# Generate application icon
npm run icon

# Start development mode with hot-reload
npm run dev
```

### Available Scripts

| Script | Description |
| :--- | :--- |
| `npm run dev` | Launches the app in development mode with Vite HMR |
| `npm run icon` | Generates application icon (`build/icon.png` & `build/icon.ico`) |
| `npm run typecheck` | Runs TypeScript type checking for main, preload, and renderer processes |
| `npm run build` | Compiles production assets into `out/` |
| `npm run dist` | Builds production bundle and generates NSIS Windows Installer (`release/GoblinCompanion-Setup-*.exe`) |
| `npm run dist:dir` | Packages unpacked executable folder (`release/win-unpacked/`) |

---

## 📁 Repository Structure

```
goblin-companion/
├── electron/
│   ├── main/          # Main process: window management, IPC handlers, watcher, tray
│   └── preload/       # ContextBridge IPC bridge (window.goblin)
├── shared/            # Shared TypeScript types between main, preload, and renderer
├── src/               # React Renderer UI
│   ├── components/    # PnLSalesTable, CoinBadge, Navbar, Status Indicators
│   └── pages/         # Dashboard, Activity Log, Backups, Settings, PnL
├── public/            # Static assets & WoW RPG image badges
├── scripts/           # generate-icon.mjs
├── build/             # Application icons (icon.png & icon.ico)
├── release/           # Distribution output (generated by npm run dist)
└── electron-builder.yml
```

---

## 📄 License

UNLICENSED. Copyright © Goblin Companion. All rights reserved.
