import { readFileSync, existsSync } from 'node:fs'
import type { RecentSaleItemDto, RecentSalesResponseDto } from './http-client'
import { resolveLuaPath } from './paths'

interface RawBuyRecord {
  itemString: string
  baseId: string
  priceCopper: number
  quantity: number
  timestamp: number
  buyer?: string
  realm?: string
}

interface PostRecord {
  baseId: string
  player: string
  realm: string
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
 * Directly ports the Django backend companion_recent_sales algorithm from Auction-house-Profit.
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

    const rawSales = parseSection(salesPattern).map((x) => ({
      itemId: cleanStr(x.parts[0]),
      baseId: cleanBaseItemId(x.parts[0]),
      stackSize: parseInt(cleanStr(x.parts[1]), 10) || 1,
      quantity: parseInt(cleanStr(x.parts[2]), 10) || 1,
      priceCopper: parseInt(cleanStr(x.parts[3]), 10) || 0,
      buyer: cleanStr(x.parts[4]),
      seller: cleanStr(x.parts[5]),
      timeTsm: parseInt(cleanStr(x.parts[6]), 10) || 0,
      source: cleanStr(x.parts[7]),
      realm: x.realm
    })).filter((s) => s.priceCopper > 0 && (s.source.toLowerCase() === 'auction' || !s.source))

    const rawPurchases = parseSection(buysPattern).map((x) => ({
      itemId: cleanStr(x.parts[0]),
      baseId: cleanBaseItemId(x.parts[0]),
      stackSize: parseInt(cleanStr(x.parts[1]), 10) || 1,
      quantity: parseInt(cleanStr(x.parts[2]), 10) || 1,
      priceCopper: parseInt(cleanStr(x.parts[3]), 10) || 0,
      seller: cleanStr(x.parts[4]),
      buyer: cleanStr(x.parts[5]), // Your character who bought it
      timeTsm: parseInt(cleanStr(x.parts[6]), 10) || 0,
      source: cleanStr(x.parts[7]),
      realm: x.realm
    })).filter((p) => p.priceCopper > 0)

    const rawExpired = parseSection(expiredPattern).map((x) => ({
      baseId: cleanBaseItemId(x.parts[0]),
      player: cleanStr(x.parts[3]),
      timestamp: parseInt(cleanStr(x.parts[4]), 10) || 0,
      realm: x.realm
    })).filter((e) => e.timestamp > 0)

    const rawCancelled = parseSection(cancelledPattern).map((x) => ({
      baseId: cleanBaseItemId(x.parts[0]),
      player: cleanStr(x.parts[3]),
      timestamp: parseInt(cleanStr(x.parts[4]), 10) || 0,
      realm: x.realm
    })).filter((c) => c.timestamp > 0)

    // Group purchases by baseId sorted DESCENDING by timeTsm (matching Django's purchases_by_base)
    const purchasesByBase: Record<string, RawBuyRecord[]> = {}
    for (const p of rawPurchases) {
      if (!purchasesByBase[p.baseId]) purchasesByBase[p.baseId] = []
      purchasesByBase[p.baseId].push({
        itemString: p.itemId,
        baseId: p.baseId,
        priceCopper: p.priceCopper,
        quantity: p.quantity * p.stackSize,
        timestamp: p.timeTsm,
        buyer: p.buyer,
        realm: p.realm
      })
    }
    for (const k in purchasesByBase) {
      purchasesByBase[k].sort((a, b) => b.timestamp - a.timestamp)
    }

    // Group expired and cancelled by baseId
    const expiredByBase: Record<string, PostRecord[]> = {}
    for (const e of rawExpired) {
      if (!expiredByBase[e.baseId]) expiredByBase[e.baseId] = []
      expiredByBase[e.baseId].push(e)
    }

    const cancelledByBase: Record<string, PostRecord[]> = {}
    for (const c of rawCancelled) {
      if (!cancelledByBase[c.baseId]) cancelledByBase[c.baseId] = []
      cancelledByBase[c.baseId].push(c)
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
      let boughtBy: string | undefined
      let pastBuys: RawBuyRecord[] = []

      if (purchasesByBase[baseId]) {
        pastBuys = purchasesByBase[baseId].filter((p) => p.timestamp <= saleTime)
        if (pastBuys.length > 0) {
          buyPriceCopper = pastBuys[0].priceCopper
          buyTimeTs = pastBuys[0].timestamp
          boughtBy = pastBuys[0].buyer
        } else if (purchasesByBase[baseId].length > 0) {
          buyPriceCopper = purchasesByBase[baseId][0].priceCopper
          buyTimeTs = purchasesByBase[baseId][0].timestamp
          boughtBy = purchasesByBase[baseId][0].buyer
        }
      }

      const sellPriceCopper = s.priceCopper
      // Exact Django net profit formula: int(sell_price * 0.95) - buy_price
      const singleNetProfit = Math.floor(sellPriceCopper * 0.95) - buyPriceCopper
      const netProfitCopper = singleNetProfit * totalQty

      const buyTime = pastBuys.length > 0 ? pastBuys[0].timestamp : (buyTimeTs || 0)
      const expCnt = (expiredByBase[baseId] || []).filter((e) => (buyTime === 0 || buyTime <= e.timestamp) && e.timestamp <= saleTime).length
      const cancCnt = (cancelledByBase[baseId] || []).filter((c) => (buyTime === 0 || buyTime <= c.timestamp) && c.timestamp <= saleTime).length

      const postsBeforeSale = expCnt + cancCnt + 1
      const bId = extractBlizzardId(itemId)

      processedSales.push({
        id: `local-${saleTime}-${processedSales.length}`,
        itemId,
        blizzardId: bId,
        itemName: bId ? `Item ${bId}` : itemId,
        buyTimeTs: buyTime > 0 ? buyTime : undefined,
        boughtAt: buyTime > 0 ? formatTs(buyTime) : undefined,
        sellTimeTs: saleTime,
        soldAt: formatTs(saleTime),
        quantity: totalQty,
        buyPriceCopper,
        sellPriceCopper,
        postsBeforeSale,
        netProfitCopper,
        buyer: boughtBy || s.seller,
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
