import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, normalize, resolve, sep } from 'node:path'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { appendActivity } from './activity-log'
import { createRotatingBackup, listBackups } from './backup-manager'
import { normalizeSavedVariablesPath, resolveLuaPath } from './paths'
import { getSettings } from './settings'
import { getSyncSnapshot, syncFile } from './sync-manager'
import { isWatcherRunning } from './watcher'

let server: Server | null = null

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(payload)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function statusPayload(): Record<string, unknown> {
  const snap = getSyncSnapshot()
  const settings = getSettings()
  const folder = settings.wowSavedVariablesPath?.trim() || ''
  return {
    ok: true,
    companion: true,
    version: '0.3.3',
    tray_status: snap.trayStatus,
    auto_sync_enabled: snap.autoSyncEnabled,
    django_reachable: snap.djangoReachable,
    watcher_running: isWatcherRunning(),
    syncing: snap.syncing,
    sync_step: snap.syncStep,
    queue_length: snap.queueLength,
    last_sync_at: snap.lastSyncAt,
    last_inventory_sync: snap.lastInventorySyncAt,
    last_accounting_sync: snap.lastAccountingSyncAt,
    django_url: settings.djangoUrl,
    saved_variables_configured: Boolean(folder),
    saved_variables_path: folder || null,
    backup_count: listBackups().length
  }
}

async function handleSync(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let kind: 'inventory' | 'accounting' | 'both' = 'both'
  try {
    const raw = await readBody(req)
    if (raw.trim()) {
      const parsed = JSON.parse(raw) as { kind?: string }
      if (parsed.kind === 'inventory' || parsed.kind === 'accounting' || parsed.kind === 'both') {
        kind = parsed.kind
      }
    }
  } catch {
    // body vacío o inválido → both
  }

  const kinds: Array<'inventory' | 'accounting'> =
    kind === 'both' ? ['inventory', 'accounting'] : [kind]

  const results: Record<string, unknown> = {}
  for (const k of kinds) {
    const filePath = resolveLuaPath(k)
    if (!filePath) {
      results[k] = { ok: false, error: 'SavedVariables path no configurado' }
      continue
    }
    const result = await syncFile(k, filePath, 'manual')
    results[k] = {
      ok: result.ok,
      error: result.error,
      detail: result.detail,
      queued: result.queued
    }
  }

  sendJson(res, 200, { ok: true, results, status: statusPayload() })
}

/**
 * Lee un .lua de SavedVariables en el PC local (donde corre la companion).
 * El browser remoto (vía tunnel) usa esto en vez de pedir a Django que abra
 * rutas del cliente — Django solo ve el filesystem del servidor.
 *
 * Body: { file_path?: string, kind?: 'inventory' | 'apphelper' | 'accounting' }
 */
async function handleRead(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let filePath = ''
  let kind = ''
  try {
    const raw = await readBody(req)
    if (raw.trim()) {
      const parsed = JSON.parse(raw) as { file_path?: string; path?: string; kind?: string }
      filePath = (parsed.file_path || parsed.path || '').trim()
      kind = (parsed.kind || '').trim().toLowerCase()
    }
  } catch {
    // body vacío
  }

  const folder = normalizeSavedVariablesPath(getSettings().wowSavedVariablesPath)
  if (!folder) {
    sendJson(res, 400, {
      success: false,
      ok: false,
      error: 'SavedVariables path no configurado en Companion Settings'
    })
    return
  }

  if (!filePath) {
    if (kind === 'apphelper') {
      filePath = join(folder, 'TradeSkillMaster_AppHelper.lua')
    } else {
      filePath = resolveLuaPath(kind === 'accounting' ? 'accounting' : 'inventory') || ''
    }
  }

  if (!filePath) {
    sendJson(res, 400, { success: false, ok: false, error: 'No file path provided' })
    return
  }

  const resolved = resolve(normalize(filePath))
  const folderResolved = resolve(normalize(folder))
  const allowedPrefix = folderResolved.endsWith(sep) ? folderResolved : folderResolved + sep
  if (resolved !== folderResolved && !resolved.startsWith(allowedPrefix)) {
    sendJson(res, 403, {
      success: false,
      ok: false,
      error: 'Solo se pueden leer archivos dentro de la carpeta SavedVariables configurada'
    })
    return
  }

  if (!resolved.toLowerCase().endsWith('.lua')) {
    sendJson(res, 400, { success: false, ok: false, error: 'Only .lua files are allowed' })
    return
  }

  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    sendJson(res, 404, {
      success: false,
      ok: false,
      error: `File not found at path: ${resolved}`
    })
    return
  }

  try {
    const content = readFileSync(resolved, 'utf-8')
    const fileSize = Buffer.byteLength(content, 'utf-8')
    if (fileSize > 100 * 1024 * 1024) {
      sendJson(res, 400, { success: false, ok: false, error: 'File too large (max 100MB)' })
      return
    }
    const sizeMb = fileSize / (1024 * 1024)
    const sizeFormatted =
      sizeMb >= 1 ? `${sizeMb.toFixed(2)} MB` : `${(fileSize / 1024).toFixed(1)} KB`
    const filename = basename(resolved)

    sendJson(res, 200, {
      success: true,
      ok: true,
      content,
      filename,
      file_path: resolved,
      size: fileSize,
      size_formatted: sizeFormatted,
      // Sibling hint for AppHelper when reading main TSM
      sibling_apphelper:
        filename.toLowerCase() === 'tradeskillmaster.lua'
          ? join(dirname(resolved), 'TradeSkillMaster_AppHelper.lua')
          : null
    })
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export function startLocalServer(port = getSettings().localServerPort): void {
  stopLocalServer()

  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const method = req.method ?? 'GET'

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      })
      res.end()
      return
    }

    if (method === 'GET' && url.pathname === '/status') {
      sendJson(res, 200, statusPayload())
      return
    }

    if (method === 'POST' && url.pathname === '/sync') {
      void handleSync(req, res)
      return
    }

    if (method === 'POST' && url.pathname === '/read') {
      void handleRead(req, res)
      return
    }

    if (method === 'POST' && url.pathname === '/backup') {
      try {
        const backups = createRotatingBackup()
        const primary = backups[0]
        sendJson(res, 200, {
          ok: true,
          backups,
          backup: primary
            ? {
                id: primary.id,
                fileName: primary.fileName,
                createdAt: primary.createdAt,
                sizeBytes: primary.sizeBytes
              }
            : null
        })
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
      return
    }

    if (method === 'GET' && url.pathname === '/') {
      sendJson(res, 200, {
        ok: true,
        service: 'goblin-companion',
        endpoints: ['/status', '/sync', '/read', '/backup']
      })
      return
    }

    sendJson(res, 404, { ok: false, error: 'not_found' })
  })

  server.on('error', (error) => {
    appendActivity('error', 'Local server error', error instanceof Error ? error.message : String(error))
  })

  server.listen(port, '127.0.0.1', () => {
    appendActivity('success', `Local server running on 127.0.0.1:${port}`, '/status · /sync · /read · /backup')
  })
}

export function stopLocalServer(): void {
  if (server) {
    server.close()
    server = null
  }
}
