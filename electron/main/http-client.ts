import type { CompanionSettings, DjangoPingResult } from '../../shared/settings'

/**
 * Cliente HTTP mínimo hacia Django (Etapa 2–3 del plan).
 * Usa el `fetch` global de Node/Electron — sin axios todavía.
 */
const PING_TIMEOUT_MS = 5000
const SYNC_TIMEOUT_MS = 60_000

interface PingResponseBody {
  success?: boolean
  server_time?: string
  user?: string | null
  error?: string
}

interface ReadSavedVariableBody {
  success?: boolean
  filename?: string
  size?: number
  size_formatted?: string
  error?: string
}

export interface ReadSavedVariableResult {
  ok: boolean
  filename?: string
  sizeFormatted?: string
  error?: string
}

function companionHeaders(token: string): Record<string, string> {
  return { 'X-Companion-Token': token }
}

export async function pingDjango(
  settings: Pick<CompanionSettings, 'djangoUrl' | 'companionToken'>
): Promise<DjangoPingResult> {
  let url: string
  try {
    url = new URL('/api/companion/ping/', settings.djangoUrl).toString()
  } catch {
    return { ok: false, error: `Django URL inválida: "${settings.djangoUrl}"` }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: companionHeaders(settings.companionToken),
      signal: controller.signal
    })

    const body = (await response.json().catch(() => null)) as PingResponseBody | null

    if (!response.ok) {
      return { ok: false, error: body?.error ?? `HTTP ${response.status}` }
    }

    return { ok: true, serverTime: body?.server_time, user: body?.user ?? null }
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, error: `Sin respuesta después de ${PING_TIMEOUT_MS}ms` }
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Etapa 3a: lee un `.lua` vía Django (token companion). Todavía no persiste
 * a la DB — eso es Etapa 3b. Sirve para validar el pipeline watcher → HTTP.
 */
export async function readSavedVariable(
  settings: Pick<CompanionSettings, 'djangoUrl' | 'companionToken'>,
  filePath: string
): Promise<ReadSavedVariableResult> {
  let url: string
  try {
    url = new URL('/api/companion/read-saved-variable/', settings.djangoUrl).toString()
  } catch {
    return { ok: false, error: `Django URL inválida: "${settings.djangoUrl}"` }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...companionHeaders(settings.companionToken),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file_path: filePath }),
      signal: controller.signal
    })

    const body = (await response.json().catch(() => null)) as ReadSavedVariableBody | null

    if (!response.ok || !body?.success) {
      return { ok: false, error: body?.error ?? `HTTP ${response.status}` }
    }

    return {
      ok: true,
      filename: body.filename,
      sizeFormatted: body.size_formatted
    }
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, error: `Sin respuesta después de ${SYNC_TIMEOUT_MS}ms` }
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timeout)
  }
}
