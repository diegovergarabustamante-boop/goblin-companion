import type { RecentSaleItemDto, RecentSalesResponseDto } from './http-client'
import { parseLocalAccountingSales } from './local-pnl-parser'

/**
 * Stable identity for a sale across Django and the local TSM.lua parser.
 * Used to detect which rows appeared in the latest mailbox claim.
 */
export function saleKey(s: {
  itemId?: string
  blizzardId?: number
  sellTimeTs?: number
  soldAt?: string
  quantity?: number
  sellPriceCopper?: number
  realm?: string
}): string {
  const ts =
    s.sellTimeTs && s.sellTimeTs > 0
      ? s.sellTimeTs
      : Math.floor((Date.parse(s.soldAt || '') || 0) / 1000)
  const id =
    String(s.blizzardId || '').replace(/\D/g, '') ||
    String(s.itemId || '').replace(/\D/g, '')
  return [id, ts, s.quantity ?? 0, s.sellPriceCopper ?? 0, (s.realm || '').toLowerCase()].join('|')
}

function saleTime(s: RecentSaleItemDto): number {
  if (s.sellTimeTs && s.sellTimeTs > 0) return s.sellTimeTs
  const parsed = Date.parse(s.soldAt)
  return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000)
}

let primed = false
let lastSeenKeys = new Set<string>()
let latestClaimedKeys = new Set<string>()

function lastRealmNewKeys(newSales: RecentSaleItemDto[]): Set<string> {
  if (newSales.length === 0) return new Set()
  const newest = newSales.reduce((best, sale) => (saleTime(sale) >= saleTime(best) ? sale : best))
  const realm = (newest.realm || '').toLowerCase()
  return new Set(
    newSales.filter((sale) => (sale.realm || '').toLowerCase() === realm).map(saleKey)
  )
}

function observeSales(sales: RecentSaleItemDto[]): void {
  const incomingKeys = new Set(sales.map(saleKey))

  if (!primed || lastSeenKeys.size === 0) {
    lastSeenKeys = incomingKeys
    primed = true
    latestClaimedKeys = new Set([...latestClaimedKeys].filter((key) => incomingKeys.has(key)))
    return
  }

  const newly = sales.filter((sale) => !lastSeenKeys.has(saleKey(sale)))
  if (newly.length > 0) {
    latestClaimedKeys = lastRealmNewKeys(newly)
  } else {
    latestClaimedKeys = new Set([...latestClaimedKeys].filter((key) => incomingKeys.has(key)))
  }
  lastSeenKeys = incomingKeys
}

/**
 * Snapshot current TSM sales as "already seen" so a later mailbox claim is a small delta.
 * Call once at app start — never treat the boot-time history as NEW.
 */
export function primeClaimedSalesBaseline(): void {
  const result = parseLocalAccountingSales(150)
  if (result.ok && result.sales) observeSales(result.sales)
}

/**
 * Re-read TradeSkillMaster.lua and remember only the newest realm in the new rows.
 * Each SavedVariables write after a realm mailbox claim typically adds that realm's mail.
 */
export function refreshClaimedSalesBatch(): void {
  const result = parseLocalAccountingSales(150)
  if (result.ok && result.sales) observeSales(result.sales)
}

export function attachClaimedBatch(res: RecentSalesResponseDto): RecentSalesResponseDto {
  if (!res.ok || !res.sales) return res
  refreshClaimedSalesBatch()
  return {
    ...res,
    sales: res.sales.map((sale) => ({
      ...sale,
      isNewlyClaimed: latestClaimedKeys.has(saleKey(sale))
    }))
  }
}
