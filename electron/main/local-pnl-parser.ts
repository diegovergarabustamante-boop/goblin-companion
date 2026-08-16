import { readFileSync, existsSync } from 'node:fs'
import type { RecentSaleItemDto, RecentSalesResponseDto } from './http-client'
import { resolveLuaPath } from './paths'

interface RawBuyRecord {
  itemString: string
  priceCopper: number
  quantity: number
  timestamp: number
}

/**
 * Extracts item ID integer from TSM item strings like "i:190198" or "i:190198::1:64" or "190198".
 */
function extractBlizzardId(itemString: string): number | undefined {
  if (!itemString) return undefined
  const match = itemString.match(/i:(\d+)/i) || itemString.match(/^(\d+)$/)
  if (match) {
    const id = parseInt(match[1], 10)
    return isNaN(id) ? undefined : id
  }
  return undefined
}

/**
 * Formats a raw timestamp (in seconds) to ISO or local string.
 */
function formatTs(ts?: number): string {
  if (!ts || ts <= 0) return 'N/A'
  const dt = new Date(ts * 1000)
  if (isNaN(dt.getTime())) return 'N/A'
  return dt.toISOString()
}

/**
 * Clean string by stripping Lua escape sequences / quotes.
 */
function cleanStr(str?: string): string {
  if (!str) return ''
  return str.replace(/^["']|["']$/g, '').trim()
}

/**
 * Local Lua parser for TradeSkillMaster.lua accounting CSV data.
 * Used as a fallback when Django backend is unreachable.
 */
export function parseLocalAccountingSales(limit = 100): RecentSalesResponseDto {
  const luaPath = resolveLuaPath('accounting')
  if (!luaPath || !existsSync(luaPath)) {
    return {
      ok: false,
      error: 'TradeSkillMaster.lua not found in SavedVariables path.'
    }
  }

  try {
    const content = readFileSync(luaPath, 'utf-8')

    // Find csvSales and csvBuys blocks in TSM Lua file
    // TSM stores these as ["g@ ... @csvSales"] = "..." or csvSales = "..."
    const salesMatches = Array.from(content.matchAll(/csvSales["']?\s*\]?\s*=\s*(?:["'](.*?)["']|\{(.*?)\})/gs))
    const buysMatches = Array.from(content.matchAll(/csvBuys["']?\s*\]?\s*=\s*(?:["'](.*?)["']|\{(.*?)\})/gs))

    const salesRawStrings: string[] = []
    for (const match of salesMatches) {
      const csvData = match[1] || match[2]
      if (csvData) salesRawStrings.push(csvData)
    }

    const buysRawStrings: string[] = []
    for (const match of buysMatches) {
      const csvData = match[1] || match[2]
      if (csvData) buysRawStrings.push(csvData)
    }

    // Parse Buy Records for FIFO cost matching
    const buysByItem: Record<string, RawBuyRecord[]> = {}
    for (const rawBlock of buysRawStrings) {
      const lines = rawBlock.split('\n')
      for (const line of lines) {
        const cleaned = cleanStr(line)
        if (!cleaned) continue
        const parts = cleaned.split(',')
        if (parts.length < 3) continue

        // Typical TSM Buy CSV: itemString, price, quantity, seller, player, time, source
        const itemString = cleanStr(parts[0])
        const priceCopper = parseInt(cleanStr(parts[1]), 10) || 0
        const quantity = parseInt(cleanStr(parts[2]), 10) || 1
        const time = parseInt(cleanStr(parts[5] || parts[3]), 10) || 0

        if (!itemString) continue

        if (!buysByItem[itemString]) buysByItem[itemString] = []
        buysByItem[itemString].push({ itemString, priceCopper, quantity, timestamp: time })
      }
    }

    // Sort buys by timestamp ascending for FIFO matching
    for (const key in buysByItem) {
      buysByItem[key].sort((a, b) => a.timestamp - b.timestamp)
    }

    // Parse Sales Records
    const rawSales: RecentSaleItemDto[] = []
    let totalRevenue = 0
    let totalCost = 0
    let totalProfit = 0

    for (const rawBlock of salesRawStrings) {
      const lines = rawBlock.split('\n')
      for (const line of lines) {
        const cleaned = cleanStr(line)
        if (!cleaned) continue
        const parts = cleaned.split(',')
        if (parts.length < 3) continue

        // Typical TSM Sales CSV: itemString, price, quantity, buyer, player, time, source
        const itemString = cleanStr(parts[0])
        const sellPriceCopper = parseInt(cleanStr(parts[1]), 10) || 0
        const quantity = parseInt(cleanStr(parts[2]), 10) || 1
        const buyer = cleanStr(parts[3])
        const sellTimeTs = parseInt(cleanStr(parts[5] || parts[4]), 10) || 0

        if (!itemString || sellPriceCopper <= 0) continue

        const bId = extractBlizzardId(itemString)
        const itemName = bId ? `Item ${bId}` : itemString

        // Attempt FIFO buy matching
        let buyPriceCopper = 0
        const buysList = buysByItem[itemString]
        if (buysList && buysList.length > 0) {
          const matchedBuy = buysList[buysList.length - 1]
          buyPriceCopper = matchedBuy.priceCopper
        }

        const netProfitCopper = (sellPriceCopper * quantity) - (buyPriceCopper * quantity)

        totalRevenue += sellPriceCopper * quantity
        totalCost += buyPriceCopper * quantity
        totalProfit += netProfitCopper

        rawSales.push({
          id: `local-${sellTimeTs}-${rawSales.length}`,
          itemId: itemString,
          blizzardId: bId,
          itemName,
          buyTimeTs: buysList && buysList[0] ? buysList[0].timestamp : undefined,
          boughtAt: buysList && buysList[0] ? formatTs(buysList[0].timestamp) : undefined,
          sellTimeTs,
          soldAt: formatTs(sellTimeTs),
          quantity,
          buyPriceCopper,
          sellPriceCopper,
          postsBeforeSale: 1,
          netProfitCopper,
          buyer: buyer || undefined,
          realm: undefined
        })
      }
    }

    // Sort sales by sell timestamp descending (newest sales first)
    rawSales.sort((a, b) => (b.sellTimeTs || 0) - (a.sellTimeTs || 0))

    const slicedSales = rawSales.slice(0, limit)

    return {
      ok: true,
      sales: slicedSales,
      total: rawSales.length,
      totalRevenueCopper: totalRevenue,
      totalCostCopper: totalCost,
      totalProfitCopper: totalProfit,
      isOffline: true
    }
  } catch (err) {
    return {
      ok: false,
      error: `Failed to parse local TradeSkillMaster.lua: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}
