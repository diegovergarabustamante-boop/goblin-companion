# Goblin Companion

Companion de escritorio (Electron + React) para [Auction-house-Profit](../Auction-house-Profit). Vigila los `SavedVariables` de World of Warcraft y sincroniza automáticamente con el backend Django, para que la web ya tenga los datos frescos sin tener que cargar archivos a mano.

Plan técnico completo: [`docs/plan.md`](./docs/plan.md).

## Estado actual (Etapa 8 — installer)

MVP completo: Stages 0–8.

Lo que ya funciona:

- Ventana frameless 960×640 con el mismo design system (colores, tipografías, glass) que la web.
- Tray permanente con ícono de estado (verde/amarillo/gris/rojo) generado en runtime.
- Cerrar la ventana `[×]` minimiza a la bandeja en vez de cerrar la app.
- 4 tabs: Dashboard, Activity Log, Controls, Settings (+ tab "P&L — Coming soon" deshabilitado).
- Settings persistente vía `electron-store` (Django URL, token, carpeta de WoW, nº de backups).
- **Auth companion contra Django** (Etapa 2).
- **Watcher + sync a DB** (Etapa 3): inventario → carrito; accounting → ItemSellStats.
- **Connection monitor + cola** (Etapa 4): reintenta syncs pendientes cuando Django vuelve.
- **Local server + Opción 3** (Etapa 5): `127.0.0.1:8765/status` y `/sync`; paneles en Decoder/TSM/Cart y chip en navbar.
- **Write TSM + backups rotatorios** (Etapa 6).
- **Polish** (Etapa 7): notificaciones, autostart, first-run wizard, Activity Log.
- **Installer Windows** (Etapa 8): `npm run dist` genera `release/GoblinCompanion-Setup-*.exe` (NSIS).

Fase 2 (después de usar el MVP): P&L web, auto-updater, detectar Wow.exe, etc. — ver `docs/plan.md` §13.

## Requisitos

- Node.js 22+
- Windows (target principal; el resto de plataformas no están probadas)

## Desarrollo

```bash
npm install
npm run icon       # genera build/icon.png
npm run dev        # abre la app con hot-reload
npm run typecheck  # chequeo de tipos (main/preload + renderer)
npm run build      # build de producción a out/
npm run preview    # ejecuta el build de producción
npm run dist       # typecheck + build + installer NSIS en release/
npm run dist:dir   # empaqueta sin installer (carpeta win-unpacked)
```

El instalador queda en `release/GoblinCompanion-Setup-<version>.exe`. No está firmado con certificado de código (Windows puede mostrar SmartScreen la primera vez).

Copia `.env.example` a `.env` para fijar los valores por defecto (Django URL, token, etc.). Una vez guardes algo desde la pestaña **Settings**, `electron-store` (en `%APPDATA%/goblin-companion-settings`) manda sobre el `.env`.

## Estructura

```
goblin-companion/
├── electron/
│   ├── main/       # proceso principal: ventana, tray, IPC, settings
│   └── preload/     # puente contextBridge (window.goblin)
├── shared/          # tipos compartidos entre main/preload/renderer
├── src/              # renderer (React)
│   ├── components/
│   └── pages/
├── build/           # icon.png (generado por npm run icon)
├── scripts/         # generate-icon.mjs
├── release/         # salida de npm run dist (gitignore)
├── docs/plan.md
└── electron-builder.yml
```

La companion **nunca** reimplementa el parseo de `.lua` ni la contabilidad: eso vive en Django. Solo orquesta (mirar archivos, llamar endpoints, mostrar estado).
