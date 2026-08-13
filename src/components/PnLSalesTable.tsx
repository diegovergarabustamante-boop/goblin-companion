import React, { useEffect, useState } from 'react'
import type { RecentSaleItemDto } from '../../electron/main/http-client'

export function CoinBadge({ copper }: { copper: number }) {
  const isNegative = copper < 0
  const absCopper = Math.abs(copper)
  const g = Math.floor(absCopper / 10000)
  const s = Math.floor((absCopper % 10000) / 100)
  const c = absCopper % 100

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontFamily: 'monospace, sans-serif',
        fontWeight: 700,
        fontSize: '0.9em',
        whiteSpace: 'nowrap'
      }}
    >
      {isNegative ? '-' : ''}
      {g > 0 && (
        <span style={{ color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          {g.toLocaleString()}
          <span
            title="Gold"
            style={{
              width: '13px', height: '13px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #fef08a 0%, #eab308 50%, #ca8a04 100%)',
              border: '1px solid #facc15', boxShadow: '0 0 3px rgba(250,204,21,0.4)',
              display: 'inline-block', flexShrink: 0
            }}
          />
        </span>
      )}
      {(s > 0 || g > 0) && (
        <span style={{ color: '#cbd5e1', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          {s}
          <span
            title="Silver"
            style={{
              width: '13px', height: '13px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 50%, #64748b 100%)',
              border: '1px solid #e2e8f0', boxShadow: '0 0 3px rgba(226,232,240,0.4)',
              display: 'inline-block', flexShrink: 0
            }}
          />
        </span>
      )}
      <span style={{ color: '#f97316', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
        {c}
        <span
          title="Copper"
          style={{
            width: '13px', height: '13px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #ffedd5 0%, #f97316 50%, #c2410c 100%)',
            border: '1px solid #fb923c', boxShadow: '0 0 3px rgba(249,115,22,0.4)',
            display: 'inline-block', flexShrink: 0
          }}
        />
      </span>
    </span>
  )
}

export function PnLSalesTable() {
  const [sales, setSales] = useState<RecentSaleItemDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [totalRev, setTotalRev] = useState(0)
  const [totalCost, setTotalCost] = useState(0)
  const [totalProfit, setTotalProfit] = useState(0)

  // Load Wowhead power.js — same script as the web page uses
  useEffect(() => {
    ;(window as unknown as { whTooltips?: Record<string, unknown> }).whTooltips = {
      colorLinks: true,
      iconizeLinks: true,
      renameLinks: true
    }
    if (!document.getElementById('wowhead-power')) {
      const script = document.createElement('script')
      script.id = 'wowhead-power'
      script.src = 'https://wow.zamimg.com/widgets/power.js'
      script.async = true
      document.body.appendChild(script)
    }
  }, [])

  const refreshWowhead = () => {
    const wh = window as unknown as { $WowheadPower?: { refreshLinks?: () => void } }
    if (wh.$WowheadPower?.refreshLinks) {
      wh.$WowheadPower.refreshLinks()
    }
  }

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
          setTimeout(refreshWowhead, 400)
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
    padding: '12px 14px',
    width,
    textAlign,
    color: '#fbbf24',
    fontFamily: 'var(--font-header, sans-serif)',
    letterSpacing: '0.04em',
    borderRight: isLast ? 'none' : '1px solid rgba(251,191,36,0.35)',
    borderBottom: '1px solid rgba(251,191,36,0.35)',
    whiteSpace: 'nowrap'
  })

  const tdStyle = (textAlign: 'left' | 'center' | 'right', isLast = false): React.CSSProperties => ({
    padding: '10px 14px',
    textAlign,
    borderRight: isLast ? 'none' : '1px solid rgba(255,255,255,0.08)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(6,78,59,0.2) 100%)', border: '1px solid rgba(16,185,129,0.3)' }}>
          <img src="/images/goblin_assets/coin_badge_1.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total Revenue</div>
            <div style={{ fontSize: '1.05em', marginTop: '2px' }}><CoinBadge copper={totalRev} /></div>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', background: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(120,53,15,0.2) 100%)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <img src="/images/goblin_assets/coin_badge_1.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total Cost</div>
            <div style={{ fontSize: '1.05em', marginTop: '2px' }}><CoinBadge copper={totalCost} /></div>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', background: totalProfit >= 0 ? 'linear-gradient(135deg, rgba(52,211,153,0.15) 0%, rgba(4,120,87,0.25) 100%)' : 'linear-gradient(135deg, rgba(248,113,113,0.15) 0%, rgba(153,27,27,0.25) 100%)', border: totalProfit >= 0 ? '1.5px solid rgba(52,211,153,0.4)' : '1.5px solid rgba(248,113,113,0.4)' }}>
          <img src={totalProfit >= 0 ? '/images/goblin_assets/success.png' : '/images/goblin_assets/clear.png'} alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Net Profit / Loss</div>
            <div style={{ fontSize: '1.05em', marginTop: '2px', color: totalProfit >= 0 ? '#4ade80' : '#f87171' }}><CoinBadge copper={totalProfit} /></div>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', background: 'linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(88,28,135,0.2) 100%)', border: '1px solid rgba(168,85,247,0.3)' }}>
          <img src="/images/goblin_assets/icon_inventory.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Sales Records</div>
            <div style={{ fontSize: '1.2em', fontWeight: 700, color: '#c084fc', marginTop: '2px' }}>{sales.length} items</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <section className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '16px' }}>
          <input
            type="text"
            className="input"
            placeholder="Search sold items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '8px 14px', fontSize: '0.88em', maxWidth: '380px', flex: 1 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.8em', color: '#94a3b8' }}>
              Showing {filteredSales.length} of {sales.length} recent sales
            </span>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void loadSales()}
              disabled={loading}
              style={{ padding: '8px 14px', fontSize: '0.85em' }}
            >
              <img src="/images/goblin_assets/sync.png" alt="" style={{ width: 16, height: 16, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', color: '#f87171', fontSize: '0.88em', marginBottom: '16px' }}>
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '0.92em' }}>
            🔄 Loading last 100 sales from TSM Accounting...
          </div>
        ) : filteredSales.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '0.92em' }}>
            No sales records found. Sync your <code>TradeSkillMaster.lua</code> to populate sales.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.25)' }}>
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
                  const bId = sale.blizzardId ||
                    (sale.itemId ? parseInt(sale.itemId.replace(/\D/g, ''), 10) : null)
                  const wowUrl = bId ? `https://www.wowhead.com/item=${bId}` : null

                  return (
                    <tr
                      key={sale.id || index}
                      style={{
                        background: index % 2 === 0 ? 'rgba(15,10,5,0.45)' : 'rgba(25,18,9,0.65)',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(251,191,36,0.1)' }}
                      onMouseOut={(e) => { e.currentTarget.style.background = index % 2 === 0 ? 'rgba(15,10,5,0.45)' : 'rgba(25,18,9,0.65)' }}
                    >
                      {/* Item Name — pure Wowhead link, let power.js handle icon + color */}
                      <td style={tdStyle('left')}>
                        {wowUrl && bId ? (
                          <a
                            href={wowUrl}
                            data-wowhead={`item=${bId}`}
                            onClick={(e) => {
                              e.preventDefault()
                              if (window.goblin?.openExternal) {
                                void window.goblin.openExternal(wowUrl)
                              }
                            }}
                            style={{ textDecoration: 'none', fontWeight: 600 }}
                          >
                            {sale.itemName}
                            {sale.quantity > 1 && (
                              <span style={{ color: '#fbbf24', fontSize: '0.85em', marginLeft: '5px' }}>
                                x{sale.quantity}
                              </span>
                            )}
                          </a>
                        ) : (
                          <span style={{ fontWeight: 600, color: '#f1f5f9' }}>
                            {sale.itemName}
                            {sale.quantity > 1 && (
                              <span style={{ color: '#fbbf24', fontSize: '0.85em', marginLeft: '5px' }}>
                                x{sale.quantity}
                              </span>
                            )}
                          </span>
                        )}
                      </td>

                      <td style={{ ...tdStyle('center'), color: '#94a3b8', fontSize: '0.85em' }}>
                        {sale.soldAt || 'Unknown'}
                      </td>

                      <td style={tdStyle('center')}>
                        <span style={{
                          display: 'inline-block', padding: '3px 8px', borderRadius: '6px',
                          fontSize: '0.82em', fontWeight: 700,
                          background: sale.postsBeforeSale > 5 ? 'rgba(245,158,11,0.15)' : 'rgba(96,165,250,0.15)',
                          color: sale.postsBeforeSale > 5 ? '#fbbf24' : '#60a5fa',
                          border: sale.postsBeforeSale > 5 ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(96,165,250,0.3)'
                        }}>
                          {sale.postsBeforeSale} {sale.postsBeforeSale === 1 ? 'post' : 'posts'}
                        </span>
                      </td>

                      <td style={tdStyle('center')}><CoinBadge copper={sale.buyPriceCopper} /></td>
                      <td style={tdStyle('center')}><CoinBadge copper={sale.sellPriceCopper} /></td>

                      <td style={{
                        ...tdStyle('center', true),
                        fontWeight: 700,
                        color: isProfit ? '#4ade80' : '#f87171',
                        background: isProfit ? 'rgba(74,222,128,0.05)' : 'rgba(248,113,113,0.05)'
                      }}>
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
