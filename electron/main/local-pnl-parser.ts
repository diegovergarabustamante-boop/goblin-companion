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
 * Extracts base item key (e.g. "i:1604" from "i:1604::1:13617:1:9:30").
 */
function extractBaseKey(itemString: string): string {
  if (!itemString) return ''
  const m = itemString.match(/^(i:\d+)/i) || itemString.match(/^(p:\d+)/i) || itemString.match(/^(\d+)$/)
  if (m) return m[1].toLowerCase()
  return itemString.split(':')[0].toLowerCase()
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
 * Used as a fallback when Django backend is unreachable.
 * Dynamically parses column headers (itemString, stackSize, quantity, price, otherPlayer, player, time, source),
 * supports quote-safe realm keys (e.g. Kel'Thuzad, Quel'Thalas), escaped literal \n sequences,
 * base item key matching across bonus IDs, and calculates exact auction post counts per sale from csvExpired / csvCancelled.
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

    // Quote-safe capture of accounting blocks, allowing single quotes in realm names (e.g. Kel'Thuzad)
    const salesRegex = /\[(?:"([^"]*csvSales[^"]*)"|'([^']*csvSales[^']*)')\]\s*=\s*(?:"([^"]*)"|'([^']*)'|\{(.*?)\})/gs
    const buysRegex = /\[(?:"([^"]*csvBuys[^"]*)"|'([^']*csvBuys[^']*)')\]\s*=\s*(?:"([^"]*)"|'([^']*)'|\{(.*?)\})/gs
    const expiredRegex = /\[(?:"([^"]*csvExpired[^"]*)"|'([^']*csvExpired[^']*)')\]\s*=\s*(?:"([^"]*)"|'([^']*)'|\{(.*?)\})/gs
    const cancelledRegex = /\[(?:"([^"]*csvCancelled[^"]*)"|'([^']*csvCancelled[^']*)')\]\s*=\s*(?:"([^"]*)"|'([^']*)'|\{(.*?)\})/gs

    const salesMatches = Array.from(content.matchAll(salesRegex))
    const buysMatches = Array.from(content.matchAll(buysRegex))
    const expiredMatches = Array.from(content.matchAll(expiredRegex))
    const cancelledMatches = Array.from(content.matchAll(cancelledRegex))

    // Index Expired + Cancelled post timestamps for computing postsBeforeSale
    const postTimestampsByItem: Record<string, number[]> = {}

    const indexPostMatches = (matches: RegExpMatchArray[]): void => {
      for (const m of matches) {
        const str = m[3] || m[4] || m[5]
        if (!str) continue

        const lines = str.split(/\\n|\r?\n/)
        if (lines.length <= 1) continue

        const headerLine = cleanStr(lines[0])
        const headers = headerLine.split(',').map((h) => cleanStr(h).toLowerCase())

        const itemIdx = headers.indexOf('itemstring')
        const timeIdx = headers.indexOf('time')

        for (let i = 1; i < lines.length; i++) {
          const line = cleanStr(lines[i])
          if (!line) continue
          const parts = line.split(',')
          if (parts.length < 3) continue

          const itemString = cleanStr(parts[itemIdx !== -1 ? itemIdx : 0])
          const time = parseInt(cleanStr(parts[timeIdx !== -1 ? timeIdx : 4]), 10) || 0

          if (!itemString || time <= 0) continue

          const baseKey = extractBaseKey(itemString)

          if (!postTimestampsByItem[itemString]) postTimestampsByItem[itemString] = []
          postTimestampsByItem[itemString].push(time)

          if (baseKey && baseKey !== itemString) {
            if (!postTimestampsByItem[baseKey]) postTimestampsByItem[baseKey] = []
            postTimestampsByItem[baseKey].push(time)
          }
        }
      }
    }

    indexPostMatches(expiredMatches)
    indexPostMatches(cancelledMatches)

    // Sort post timestamps ascending
    for (const key in postTimestampsByItem) {
      postTimestampsByItem[key].sort((a, b) => a - b)
    }

    // Parse Buy Records for FIFO cost matching
    const buysByItem: Record<string, RawBuyRecord[]> = {}
    for (const m of buysMatches) {
      const str = m[3] || m[4] || m[5]
      if (!str) continue

      const lines = str.split(/\\n|\r?\n/)
      if (lines.length <= 1) continue

      const headerLine = cleanStr(lines[0])
      const headers = headerLine.split(',').map((h) => cleanStr(h).toLowerCase())

      const itemIdx = headers.indexOf('itemstring')
      const stackIdx = headers.indexOf('stacksize')
      const qtyIdx = headers.indexOf('quantity')
      const priceIdx = headers.indexOf('price')
      const timeIdx = headers.indexOf('time')

      for (let i = 1; i < lines.length; i++) {
        const line = cleanStr(lines[i])
        if (!line) continue
        const parts = line.split(',')
        if (parts.length < 3) continue

        const itemString = cleanStr(parts[itemIdx !== -1 ? itemIdx : 0])
        const stackSize = parseInt(cleanStr(parts[stackIdx !== -1 ? stackIdx : 1]), 10) || 1
        const rawQty = parseInt(cleanStr(parts[qtyIdx !== -1 ? qtyIdx : 2]), 10) || 1
        const priceCopper = parseInt(cleanStr(parts[priceIdx !== -1 ? priceIdx : 3]), 10) || 0
        const time = parseInt(cleanStr(parts[timeIdx !== -1 ? timeIdx : 6]), 10) || 0

        if (!itemString || priceCopper <= 0) continue

        const totalQty = rawQty * stackSize
        const rec: RawBuyRecord = { itemString, priceCopper, quantity: totalQty, timestamp: time }
        const baseKey = extractBaseKey(itemString)

        if (!buysByItem[itemString]) buysByItem[itemString] = []
        buysByItem[itemString].push(rec)

        if (baseKey && baseKey !== itemString) {
          if (!buysByItem[baseKey]) buysByItem[baseKey] = []
          buysByItem[baseKey].push(rec)
        }
      }
    }

    // Sort buys by timestamp ascending for FIFO matching
    for (const key in buysByItem) {
      buysByItem[key].sort((a, b) => a.timestamp - b.timestamp)
    }

    // Parse Sales Records
    const rawSales: RecentSaleItemDto[] = []

    for (const m of salesMatches) {
      const key = m[1] || m[2] || ''
      const str = m[3] || m[4] || m[5]
      if (!str) continue

      const realmMatch = key.match(/r@([^@]+)@/i)
      const realm = realmMatch ? realmMatch[1] : undefined

      const lines = str.split(/\\n|\r?\n/)
      if (lines.length <= 1) continue

      const headerLine = cleanStr(lines[0])
      const headers = headerLine.split(',').map((h) => cleanStr(h).toLowerCase())

      const itemIdx = headers.indexOf('itemstring')
      const stackIdx = headers.indexOf('stacksize')
      const qtyIdx = headers.indexOf('quantity')
      const priceIdx = headers.indexOf('price')
      const buyerIdx = headers.indexOf('otherplayer')
      const timeIdx = headers.indexOf('time')
      const sourceIdx = headers.indexOf('source')

      for (let i = 1; i < lines.length; i++) {
        const line = cleanStr(lines[i])
        if (!line) continue
        const parts = line.split(',')
        if (parts.length < 4) continue

        const itemString = cleanStr(parts[itemIdx !== -1 ? itemIdx : 0])
        const stackSize = parseInt(cleanStr(parts[stackIdx !== -1 ? stackIdx : 1]), 10) || 1
        const rawQty = parseInt(cleanStr(parts[qtyIdx !== -1 ? qtyIdx : 2]), 10) || 1
        const sellPriceCopper = parseInt(cleanStr(parts[priceIdx !== -1 ? priceIdx : 3]), 10) || 0
        const buyer = cleanStr(parts[buyerIdx !== -1 ? buyerIdx : 4]) || undefined
        const sellTimeTs = parseInt(cleanStr(parts[timeIdx !== -1 ? timeIdx : 6]), 10) || 0
        const source = cleanStr(parts[sourceIdx !== -1 ? sourceIdx : 7])

        if (!itemString || sellPriceCopper <= 0) continue

        // Include Auction sales
        if (source.toLowerCase() !== 'auction' && source !== '') continue

        const totalQuantity = rawQty * stackSize
        const bId = extractBlizzardId(itemString)
        const itemName = bId ? `Item ${bId}` : itemString
        const baseKey = extractBaseKey(itemString)

        // Attempt FIFO buy matching by exact string or base key (prior to sale time)
        let buyPriceCopper = 0
        let buyTimeTs: number | undefined
        const buysList = buysByItem[itemString] || buysByItem[baseKey]
        if (buysList && buysList.length > 0) {
          const priorBuys = buysList.filter((b) => b.timestamp <= sellTimeTs)
          const matchedBuy = priorBuys.length > 0 ? priorBuys[priorBuys.length - 1] : buysList[0]
          buyPriceCopper = matchedBuy.priceCopper
          buyTimeTs = matchedBuy.timestamp
        }

        const netProfitCopper = (sellPriceCopper * totalQuantity) - (buyPriceCopper * totalQuantity)

        // Calculate postsBeforeSale from expired and cancelled history
        const allPosts = postTimestampsByItem[itemString] || postTimestampsByItem[baseKey] || []
        let postsBeforeSale = 1 // 1 for the sale posting itself
        const minTime = buyTimeTs || (sellTimeTs - (30 * 24 * 60 * 60)) // fallback to 30 days before sale

        for (const ts of allPosts) {
          if (ts >= minTime && ts <= sellTimeTs) {
            postsBeforeSale++
          }
        }

        rawSales.push({
          id: `local-${sellTimeTs}-${rawSales.length}`,
          itemId: itemString,
          blizzardId: bId,
          itemName,
          buyTimeTs: buysList && buysList[0] ? buysList[0].timestamp : undefined,
          boughtAt: buysList && buysList[0] ? formatTs(buysList[0].timestamp) : undefined,
          sellTimeTs,
          soldAt: formatTs(sellTimeTs),
          quantity: totalQuantity,
          buyPriceCopper,
          sellPriceCopper,
          postsBeforeSale,
          netProfitCopper,
          buyer,
          realm
        })
      }
    }

    // Sort sales by sell timestamp descending (newest sales first)
    rawSales.sort((a, b) => (b.sellTimeTs || 0) - (a.sellTimeTs || 0))

    const slicedSales = rawSales.slice(0, limit)

    // Compute totals specifically for the displayed sliced sales
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
