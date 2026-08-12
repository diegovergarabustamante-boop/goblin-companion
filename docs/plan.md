# Goblin Companion — Plan Técnico v7.1

> **Fecha:** Agosto 2026  
> **Proyecto padre:** Auction-house-Profit  
> **Scope:** Local-only (mismo PC: WoW + Django + Companion)  
> **Estado:** Plan operativo (post-crítica) — Etapa 0 (scaffold) implementada.  
> **v7.1:** Se restauran Opción 3 en toda la web relevante + backups rotatorios en MVP. Se mantiene el recorte de JSONs redundantes / P&L / updater prematuro.

---

## 0. Principio de este plan

**Mantener:** Electron + React + design system + ventana + tray (la experiencia visual).  
**Recortar:** todo lo que no elimina clicks el día 1.  
**Regla:** la companion orquesta; Django procesa. Cero lógica de negocio duplicada en el MVP.

---

## 1. Visión (sin teatro)

Hoy: cerrar WoW → Decoder → buscar archivo → cargar → carrito.  
Con Companion: cerrar WoW → sync automático → web ya tiene datos → cero clicks de carga.

Referencia: TSM Desktop App (background + tray + ventana solo cuando hace falta).  
Diferencia honesta: nosotros también podemos disparar TSM Write (ya existe en Django), con confirmación explícita.

---

## 2. Stack (UI visual se queda)

| Capa | Elección | Por qué |
|---|---|---|
| Shell | Electron + electron-vite | Ventana + tray + notificaciones nativas |
| UI | React + TypeScript + CSS del proyecto | Reutilizar glass / variables / tipografía |
| Watcher | chokidar + `awaitWriteFinish` | Archivos `.lua` incompletos |
| Persistencia settings | electron-store + `safeStorage` | Credenciales en Windows Credential Manager |
| Log local MVP | archivo JSONL o electron-store (últimos N eventos) | **Sin better-sqlite3 en MVP** (nativo = dolor en Windows) |
| HTTP | axios (o fetch) + token de companion | Sin scrapear CSRF del HTML de login |
| Build | electron-builder → `.exe` NSIS | Después de que el sync funcione, no antes |

**Nota:** Electron es un peaje consciente porque quieres la interfaz. El peaje se paga; el scope no se infla para “justificar” Electron.

---

## 3. Arquitectura (MVP)

```
WoW SavedVariables/*.lua
        │
        ▼
┌─────────────────────────────────────────┐
│  Goblin Companion (Electron)            │
│                                         │
│  Main: watcher → validate → sync queue  │
│        → HTTP a Django                  │
│        → tray + notifications           │
│        → localhost:8765 (/status,/sync) │
│                                         │
│  Renderer: Dashboard / Log / Controls / │
│            Settings (misma UI visual)   │
└──────────────────┬──────────────────────┘
                   │ Bearer token (local)
                   ▼
┌─────────────────────────────────────────┐
│  Django (localhost:8000)                │
│  parse + DB (lógica existente)          │
│  + endpoint mínimo de auth companion    │
└─────────────────────────────────────────┘
```

La companion **no** reimplementa `parse_tsm_lua` ni accounting. Solo llama endpoints.

---

## 4. Qué entra en MVP vs qué no

### Por qué v7 recortó de más (y qué se corrige)

Recorté Opción 3 a “solo Decoder” por rigor de ingeniería (un solo sitio de verdad). **Eso fue un overcut de producto:** si la companion es el modo principal, el usuario tiene que *ver* que está viva en Decoder, TSM, Carrito y Home — no descubrirlo solo en una pantalla.

Los **backups rotatorios se mantienen en MVP**. Un solo `.bak` de Django no alcanza si haces varios writes seguidos; la companion guarda N copias independientes en AppData. Eso es safety real, no cosmético.

### MVP (sí)

1. Tray permanente + estados de color  
2. File watcher (TSM.lua + Accounting.lua) con `awaitWriteFinish`  
3. Validación mínima de archivo (no vacío + tamaño estable; brace-count solo como hint)  
4. Sync automático → Django  
5. Sync manual desde tray/ventana  
6. First-run wizard (paths + Django URL + token/credenciales)  
7. Ventana visual: Dashboard, Activity Log, Controls, Settings  
8. Local server `127.0.0.1:8765` → `/status`, `/sync`  
9. **Opción 3 en Decoder, TSM, Carrito e indicador en Home**  
10. Connection monitor + cola de syncs pendientes  
11. TSM Write desde Controls/tray → Django + confirmación  
12. **Backups rotatorios N copias (default 3) + UI de restauración en Controls**

### Explicitamente fuera del MVP

| Feature | Por qué fuera | Cuándo |
|---|---|---|
| Auto-generación de Quantity/Cart JSON | Django ya actualiza la DB; JSON extra es redundante | Solo si aparece un consumidor real |
| P&L Tracker + SQLite de negocio | Duplica accounting de Django | Fase 2, preferible en la web |
| better-sqlite3 | No hace falta para log + backups en disco | Fase 2 si analytics local |
| Auto-updater | Signing/releases | Usuarios externos |
| Repo público día 1 | Companion inútil sin backend privado | Cuando exista producto |
| Detectar `Wow.exe` | Optimización prematura | Si hay falsos syncs |
| Lanzar Django desde companion | Scope de launcher | Post-MVP opcional |

---

## 5. Cambio obligatorio vs v6: Auth limpia (sí tocar Django un poco)

v6 evitaba Django scrapeando login/CSRF. Frágil y absurdo cuando controlas ambos lados.

### En Django (mínimo, ~30–50 líneas)

```
POST /api/companion/auth/     → emite token de larga vida (local-only)
GET  /api/companion/ping/     → health + user (Authorization: Bearer …)
```

O más simple aún para local-only:

```
Header: X-Companion-Token: <token en .env de Django y de la companion>
```

**Decisión tomada (Agosto 2026):** token estático compartido en `.env` de ambos lados para el día 1. Sin login flow, sin cookie jar, sin HTML scraping.

**Implementado (Etapa 2, Agosto 2026):**

- `market/decorators.py::require_companion_token` — compara `X-Companion-Token` contra `settings.COMPANION_TOKEN` con `hmac.compare_digest`. 503 si el servidor no tiene el token configurado, 401 si falta o no coincide.
- `GET /api/companion/ping/` (`market/views/companion_views.py`) — protegido por el decorador anterior. Devuelve `{success, server_time, user}`. No hay endpoint de "auth" separado: con token estático no hace falta emitir nada, `ping` cumple las dos funciones (probar credenciales + health check).
- `electron/main/http-client.ts::pingDjango` — cliente en la companion, timeout 5s.
- Botón "Probar conexión" en el tab Settings de la companion, wireado a `window.goblin.testConnection()`.
- Tests: `market/tests.py::CompanionPingTests` (401 sin token, 401 con token incorrecto, 200 con token correcto, 503 sin `COMPANION_TOKEN` configurado).

Los endpoints de negocio siguen igual (sin `X-Companion-Token`, sin cambios):

| Endpoint | Uso |
|---|---|
| `POST /api/load-tsm-from-path/` | Sync inventario |
| `POST /api/process-lua-file/` | Sync accounting |
| `POST /api/admin/tsm-write/` | Write (con confirmación UI) |
| `GET /api/auction-status/` | Ping opcional |

*(La Etapa 3 decidirá si estos también deben pasar por `require_companion_token` cuando el watcher/sync-manager empiece a llamarlos directamente en vez del navegador.)*

---

## 6. Read-only + write + backups rotatorios (MVP)

**99%:** solo lectura de `.lua` → POST path a Django.  
**1% write:** solo si el usuario confirma “Write to TSM Groups”.

### Quién escribe

| Acción | Quién | Cuándo |
|---|---|---|
| Sync / parse | Nadie toca el `.lua` | Automático |
| Write to TSM Groups | **Django** (endpoint existente) | Confirmación del usuario |
| Backup rotatorio previo | **Companion** (copia a AppData) | Justo antes del write |
| Restore desde UI | **Companion** (copia backup → TSM.lua) | Confirmación + WoW cerrado |

Regla: la companion **nunca** escribe por su cuenta en sync. Solo escribe en restore explícito, o deja el write de grupos a Django tras haber respaldado.

### Backups rotatorios (se mantienen)

```
AppData/Roaming/Goblin-Companion/backups/TradeSkillMaster/
  backup_1_<timestamp>.lua   ← más reciente
  backup_2_<timestamp>.lua
  backup_3_<timestamp>.lua   ← se elimina al rotar si max=3
```

- **Decisión tomada:** default N=3 (settings: 1–10)
- Independientes del `.bak` único de Django  
- Total con default: **3 companion + 1 Django**  
- UI en tab Controls: listar + Restaurar + Abrir carpeta  
- Restore: confirma → backup del estado actual → copia elegida sobre `TradeSkillMaster.lua`

Implementación: rotar por lista ordenada por timestamp en el nombre (o mtime), **no** por `sort()` léxico ingenuo ni rename en cascada que colisione `backup_2` existente.

---

## 7. Protección de archivos incompletos

Mantener lo bueno de v6:

```ts
chokidar.watch(paths, {
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100,
  },
});
```

Validación post-estable:

1. No vacío  
2. Tamaño > umbral mínimo razonable  
3. (Opcional) hint de balance de `{}` — **no bloquear** solo por eso si el string puede contener braces  
4. Cooldown 10s entre syncs del mismo archivo  
5. Si Django caído → encolar; reintentar al reconectar

---

## 8. UI visual (se mantiene, se enfoca)

### Ventana (960×640, frameless, glass del proyecto)

| Tab | MVP | Contenido |
|---|---|---|
| Dashboard | Sí | Toggle auto-sync, last sync, counts, estado Django, CTA sync |
| Activity Log | Sí | Stream de eventos (memoria + JSONL) |
| Controls | Sí | Sync manual, Write TSM (preview + confirm), **backups rotatorios + restore**, abrir web |
| Settings | Sí | URL, token/user, paths WoW, watcher, notificaciones, autostart |
| P&L | No en MVP | **Decisión tomada:** tab visible pero deshabilitado con “Coming soon” |

### Tray

| Color | Significado |
|---|---|
| Verde | Watcher ON + Django OK |
| Amarillo | Django no responde / sync encolado |
| Gris | Auto-sync OFF |
| Rojo | Último sync falló |

Menú: Sync inventario / Sync accounting / Write TSM / Abrir web / Log / Settings / Salir.

Cerrar [×] → minimiza al tray.

### Design system

Heredar variables del proyecto (`--accent`, `--gold`, glass, etc.).  
Eso es el valor de Electron aquí — no lo recortamos.

---

## 9. Opción 3 en la web (completa, no solo Decoder)

Un helper JS compartido (`checkCompanionStatus`) usado en varias pantallas. Misma fuente: `GET http://127.0.0.1:8765/status` (timeout 500ms).

| Sección | Qué muestra Opción 3 |
|---|---|
| **Decoder — Inventario** | Companion activa + last TSM sync + items/chars + Forzar re-sync |
| **Decoder — Accounting** | Mismo patrón con `last_accounting_sync` |
| **TSM — Direct Write** | Companion detectada; write también disponible desde tray/ventana; link/estado |
| **Carrito — stock** | Badge “Companion” si el inventario viene de auto-sync + timestamp |
| **Home** | Indicador compacto: companion ON/OFF + último sync |

Estados:

- **Verde/OK:** sync reciente, datos listos — trabajar sin cargar archivo  
- **No detectada:** CTA descargar/abrir README + Opción 1/2 siguen disponibles  
- **Companion up pero Django down:** warning + último sync conocido

Opción 1 y 2 **no se eliminan**; coexisten. Opción 3 es el camino feliz.

---

## 10. Configuración

Prioridad:

1. UI Settings (`electron-store`)  
2. `.env` de la companion  
3. Defaults

```env
# goblin-companion/.env.example
DJANGO_URL=http://127.0.0.1:8000
COMPANION_TOKEN=change-me
WATCHER_STABILITY_MS=2000
SYNC_COOLDOWN_SECONDS=10
LOCAL_SERVER_PORT=8765
```

Password/token: `safeStorage` si se guarda desde UI.  
`.env` real en `.gitignore`.

---

## 11. Estructura de repo

**Repo separado:** `goblin-companion`  
**Visibilidad inicial:** privado (cambiar a público solo si hay usuarios externos reales).

```
goblin-companion/
├── electron/main/
│   ├── index.ts
│   ├── tray.ts
│   ├── watcher.ts
│   ├── sync-manager.ts
│   ├── connection-monitor.ts
│   ├── http-client.ts
│   ├── local-server.ts
│   ├── activity-log.ts      ← JSONL, no sqlite
│   ├── settings.ts
│   ├── notifications.ts
│   └── startup.ts
├── electron/preload/
├── src/                    ← React UI
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── ActivityLog.tsx
│   │   ├── Controls.tsx
│   │   └── Settings.tsx
│   └── main.css            ← design tokens del proyecto
├── .env.example
├── package.json
├── electron.vite.config.ts
└── electron-builder.yml    ← Etapa final, no día 1
```

Cambios en `Auction-house-Profit`:

1. Auth companion (token) — pequeño, backend  
2. Helper JS compartido + paneles Opción 3 en Decoder, TSM, Carrito, Home  
3. `backup-manager` vive solo en la companion (no requiere Django extra)

---

## 12. Plan de desarrollo realista

Estimación: **~10–14 días de trabajo enfocado**, no “12 días con updater + P&L + JSONs”.

| Etapa | Días | Entregable | Estado |
|---|---|---|---|
| 0. Scaffold + UI shell | 1–2 | Ventana glass + tabs + tray placeholder | **Hecho** |
| 1. Settings + wizard | 1–2 | Paths + token + test conexión | **Hecho** — Settings + first-run wizard (Etapa 7) |
| 2. Auth Django token | 0.5–1 | Endpoint + client companion | **Hecho** — `GET /api/companion/ping/` protegido por `X-Companion-Token`, cliente HTTP en la companion |
| 3. Watcher + sync | 2–3 | Auto/manual sync real a DB | **Hecho (3a+3b)** — watcher + `sync-inventory` / `sync-accounting` |
| 4. Connection + queue | 1 | Amarillo/rojo + reintentos | **Hecho** — connection-monitor + cola con flush al reconectar |
| 5. Local server + Opción 3 web | 1–2 | Decoder + TSM + Carrito + Home | **Hecho** — `:8765/status|/sync` + paneles en Decoder/TSM/Cart + chip en navbar (Home) |
| 6. Write TSM + backups rotatorios | 1–2 | Preview, confirm, N backups, restore UI | **Hecho** — backup-manager + `/backup` + Controls Write + endpoints companion `tsm-write` |
| 7. Polish UI + logs + notifs | 1–2 | Se siente producto | **Hecho** — notifs nativas, autostart, first-run wizard, Activity Log polish |
| 8. Installer `.exe` | 1 | Cuando lo anterior esté estable | **Hecho** — electron-builder NSIS (`npm run dist` → `release/`) |

**Definition of Done del MVP:**  
Cierras WoW → web fresca en Decoder/Carrito → Opción 3 visible donde corresponde → Write con backup rotatorio → tray verde. UI al nivel del resto del producto.

---

## 13. Fase 2 (después de usar el MVP 1–2 semanas)

1. P&L — preferible en Django/web  
2. Auto-updater  
3. Detectar `Wow.exe`  
4. Launcher de Django  
5. Repo público + README para terceros  
6. JSONs export solo si alguien los pide de verdad

*(Backups rotatorios ya no están aquí — van en MVP.)*

---

## 14. Decisiones cerradas

| Tema | Decisión |
|---|---|
| Nombre | Goblin Companion |
| UI visual Electron | **Sí** |
| Scope | Local-only |
| Lógica de parseo | Solo Django |
| Opción 3 en web | **Decoder + TSM + Carrito + Home** |
| Backups rotatorios N + restore | **Sí, MVP** |
| JSONs auto | No en MVP |
| SQLite de negocio | No en MVP |
| Auth | **Token estático compartido en `.env`** (decidido) |
| Repo | Separado, privado al inicio |
| P&L | **Tab visible, deshabilitado "Coming soon"** (decidido) |
| Backups default | **3** (decidido) |

---

## 15. Preguntas abiertas — resueltas (Agosto 2026)

1. ~~Token estático en `.env` vs login user/pass que emite token~~ → **Token estático en `.env`**.
2. ~~¿Tab P&L "Coming soon" o ni aparece hasta Fase 2?~~ → **"Coming soon" (visible, deshabilitado)**.
3. ~~¿Default de backups: 3 está bien, o quieres 5?~~ → **3**.

---

*v7.1 — UI visual + Opción 3 completa + backups rotatorios en MVP. Recorte solo de grasa (JSON/P&L/updater), no de producto.*
