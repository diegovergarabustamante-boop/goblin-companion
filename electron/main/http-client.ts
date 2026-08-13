import type { CompanionSettings, DjangoPingResult } from '../../shared/settings'

/**
 * Cliente HTTP mínimo hacia Django (Etapa 2–3 del plan).
 * Usa el `fetch` global de Node/Electron — sin axios todavía.
 */
const PING_TIMEOUT_MS = 5000
const SYNC_TIMEOUT_MS = 120_000

interface PingResponseBody {
  success?: boolean
  server_time?: string
  user?: string | null
  error?: string
}

interface SyncResponseBody {
  success?: boolean
  mode?: string
  filename?: string
  size_formatted?: string
  characters_found?: number
  cart_updated?: boolean
  added_to_cart?: number
  message?: string
  summary?: {
    total_sales?: number
    total_purchases?: number
    characters_count?: number
    resale_items_count?: number
    net_profit_display?: string
  }
  error?: string
}

export interface CompanionSyncResult {
  ok: boolean
  mode?: string
  filename?: string
  sizeFormatted?: string
  detail?: string
  error?: string
}

function companionHeaders(token: string): Record<string, string> {
  return { 'X-Companion-Token': token, 'Content-Type': 'application/json' }
}

export interface CompanionLoginResult {
  ok: boolean
  token?: string
  username?: string
  userId?: number
  error?: string
}

export async function loginDjango(
  djangoUrl: string,
  username: string,
  password: string
): Promise<CompanionLoginResult> {
  let url: string
  try {
    url = new URL('/api/companion/login/', djangoUrl).toString()
  } catch {
    return { ok: false, error: `URL del servidor inválida: "${djangoUrl}"` }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: controller.signal
    })

    const body = (await response.json().catch(() => null)) as { success?: boolean; token?: string; username?: string; user_id?: number; error?: string } | null

    if (!response.ok || !body?.success || !body?.token) {
      return { ok: false, error: body?.error ?? `Credenciales inválidas o error HTTP ${response.status}` }
    }

    return {
      ok: true,
      token: body.token,
      username: body.username ?? username,
      userId: body.user_id
    }
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, error: `Sin respuesta del servidor después de ${PING_TIMEOUT_MS}ms` }
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timeout)
  }
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

async function postCompanionSync(
  settings: Pick<CompanionSettings, 'djangoUrl' | 'companionToken'>,
  endpoint: string,
  filePath: string
): Promise<CompanionSyncResult> {
  let url: string
  try {
    url = new URL(endpoint, settings.djangoUrl).toString()
  } catch {
    return { ok: false, error: `Django URL inválida: "${settings.djangoUrl}"` }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: companionHeaders(settings.companionToken),
      body: JSON.stringify({ file_path: filePath }),
      signal: controller.signal
    })

    const body = (await response.json().catch(() => null)) as SyncResponseBody | null

    if (!response.ok || !body?.success) {
      return { ok: false, error: body?.error ?? `HTTP ${response.status}` }
    }

    let detail = body.message ?? body.mode ?? ''
    if (body.cart_updated && body.added_to_cart != null) {
      detail = `carrito: ${body.added_to_cart} items`
    } else if (body.characters_found != null && body.mode === 'extract_only') {
      detail = `${body.characters_found} chars (sin selección → carrito intacto)`
    } else if (body.summary) {
      const s = body.summary
      detail = `sales=${s.total_sales ?? 0} purchases=${s.total_purchases ?? 0} stats=${s.resale_items_count ?? 0}`
    }

    return {
      ok: true,
      mode: body.mode,
      filename: body.filename,
      sizeFormatted: body.size_formatted,
      detail
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

/** Etapa 3b: persiste inventario (carrito si hay chars seleccionados). */
export function syncInventory(
  settings: Pick<CompanionSettings, 'djangoUrl' | 'companionToken'>,
  filePath: string
): Promise<CompanionSyncResult> {
  return postCompanionSync(settings, '/api/companion/sync-inventory/', filePath)
}

/** Etapa 3b: procesa accounting y persiste ItemSellStats. */
export function syncAccounting(
  settings: Pick<CompanionSettings, 'djangoUrl' | 'companionToken'>,
  filePath: string
): Promise<CompanionSyncResult> {
  return postCompanionSync(settings, '/api/companion/sync-accounting/', filePath)
}

export interface TsmWritePreview {
  ok: boolean
  preview?: Array<{ group: string; details: string; total_items: number }>
  assignments?: Array<{ group: string; item_ids: string[]; clear_first?: boolean }>
  itemCount?: number
  totalItemsAffected?: number
  error?: string
}

export interface TsmWriteResult {
  ok: boolean
  stats?: Record<string, number>
  backupPath?: string
  error?: string
}

export async function previewTsmWrite(
  settings: Pick<CompanionSettings, 'djangoUrl' | 'companionToken'>,
  filePath: string
): Promise<TsmWritePreview> {
  let url: string
  try {
    url = new URL('/api/companion/tsm-write/preview/', settings.djangoUrl).toString()
  } catch {
    return { ok: false, error: `Django URL inválida: "${settings.djangoUrl}"` }
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: companionHeaders(settings.companionToken),
      body: JSON.stringify({ file_path: filePath })
    })
    const body = (await response.json().catch(() => null)) as {
      success?: boolean
      preview?: TsmWritePreview['preview']
      assignments?: TsmWritePreview['assignments']
      item_count?: number
      total_items_affected?: number
      error?: string
    } | null

    if (!response.ok || !body?.success) {
      return { ok: false, error: body?.error ?? `HTTP ${response.status}` }
    }

    return {
      ok: true,
      preview: body.preview,
      assignments: body.assignments,
      itemCount: body.item_count,
      totalItemsAffected: body.total_items_affected
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function executeTsmWrite(
  settings: Pick<CompanionSettings, 'djangoUrl' | 'companionToken'>,
  filePath: string,
  assignments: TsmWritePreview['assignments']
): Promise<TsmWriteResult> {
  let url: string
  try {
    url = new URL('/api/companion/tsm-write/', settings.djangoUrl).toString()
  } catch {
    return { ok: false, error: `Django URL inválida: "${settings.djangoUrl}"` }
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: companionHeaders(settings.companionToken),
      body: JSON.stringify({ file_path: filePath, assignments })
    })
    const body = (await response.json().catch(() => null)) as {
      success?: boolean
      stats?: Record<string, number>
      backup_path?: string
      error?: string
    } | null

    if (!response.ok || !body?.success) {
      return { ok: false, error: body?.error ?? `HTTP ${response.status}` }
    }

    return { ok: true, stats: body.stats, backupPath: body.backup_path }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NUEVAS FUNCIONES: arquitectura multi-usuario (cola de escrituras pendientes)
// ─────────────────────────────────────────────────────────────────────────────

export interface TsmGroup {
  value: string
  label: string
  is_subgroup: boolean
}

/**
 * Sube la lista de grupos TSM del usuario a Django.
 * Se llama después de cada sync del TSM .lua.
 */
export async function syncTsmGroups(
  settings: Pick<CompanionSettings, 'djangoUrl' | 'companionToken'>,
  groups: TsmGroup[]
): Promise<{ ok: boolean; error?: string }> {
  let url: string
  try {
    url = new URL('/api/companion/sync-tsm-groups/', settings.djangoUrl).toString()
  } catch {
    return { ok: false, error: `Django URL inválida: "${settings.djangoUrl}"` }
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: companionHeaders(settings.companionToken),
      body: JSON.stringify({ groups })
    })
    const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null
    if (!response.ok || !body?.success) {
      return { ok: false, error: body?.error ?? `HTTP ${response.status}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export interface PendingWrite {
  writeId: number
  assignments: Array<{ group: string; item_ids: string[]; clear_first?: boolean }>
  createdAt: string
}

/**
 * Polling: pregunta a Django si hay un Write TSM pendiente para este usuario.
 * Devuelve null si no hay nada, o el job si hay uno.
 */
export async function pollPendingWrite(
  settings: Pick<CompanionSettings, 'djangoUrl' | 'companionToken'>
): Promise<PendingWrite | null> {
  let url: string
  try {
    url = new URL('/api/companion/pending-write/', settings.djangoUrl).toString()
  } catch {
    return null
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: companionHeaders(settings.companionToken)
    })
    const body = (await response.json().catch(() => null)) as {
      success?: boolean
      has_pending?: boolean
      write_id?: number
      assignments?: PendingWrite['assignments']
      created_at?: string
    } | null

    if (!response.ok || !body?.success || !body.has_pending) return null

    return {
      writeId: body.write_id!,
      assignments: body.assignments ?? [],
      createdAt: body.created_at ?? new Date().toISOString()
    }
  } catch {
    return null
  }
}

/**
 * Reporta el resultado de un Write TSM ejecutado localmente a Django.
 */
export async function completePendingWrite(
  settings: Pick<CompanionSettings, 'djangoUrl' | 'companionToken'>,
  writeId: number,
  ok: boolean,
  stats?: Record<string, number>,
  error?: string
): Promise<void> {
  let url: string
  try {
    url = new URL('/api/companion/complete-write/', settings.djangoUrl).toString()
  } catch {
    return
  }

  try {
    await fetch(url, {
      method: 'POST',
      headers: companionHeaders(settings.companionToken),
      body: JSON.stringify({ write_id: writeId, success: ok, stats: stats ?? {}, error: error ?? '' })
    })
  } catch {
    // fire and forget
  }
}

export interface RecentSaleItemDto {
  id: string
  itemId: string
  blizzardId?: number
  itemName: string
  buyTimeTs?: number
  boughtAt?: string
  sellTimeTs?: number
  soldAt: string
  quantity: number
  buyPriceCopper: number
  sellPriceCopper: number
  postsBeforeSale: number
  netProfitCopper: number
  buyer?: string
  realm?: string
}

export interface RecentSalesResponseDto {
  ok: boolean
  sales?: RecentSaleItemDto[]
  total?: number
  totalRevenueCopper?: number
  totalCostCopper?: number
  totalProfitCopper?: number
  error?: string
}

export async function fetchRecentSales(
  settings: Pick<CompanionSettings, 'djangoUrl' | 'companionToken'>,
  limit = 100
): Promise<RecentSalesResponseDto> {
  let url: string
  try {
    url = new URL(`/api/companion/recent-sales/?limit=${limit}`, settings.djangoUrl).toString()
  } catch {
    return { ok: false, error: 'Invalid Django Server URL' }
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: companionHeaders(settings.companionToken)
    })
    const body = (await response.json().catch(() => null)) as {
      success?: boolean
      sales?: Array<{
        id: string
        item_id: string
        blizzard_id?: number
        item_name: string
        buy_time_ts?: number
        bought_at?: string
        sell_time_ts?: number
        sold_at: string
        quantity: number
        buy_price_copper: number
        sell_price_copper: number
        posts_before_sale: number
        net_profit_copper: number
        buyer?: string
        realm?: string
      }>
      total?: number
      total_revenue_copper?: number
      total_cost_copper?: number
      total_profit_copper?: number
      error?: string
    } | null

    if (!response.ok || !body?.success) {
      return { ok: false, error: body?.error ?? `HTTP error ${response.status}` }
    }

    const salesList: RecentSaleItemDto[] = (body.sales ?? []).map((s) => ({
      id: s.id,
      itemId: s.item_id,
      blizzardId: s.blizzard_id,
      itemName: s.item_name,
      buyTimeTs: s.buy_time_ts,
      boughtAt: s.bought_at,
      sellTimeTs: s.sell_time_ts,
      soldAt: s.sold_at,
      quantity: s.quantity,
      buyPriceCopper: s.buy_price_copper,
      sellPriceCopper: s.sell_price_copper,
      postsBeforeSale: s.posts_before_sale,
      netProfitCopper: s.net_profit_copper,
      buyer: s.buyer,
      realm: s.realm
    }))

    return {
      ok: true,
      sales: salesList,
      total: body.total ?? salesList.length,
      totalRevenueCopper: body.total_revenue_copper ?? 0,
      totalCostCopper: body.total_cost_copper ?? 0,
      totalProfitCopper: body.total_profit_copper ?? 0
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Wowhead item tooltip (fetched from Node.js to bypass CORS) ──────────────

export interface ItemTooltipDto {
  quality: number
  iconUrl: string
  name: string
}

const itemTooltipCache = new Map<number, ItemTooltipDto>()

export async function fetchItemTooltip(blizzardId: number): Promise<ItemTooltipDto | null> {
  if (itemTooltipCache.has(blizzardId)) {
    return itemTooltipCache.get(blizzardId)!
  }

  const urls = [
    `https://nether.wowhead.com/tooltip/item/${blizzardId}?locale=0`,
    `https://nether.wowhead.com/tooltip/item/${blizzardId}?dataEnv=4&locale=0`
  ]

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json'
        }
      })
      if (!resp.ok) continue

      const body = (await resp.json()) as { quality?: number; icon?: string; name?: string; tooltip?: string } | null
      if (!body) continue

      let iconName = body.icon ?? ''
      if (!iconName && body.tooltip) {
        const match = body.tooltip.match(/images\/wow\/icons\/(?:small|medium|large)\/([a-zA-Z0-9_-]+)\.(?:jpg|png)/i)
        if (match) {
          iconName = match[1]
        }
      }

      const result: ItemTooltipDto = {
        quality: typeof body.quality === 'number' ? body.quality : 2,
        iconUrl: iconName
          ? `https://wow.zamimg.com/images/wow/icons/medium/${iconName}.jpg`
          : '',
        name: body.name ?? ''
      }

      if (result.iconUrl || typeof body.quality === 'number') {
        itemTooltipCache.set(blizzardId, result)
        return result
      }
    } catch {
      // try fallback url
    }
  }

  return null
}
