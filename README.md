# Goblin Companion

Companion de escritorio (Electron + React) para [Auction-house-Profit](../Auction-house-Profit). Vigila los `SavedVariables` de World of Warcraft y sincroniza automáticamente con el backend Django, para que la web ya tenga los datos frescos sin tener que cargar archivos a mano.

Plan técnico completo: [`docs/plan.md`](./docs/plan.md).

## Estado actual (Etapa 7 — polish / producto)

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
- **Write TSM + backups rotatorios** (Etapa 6): `backup-manager` en AppData, Controls preview/confirm, tray → Controls, `POST /backup` para que el Cart web pida backup antes de escribir; endpoints Django `/api/companion/tsm-write/`.
- **Polish** (Etapa 7): notificaciones nativas, iniciar con Windows, first-run wizard, Activity Log con filtros/vaciar.

Lo que **todavía no existe** (próximas etapas del plan, ver sección 12 de `docs/plan.md`):

- Installer `.exe` (Etapa 8).

## Requisitos

- Node.js 22+
- Windows (target principal; el resto de plataformas no están probadas)

## Desarrollo

```bash
npm install
npm run dev        # abre la app con hot-reload
npm run typecheck  # chequeo de tipos (main/preload + renderer)
npm run build      # build de producción a out/
npm run preview    # ejecuta el build de producción
```

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
├── public/fonts/     # mismas fuentes (woff2) que la web
├── docs/plan.md      # plan técnico completo
└── electron.vite.config.ts
```

La companion **nunca** reimplementa el parseo de `.lua` ni la contabilidad: eso vive en Django. Solo orquesta (mirar archivos, llamar endpoints, mostrar estado).
