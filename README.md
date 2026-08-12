# Goblin Companion

Companion de escritorio (Electron + React) para [Auction-house-Profit](../Auction-house-Profit). Vigila los `SavedVariables` de World of Warcraft y sincroniza automáticamente con el backend Django, para que la web ya tenga los datos frescos sin tener que cargar archivos a mano.

Plan técnico completo: [`docs/plan.md`](./docs/plan.md).

## Estado actual (Etapa 0 — scaffold)

Lo que ya funciona:

- Ventana frameless 960×640 con el mismo design system (colores, tipografías, glass) que la web.
- Tray permanente con ícono de estado (verde/amarillo/gris/rojo) generado en runtime.
- Cerrar la ventana `[×]` minimiza a la bandeja en vez de cerrar la app.
- 4 tabs: Dashboard, Activity Log, Controls, Settings (+ tab "P&L — Coming soon" deshabilitado).
- Settings persistente vía `electron-store` (Django URL, token, carpeta de WoW, nº de backups).
- IPC tipado entre proceso principal, preload y renderer (`shared/ipc.ts`, `shared/settings.ts`).

Lo que **todavía no existe** (próximas etapas del plan, ver sección 12 de `docs/plan.md`):

- File watcher real (chokidar) y sync automático/manual contra Django.
- Auth companion en Django (`X-Companion-Token`).
- Local server `127.0.0.1:8765` (`/status`, `/sync`) y el indicador "Opción 3" en la web.
- Write to TSM Groups + backups rotatorios reales.
- Auto-arranque, notificaciones nativas, installer `.exe`.

Todos los controles de esas features están en la UI pero deshabilitados, para que la forma final de la interfaz ya esté fijada.

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
