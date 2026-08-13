import React, { useEffect, useState, useRef } from 'react'
import type { RecentSaleItemDto } from '../../electron/main/http-client'

// ─── Coin Badge ─────────────────────────────────────────────────────────────

export function CoinBadge({ copper }: { copper: number }) {
  const isNegative = copper < 0
  const absCopper = Math.abs(copper)
  const g = Math.floor(absCopper / 10000)
  const s = Math.floor((absCopper % 10000) / 100)
  const c = absCopper % 100

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9em', whiteSpace: 'nowrap' }}>
      {isNegative ? '-' : ''}
      {g > 0 && (
        <span style={{ color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          {g.toLocaleString()}
          <span style={{ width: 13, height: 13, borderRadius: '50%', background: 'linear-gradient(135deg,#fef08a 0%,#eab308 50%,#ca8a04 100%)', border: '1px solid #facc15', display: 'inline-block', flexShrink: 0 }} title="Gold" />
        </span>
      )}
      {(s > 0 || g > 0) && (
        <span style={{ color: '#cbd5e1', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          {s}
          <span style={{ width: 13, height: 13, borderRadius: '50%', background: 'linear-gradient(135deg,#ffffff 0%,#cbd5e1 50%,#64748b 100%)', border: '1px solid #e2e8f0', display: 'inline-block', flexShrink: 0 }} title="Silver" />
        </span>
      )}
      <span style={{ color: '#f97316', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
        {c}
        <span style={{ width: 13, height: 13, borderRadius: '50%', background: 'linear-gradient(135deg,#ffedd5 0%,#f97316 50%,#c2410c 100%)', border: '1px solid #fb923c', display: 'inline-block', flexShrink: 0 }} title="Copper" />
      </span>
    </span>
  )
}

// ─── Official Wowhead quality colors ────────────────────────────────────────
// Source: https://wowwiki-archive.fandom.com/wiki/API_ITEM_QUALITY_COLORS
const WOW_QUALITY_COLOR: Record<number, string> = {
  0: '#9d9d9d', // Poor
  1: '#ffffff', // Common
  2: '#1eff00', // Uncommon
  3: '#0070dd', // Rare
  4: '#a335ee', // Epic
  5: '#ff8000', // Legendary
  6: '#e6cc80', // Artifact
  7: '#00ccff', // Heirloom
}

interface ItemTooltipData {
  quality: number
  iconUrl: string
}

// Simple in-memory cache so we never fetch the same item twice per session
const tooltipCache: Record<number, ItemTooltipData | 'pending' | 'error'> = {}

function useItemTooltip(blizzardId: number | null): ItemTooltipData | null {
  const [data, setData] = useState<ItemTooltipData | null>(() => {
    if (!blizzardId) return null
    const cached = tooltipCache[blizzardId]
    return cached && cached !== 'pending' && cached !== 'error' ? cached : null
  })

  useEffect(() => {
    if (!blizzardId) return
    if (tooltipCache[blizzardId] && tooltipCache[blizzardId] !== 'pending') {
      const cached = tooltipCache[blizzardId]
      if (cached !== 'error') setData(cached as ItemTooltipData)
      return
    }
    if (tooltipCache[blizzardId] === 'pending') return

    tooltipCache[blizzardId] = 'pending'
    let active = true

    fetch(`https://nether.wowhead.com/tooltip/item/${blizzardId}?dataEnv=4&locale=0`)
      .then((r) => r.json())
      .then((body) => {
        if (!active) return
        const quality = typeof body?.quality === 'number' ? body.quality : 1
        const iconName: string = body?.icon ?? ''
        const iconUrl = iconName
          ? `https://wow.zamimg.com/images/wow/icons/medium/${iconName}.jpg`
          : ''
        const result: ItemTooltipData = { quality, iconUrl }
        tooltipCache[blizzardId!] = result
        setData(result)
      })
      .catch(() => {
        if (!active) return
        tooltipCache[blizzardId!] = 'error'
      })

    return () => { active = false }
  }, [blizzardId])

  return data
}

// ─── Tooltip popup rendered next to the hovered cell ────────────────────────
function WowTooltip({ blizzardId, visible }: { blizzardId: number; visible: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 9999,
        bottom: '110%',
        left: 0,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.15s ease',
        whiteSpace: 'nowrap'
      }}
    >
      <iframe
        src={`https://www.wowhead.com/item=${blizzardId}&domain=wow`}
        style={{ border: 'none', width: 0, height: 0, pointerEvents: 'none' }}
        title=""
      />
    </div>
  )
}

// ─── Item Name cell ──────────────────────────────────────────────────────────
function ItemCell({ sale, blizzardId }: { sale: RecentSaleItemDto; blizzardId: number | null }) {
  const tip = useItemTooltip(blizzardId)
  const [hovered, setHovered] = useState(false)
  const color = tip ? (WOW_QUALITY_COLOR[tip.quality] ?? '#ffffff') : '#cbd5e1'
  const wowUrl = blizzardId ? `https://www.wowhead.com/item=${blizzardId}` : null

  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', maxWidth: '100%', overflow: 'hidden', position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Item icon */}
      {tip?.iconUrl ? (
        <img
          src={tip.iconUrl}
          alt=""
          style={{
            width: 22, height: 22, borderRadius: 3, flexShrink: 0,
            border: `1px solid ${color}55`,
            objectFit: 'cover'
          }}
        />
      ) : (
        <div style={{ width: 22, height: 22, borderRadius: 3, flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }} />
      )}

      {/* Item name */}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {wowUrl ? (
          <a
            href={wowUrl}
            onClick={(e) => {
              e.preventDefault()
              if (window.goblin?.openExternal) void window.goblin.openExternal(wowUrl)
            }}
            style={{
              color,
              fontWeight: 700,
              textDecoration: 'none',
              textShadow: hovered ? `0 0 6px ${color}88` : 'none',
              transition: 'text-shadow 0.15s ease'
            }}
          >
            {sale.itemName}
          </a>
        ) : (
          <span style={{ color, fontWeight: 700 }}>{sale.itemName}</span>
        )}
        {sale.quantity > 1 && (
          <span style={{ color: '#fbbf24', fontSize: '0.84em', marginLeft: 5, fontWeight: 700 }}>
            x{sale.quantity}
          </span>
        )}
      </span>

      {/* Wowhead-style tooltip popup on hover */}
      {blizzardId && hovered && (
        <div
          style={{
            position: 'absolute',
            bottom: '120%',
            left: 0,
            zIndex: 9999,
            background: 'linear-gradient(180deg, #24232a 0%, #1a1922 100%)',
            border: `1px solid ${color}66`,
            borderRadius: 6,
            padding: '8px 12px',
            minWidth: 180,
            boxShadow: `0 4px 24px rgba(0,0,0,0.8), 0 0 12px ${color}22`,
            pointerEvents: 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            {tip?.iconUrl && (
              <img src={tip.iconUrl} alt="" style={{ width: 32, height: 32, borderRadius: 4, border: `1px solid ${color}88` }} />
            )}
            <span style={{ color, fontWeight: 700, fontSize: '0.95em' }}>{sale.itemName}</span>
          </div>
          <div style={{ color: '#94a3b8', fontSize: '0.78em' }}>
            {tip ? (
              <>
                <div>
                  Quality:{' '}
                  <span style={{ color }}>
                    {['Poor', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Artifact', 'Heirloom'][tip.quality] ?? 'Unknown'}
                  </span>
                </div>
                <div style={{ marginTop: 2, color: '#64748b' }}>Item #{blizzardId}</div>
              </>
            ) : (
              <span>Loading…</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Table ──────────────────────────────────────────────────────────────

export function PnLSalesTable() {
  const [sales, setSales] = useState<RecentSaleItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [totalRev, setTotalRev] = useState(0)
  const [totalCost, setTotalCost] = useState(0)
  const [totalProfit, setTotalProfit] = useState(0)

  const loadSales = async () => {
    setLoading(true)
    setError(null)
    try {
      if (window.goblin && typeof window.goblin.getRecentSales === 'function') {
        const res = await window.goblin.getRecentSales(100)
        if (res.ok && res.sales) {
          setSales(res.sales)
          setTotalRev(res.totalRevenueCopper ?? 0)
          setTotalCost(res.totalCostCopper ?? 0)
          setTotalProfit(res.totalProfitCopper ?? 0)
        } else {
          setError(res.error ?? 'Could not fetch sales history from TSM Accounting.')
        }
      } else {
        setError('Goblin IPC client not available.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadSales() }, [])

  const filteredSales = sales.filter((s) =>
    s.itemName.toLowerCase().includes(searchQuery.toLowerCase().trim())
  )

  const thStyle = (textAlign: 'left' | 'center' | 'right', width: string, isLast = false): React.CSSProperties => ({
    padding: '12px 14px', width, textAlign, color: '#fbbf24',
    fontFamily: 'var(--font-header, sans-serif)', letterSpacing: '0.04em',
    borderRight: isLast ? 'none' : '1px solid rgba(251,191,36,0.35)',
    borderBottom: '1px solid rgba(251,191,36,0.35)',
    whiteSpace: 'nowrap'
  })

  const tdStyle = (textAlign: 'left' | 'center' | 'right', isLast = false): React.CSSProperties => ({
    padding: '10px 14px', textAlign,
    borderRight: isLast ? 'none' : '1px solid rgba(255,255,255,0.08)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {[
          { label: 'Total Revenue', value: totalRev, img: '/images/goblin_assets/coin_badge_1.png', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)' },
          { label: 'Total Cost', value: totalCost, img: '/images/goblin_assets/coin_badge_1.png', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
        ].map(({ label, value, img, bg, border }) => (
          <div key={label} className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, background: `linear-gradient(135deg, ${bg} 0%, rgba(0,0,0,0.2) 100%)`, border: `1px solid ${border}` }}>
            <img src={img} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
            <div>
              <div style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: '1.05em', marginTop: 2 }}><CoinBadge copper={value} /></div>
            </div>
          </div>
        ))}
        <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, background: totalProfit >= 0 ? 'linear-gradient(135deg,rgba(52,211,153,0.15),rgba(4,120,87,0.25))' : 'linear-gradient(135deg,rgba(248,113,113,0.15),rgba(153,27,27,0.25))', border: totalProfit >= 0 ? '1.5px solid rgba(52,211,153,0.4)' : '1.5px solid rgba(248,113,113,0.4)' }}>
          <img src={totalProfit >= 0 ? '/images/goblin_assets/success.png' : '/images/goblin_assets/clear.png'} alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Net Profit / Loss</div>
            <div style={{ fontSize: '1.05em', marginTop: 2, color: totalProfit >= 0 ? '#4ade80' : '#f87171' }}><CoinBadge copper={totalProfit} /></div>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(135deg,rgba(168,85,247,0.12),rgba(88,28,135,0.2))', border: '1px solid rgba(168,85,247,0.3)' }}>
          <img src="/images/goblin_assets/icon_inventory.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Sales Records</div>
            <div style={{ fontSize: '1.2em', fontWeight: 700, color: '#c084fc', marginTop: 2 }}>{sales.length} items</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <section className="glass-panel" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <input type="text" className="input" placeholder="Search sold items..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ padding: '8px 14px', fontSize: '0.88em', maxWidth: 380, flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.8em', color: '#94a3b8' }}>Showing {filteredSales.length} of {sales.length} recent sales</span>
            <button type="button" className="btn btn--secondary" onClick={() => void loadSales()} disabled={loading} style={{ padding: '8px 14px', fontSize: '0.85em' }}>
              <img src="/images/goblin_assets/sync.png" alt="" style={{ width: 16, height: 16, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, color: '#f87171', fontSize: '0.88em', marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>🔄 Loading last 100 sales from TSM Accounting...</div>
        ) : filteredSales.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            No sales records found. Sync your <code>TradeSkillMaster.lua</code> to populate sales.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(251,191,36,0.25)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88em', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: 'rgba(30,22,8,0.95)' }}>
                  <th style={thStyle('left', '32%')}>Item Name</th>
                  <th style={thStyle('center', '16%')}>Date / Time</th>
                  <th style={thStyle('center', '14%')}>Posts Before Sale</th>
                  <th style={thStyle('center', '13%')}>Buy Price</th>
                  <th style={thStyle('center', '13%')}>Sell Price</th>
                  <th style={thStyle('center', '12%', true)}>Net Profit / Loss</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale, index) => {
                  const isProfit = sale.netProfitCopper >= 0
                  const bId = sale.blizzardId || (sale.itemId ? parseInt(sale.itemId.replace(/\D/g, ''), 10) : null)

                  return (
                    <tr
                      key={sale.id || index}
                      style={{ background: index % 2 === 0 ? 'rgba(15,10,5,0.45)' : 'rgba(25,18,9,0.65)', transition: 'background 0.15s ease' }}
                      onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(251,191,36,0.08)' }}
                      onMouseOut={(e) => { e.currentTarget.style.background = index % 2 === 0 ? 'rgba(15,10,5,0.45)' : 'rgba(25,18,9,0.65)' }}
                    >
                      <td style={{ ...tdStyle('left'), overflow: 'visible' }}>
                        <ItemCell sale={sale} blizzardId={bId} />
                      </td>
                      <td style={{ ...tdStyle('center'), color: '#94a3b8', fontSize: '0.85em' }}>{sale.soldAt || 'Unknown'}</td>
                      <td style={tdStyle('center')}>
                        <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: '0.82em', fontWeight: 700, background: sale.postsBeforeSale > 5 ? 'rgba(245,158,11,0.15)' : 'rgba(96,165,250,0.15)', color: sale.postsBeforeSale > 5 ? '#fbbf24' : '#60a5fa', border: sale.postsBeforeSale > 5 ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(96,165,250,0.3)' }}>
                          {sale.postsBeforeSale} {sale.postsBeforeSale === 1 ? 'post' : 'posts'}
                        </span>
                      </td>
                      <td style={tdStyle('center')}><CoinBadge copper={sale.buyPriceCopper} /></td>
                      <td style={tdStyle('center')}><CoinBadge copper={sale.sellPriceCopper} /></td>
                      <td style={{ ...tdStyle('center', true), fontWeight: 700, color: isProfit ? '#4ade80' : '#f87171', background: isProfit ? 'rgba(74,222,128,0.05)' : 'rgba(248,113,113,0.05)' }}>
                        <CoinBadge copper={sale.netProfitCopper} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
