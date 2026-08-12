import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { appendActivity } from './activity-log'
import { createRotatingBackup, listBackups } from './backup-manager'
import { resolveLuaPath } from './paths'
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
  return {
    ok: true,
    companion: true,
    version: '0.1.0',
    tray_status: snap.trayStatus,
    auto_sync_enabled: snap.autoSyncEnabled,
    django_reachable: snap.djangoReachable,
    watcher_running: isWatcherRunning(),
    syncing: snap.syncing,
    queue_length: snap.queueLength,
    last_sync_at: snap.lastSyncAt,
    last_inventory_sync: snap.lastInventorySyncAt,
    last_accounting_sync: snap.lastAccountingSyncAt,
    django_url: settings.djangoUrl,
    saved_variables_configured: Boolean(settings.wowSavedVariablesPath),
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

    if (method === 'POST' && url.pathname === '/backup') {
      try {
        const backup = createRotatingBackup()
        sendJson(res, 200, {
          ok: true,
          backup: {
            id: backup.id,
            fileName: backup.fileName,
            createdAt: backup.createdAt,
            sizeBytes: backup.sizeBytes
          }
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
        endpoints: ['/status', '/sync', '/backup']
      })
      return
    }

    sendJson(res, 404, { ok: false, error: 'not_found' })
  })

  server.on('error', (error) => {
    appendActivity('error', 'Local server error', error instanceof Error ? error.message : String(error))
  })

  server.listen(port, '127.0.0.1', () => {
    appendActivity('success', `Local server en 127.0.0.1:${port}`, '/status · /sync · /backup')
  })
}

export function stopLocalServer(): void {
  if (server) {
    server.close()
    server = null
  }
}
