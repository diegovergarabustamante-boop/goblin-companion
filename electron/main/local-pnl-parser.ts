import { readFileSync, existsSync } from 'node:fs'
import type { RecentSaleItemDto, RecentSalesResponseDto } from './http-client'
import { resolveLuaPath } from './paths'

interface RawSaleRecord {
  itemId: string
  baseId: string
  stackSize: number
  quantity: number
  priceCopper: number
  buyer: string
  seller: string
  timeTsm: number
  source: string
  realm: string
}

interface RawBuyRecord {
  itemId: string
  baseId: string
  stackSize: number
  quantity: number
  priceCopper: number
  seller: string
  buyer: string
  timeTsm: number
  source: string
  realm: string
}

interface RawPostRecord {
  itemId: string
  baseId: string
  quantity: number
  player: string
  timeTsm: number
  realm: string
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
 * Extracts base item key (e.g. "i:1604" from "i:1604::1:13617:1:9:30").
 */
function cleanBaseItemId(itemStr: string): string {
  if (!itemStr) return ''
  const m = String(itemStr).trim().match(/^(i:\d+)/i)
  if (m) return m[1].toLowerCase()
  return String(itemStr).trim().split(':')[0].toLowerCase()
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
 * Robust local Lua parser for TradeSkillMaster.lua accounting CSV data.
 * Replicates the Django backend companion_recent_sales and compute_resale_analytics logic,
 * with bonus ID base key fallback for gear/transmog cost matching.
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

    const salesPattern = /\["r@([^"@]+)@internalData@csvSales"\]\s*=\s*"/g
    const buysPattern = /\["r@([^"@]+)@internalData@csvBuys"\]\s*=\s*"/g
    const expiredPattern = /\["r@([^"@]+)@internalData@csvExpired"\]\s*=\s*"/g
    const cancelledPattern = /\["r@([^"@]+)@internalData@csvCancelled"\]\s*=\s*"/g

    function parseSection(pattern: RegExp) {
      const items: Array<{ realm: string; parts: string[] }> = []
      let match: RegExpExecArray | null
      while ((match = pattern.exec(content)) !== null) {
        const realm = match[1]
        const startPos = pattern.lastIndex
        let endPos = startPos
        while (endPos < content.length) {
          if (content[endPos] === '"' && (endPos === 0 || content[endPos - 1] !== '\\')) {
            break
          }
          endPos++
        }
        const csvData = content.substring(startPos, endPos)
        if (csvData) {
          const lines = csvData.replace(/\\n/g, '\n').split('\n')
          if (lines.length > 1) {
            for (let i = 1; i < lines.length; i++) {
              const line = lines[i].trim()
              if (!line) continue
              const parts = line.split(',')
              items.push({ realm, parts })
            }
          }
        }
      }
      return items
    }

    const rawSales: RawSaleRecord[] = parseSection(salesPattern).map((x) => ({
      itemId: cleanStr(x.parts[0]),
      baseId: cleanBaseItemId(x.parts[0]),
      stackSize: parseInt(cleanStr(x.parts[1]), 10) || 1,
      quantity: parseInt(cleanStr(x.parts[2]), 10) || 1,
      priceCopper: parseInt(cleanStr(x.parts[3]), 10) || 0,
      buyer: cleanStr(x.parts[4]), // Customer who bought it from you on AH
      seller: cleanStr(x.parts[5]),
      timeTsm: parseInt(cleanStr(x.parts[6]), 10) || 0,
      source: cleanStr(x.parts[7]),
      realm: x.realm
    })).filter((s) => s.priceCopper > 0 && (s.source.toLowerCase() === 'auction' || !s.source))

    const rawPurchases: RawBuyRecord[] = parseSection(buysPattern).map((x) => ({
      itemId: cleanStr(x.parts[0]),
      baseId: cleanBaseItemId(x.parts[0]),
      stackSize: parseInt(cleanStr(x.parts[1]), 10) || 1,
      quantity: parseInt(cleanStr(x.parts[2]), 10) || 1,
      priceCopper: parseInt(cleanStr(x.parts[3]), 10) || 0,
      seller: cleanStr(x.parts[4]),
      buyer: cleanStr(x.parts[5]),
      timeTsm: parseInt(cleanStr(x.parts[6]), 10) || 0,
      source: cleanStr(x.parts[7]),
      realm: x.realm
    })).filter((p) => p.priceCopper > 0)

    const rawExpired: RawPostRecord[] = parseSection(expiredPattern).map((x) => ({
      itemId: cleanStr(x.parts[0]),
      baseId: cleanBaseItemId(x.parts[0]),
      quantity: parseInt(cleanStr(x.parts[2]), 10) || 1,
      player: cleanStr(x.parts[3]),
      timeTsm: parseInt(cleanStr(x.parts[4]), 10) || 0,
      realm: x.realm
    })).filter((e) => e.timeTsm > 0)

    const rawCancelled: RawPostRecord[] = parseSection(cancelledPattern).map((x) => ({
      itemId: cleanStr(x.parts[0]),
      baseId: cleanBaseItemId(x.parts[0]),
      quantity: parseInt(cleanStr(x.parts[2]), 10) || 1,
      player: cleanStr(x.parts[3]),
      timeTsm: parseInt(cleanStr(x.parts[4]), 10) || 0,
      realm: x.realm
    })).filter((c) => c.timeTsm > 0)

    // Index purchases by EXACT itemId AND baseId
    const purchasesByExactItem: Record<string, RawBuyRecord[]> = {}
    const purchasesByBase: Record<string, RawBuyRecord[]> = {}
    for (const p of rawPurchases) {
      if (!purchasesByExactItem[p.itemId]) purchasesByExactItem[p.itemId] = []
      purchasesByExactItem[p.itemId].push(p)

      if (!purchasesByBase[p.baseId]) purchasesByBase[p.baseId] = []
      purchasesByBase[p.baseId].push(p)
    }
    for (const k in purchasesByExactItem) purchasesByExactItem[k].sort((a, b) => b.timeTsm - a.timeTsm)
    for (const k in purchasesByBase) purchasesByBase[k].sort((a, b) => b.timeTsm - a.timeTsm)

    // Compute resale_analytics EXACTLY as Django's compute_resale_analytics
    const salesByExactItem: Record<string, RawSaleRecord[]> = {}
    const expByExactItem: Record<string, RawPostRecord[]> = {}
    const cancByExactItem: Record<string, RawPostRecord[]> = {}

    for (const s of rawSales) {
      if (!salesByExactItem[s.itemId]) salesByExactItem[s.itemId] = []
      salesByExactItem[s.itemId].push(s)
    }
    for (const e of rawExpired) {
      if (!expByExactItem[e.itemId]) expByExactItem[e.itemId] = []
      expByExactItem[e.itemId].push(e)
    }
    for (const c of rawCancelled) {
      if (!cancByExactItem[c.itemId]) cancByExactItem[c.itemId] = []
      cancByExactItem[c.itemId].push(c)
    }

    const postsPerSaleByItem: Record<string, number> = {}
    const allItemIds = new Set([...Object.keys(salesByExactItem), ...Object.keys(purchasesByExactItem)])

    for (const itemId of allItemIds) {
      const itemSales = salesByExactItem[itemId] || []
      const itemExp = expByExactItem[itemId] || []
      const itemCanc = cancByExactItem[itemId] || []

      const totalSoldQty = itemSales.reduce((acc, s) => acc + (s.quantity * s.stackSize), 0)
      const totalExpiredQty = itemExp.reduce((acc, e) => acc + e.quantity, 0)
      const totalCancelledQty = itemCanc.reduce((acc, c) => acc + c.quantity, 0)
      const totalFailedPosts = totalExpiredQty + totalCancelledQty

      if (totalSoldQty > 0) {
        postsPerSaleByItem[itemId] = Math.round((totalFailedPosts + totalSoldQty) / totalSoldQty)
      } else {
        postsPerSaleByItem[itemId] = 1
      }
    }

    // Sort sales by sell timestamp descending (newest sales first)
    rawSales.sort((a, b) => b.timeTsm - a.timeTsm)

    const processedSales: RecentSaleItemDto[] = []

    for (const s of rawSales) {
      const itemId = s.itemId
      const baseId = s.baseId
      const saleTime = s.timeTsm
      const totalQty = s.quantity * s.stackSize

      let buyPriceCopper = 0
      let buyTimeTs: number | undefined
      let pastBuys: RawBuyRecord[] = []

      // 1. Check exact item match first
      if (purchasesByExactItem[itemId]) {
        pastBuys = purchasesByExactItem[itemId].filter((p) => p.timeTsm <= saleTime)
        if (pastBuys.length > 0) {
          buyPriceCopper = pastBuys[0].priceCopper
          buyTimeTs = pastBuys[0].timeTsm
        }
      }

      // 2. Fallback to baseId (matching bonus IDs for gear & transmog like Chromatic Sword)
      if (buyPriceCopper === 0 && purchasesByBase[baseId]) {
        pastBuys = purchasesByBase[baseId].filter((p) => p.timeTsm <= saleTime)
        if (pastBuys.length > 0) {
          buyPriceCopper = pastBuys[0].priceCopper
          buyTimeTs = pastBuys[0].timeTsm
        }
      }

      const sellPriceCopper = s.priceCopper
      // Exact Django net profit formula: int(sell_price * 0.95) - buy_price
      const singleNetProfit = Math.floor(sellPriceCopper * 0.95) - buyPriceCopper
      const netProfitCopper = singleNetProfit * totalQty

      // Determine posts count (matching Django compute_resale_analytics)
      let postsBeforeSale = postsPerSaleByItem[itemId]
      if (!postsBeforeSale || postsBeforeSale < 1) {
        const baseSales = (salesByExactItem[baseId] || []).length
        const baseExp = (expByExactItem[baseId] || []).length
        const baseCanc = (cancByExactItem[baseId] || []).length
        postsBeforeSale = baseSales > 0 ? Math.round((baseExp + baseCanc + baseSales) / baseSales) : 1
      }

      const bId = extractBlizzardId(itemId)

      processedSales.push({
        id: `local-${saleTime}-${processedSales.length}`,
        itemId,
        blizzardId: bId,
        itemName: bId ? `Item ${bId}` : itemId,
        buyTimeTs: buyTimeTs && buyTimeTs > 0 ? buyTimeTs : undefined,
        boughtAt: buyTimeTs && buyTimeTs > 0 ? formatTs(buyTimeTs) : undefined,
        sellTimeTs: saleTime,
        soldAt: formatTs(saleTime),
        quantity: totalQty,
        buyPriceCopper,
        sellPriceCopper,
        postsBeforeSale,
        netProfitCopper,
        buyer: s.buyer, // Customer who bought it from you on AH
        realm: s.realm
      })
    }

    const slicedSales = processedSales.slice(0, limit)

    let totalRevenue = 0
    let totalCost = 0

    for (const item of slicedSales) {
      const qty = item.quantity || 1
      totalRevenue += (item.sellPriceCopper || 0) * qty
      totalCost += (item.buyPriceCopper || 0) * qty
    }

    const totalProfit = totalRevenue - totalCost

    return {
      ok: true,
      sales: slicedSales,
      total: processedSales.length,
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
