import type { CompanionSettings, DjangoPingResult } from '../../shared/settings'

/**
 * Cliente HTTP mínimo hacia Django (Etapa 2 del plan: auth companion).
 * Usa el `fetch` global de Node/Electron — sin axios todavía, no hace
 * falta hasta que el sync-manager (Etapa 3) tenga más lógica de reintentos.
 */
const PING_TIMEOUT_MS = 5000

interface PingResponseBody {
  success?: boolean
  server_time?: string
  user?: string | null
  error?: string
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
      headers: { 'X-Companion-Token': settings.companionToken },
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
