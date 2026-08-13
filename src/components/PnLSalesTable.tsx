import React, { useEffect, useState } from 'react'
import type { RecentSaleItemDto } from '../../electron/main/http-client'

// ─── Local Timezone Formatter ───────────────────────────────────────────
function formatLocalDateTime(ts?: number, fallbackStr?: string): string {
  if (ts && ts > 0) {
    const dt = new Date(ts * 1000)
    if (!isNaN(dt.getTime())) {
      const year = dt.getFullYear()
      const month = String(dt.getMonth() + 1).padStart(2, '0')
      const day = String(dt.getDate()).padStart(2, '0')
      const hours = String(dt.getHours()).padStart(2, '0')
      const minutes = String(dt.getMinutes()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}`
    }
  }
  return fallbackStr || 'N/A'
}

// ─── Coin Badge ──────────────────────────────────────────────────────────────
export function CoinBadge({ copper, fontSize = '0.98em' }: { copper: number; fontSize?: string }) {
  const isNegative = copper < 0
  const absCopper = Math.abs(copper)
  const g = Math.floor(absCopper / 10000)
  const s = Math.floor((absCopper % 10000) / 100)
  const c = absCopper % 100

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'monospace', fontWeight: 700, fontSize, whiteSpace: 'nowrap' }}>
      {isNegative ? '-' : ''}
      {g > 0 && (
        <span style={{ color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          {g.toLocaleString()}
          <span title="Gold" style={{ width: 13, height: 13, borderRadius: '50%', background: 'linear-gradient(135deg,#fef08a 0%,#eab308 50%,#ca8a04 100%)', border: '1px solid #facc15', display: 'inline-block', flexShrink: 0 }} />
        </span>
      )}
      {(s > 0 || g > 0) && (
        <span style={{ color: '#cbd5e1', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          {s}
          <span title="Silver" style={{ width: 13, height: 13, borderRadius: '50%', background: 'linear-gradient(135deg,#ffffff 0%,#cbd5e1 50%,#64748b 100%)', border: '1px solid #e2e8f0', display: 'inline-block', flexShrink: 0 }} />
        </span>
      )}
      <span style={{ color: '#f97316', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
        {c}
        <span title="Copper" style={{ width: 13, height: 13, borderRadius: '50%', background: 'linear-gradient(135deg,#ffedd5 0%,#f97316 50%,#c2410c 100%)', border: '1px solid #fb923c', display: 'inline-block', flexShrink: 0 }} />
      </span>
    </span>
  )
}

// ─── Official WoW Quality Colors ──────────────────────────────────────────────
const WOW_QUALITY_COLORS: Record<number, string> = {
  0: '#9d9d9d', // Poor (Gray)
  1: '#ffffff', // Common (White)
  2: '#1eff00', // Uncommon (Green)
  3: '#0070dd', // Rare (Blue)
  4: '#a335ee', // Epic (Purple)
  5: '#ff8000', // Legendary (Orange)
  6: '#e6cc80', // Artifact (Gold)
  7: '#00ccff'  // Heirloom (Cyan)
}

interface ItemMeta {
  quality: number
  iconUrl: string
  name?: string
}

const itemMetaCache: Record<number, ItemMeta> = {}

function WowItemLinkCell({
  blizzardId,
  itemName,
  quantity
}: {
  blizzardId: number | null
  itemName: string
  quantity: number
}) {
  const [meta, setMeta] = useState<ItemMeta | null>(
    blizzardId && itemMetaCache[blizzardId] ? itemMetaCache[blizzardId] : null
  )

  useEffect(() => {
    if (!blizzardId || itemMetaCache[blizzardId]) return
    let active = true

    if (window.goblin?.getItemTooltip) {
      window.goblin.getItemTooltip(blizzardId).then((res) => {
        if (active && res) {
          const itemMeta: ItemMeta = {
            quality: typeof res.quality === 'number' ? res.quality : 2,
            iconUrl: res.iconUrl || './images/goblin_assets/icon_inventory.png',
            name: res.name || ''
          }
          itemMetaCache[blizzardId] = itemMeta
          setMeta(itemMeta)

          // Refresh Wowhead tooltips binding after DOM update
          setTimeout(() => {
            const wh = window as unknown as { $WowheadPower?: { refreshLinks?: () => void } }
            wh.$WowheadPower?.refreshLinks?.()
          }, 150)
        }
      })
    }

    return () => {
      active = false
    }
  }, [blizzardId])

  const qualityColor = meta ? (WOW_QUALITY_COLORS[meta.quality] || '#1eff00') : '#1eff00'
  const iconUrl = meta?.iconUrl || './images/goblin_assets/icon_inventory.png'
  const wowUrl = blizzardId ? `https://www.wowhead.com/item=${blizzardId}` : null

  const isGenericName = /^Item\s+\d+$/i.test(itemName) || /^i:\d+/i.test(itemName) || itemName === String(blizzardId)
  const displayName = (isGenericName && meta?.name) ? meta.name : (meta?.name || itemName)

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', overflow: 'hidden' }}>
      <img
        src={iconUrl}
        alt=""
        style={{
          width: 22,
          height: 22,
          borderRadius: 4,
          border: `1px solid ${qualityColor}aa`,
          boxShadow: `0 0 4px ${qualityColor}33`,
          objectFit: 'cover',
          flexShrink: 0,
          background: '#0a0d14'
        }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {wowUrl && blizzardId ? (
          <a
            href={wowUrl}
            data-wowhead={`item=${blizzardId}`}
            className={`q q${meta?.quality ?? 2}`}
            onClick={(e) => {
              e.preventDefault()
              if (window.goblin?.openExternal) void window.goblin.openExternal(wowUrl)
            }}
            style={{
              color: qualityColor,
              fontWeight: 700,
              textDecoration: 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textShadow: `0 0 6px ${qualityColor}44`,
              transition: 'filter 0.15s ease'
            }}
            onMouseOver={(e) => (e.currentTarget.style.filter = 'brightness(1.35)')}
            onMouseOut={(e) => (e.currentTarget.style.filter = 'none')}
          >
            {displayName}
          </a>
        ) : (
          <span style={{ fontWeight: 700, color: qualityColor }}>{displayName}</span>
        )}
        {quantity > 1 && (
          <span style={{ color: '#fbbf24', fontSize: '0.85em', marginLeft: '5px', fontWeight: 700 }}>
            x{quantity}
          </span>
        )}
      </span>
    </div>
  )
}

// ─── Column Configuration ───────────────────────────────────────────────────
export interface PnLColumnDef {
  id: 'item' | 'buyer' | 'realm' | 'buyDate' | 'sellDate' | 'posts' | 'buyPrice' | 'sellPrice' | 'netProfit'
  label: string
  visible: boolean
  widthPercent: number
}

const DEFAULT_COLUMNS: PnLColumnDef[] = [
  { id: 'item', label: 'Item Name', visible: true, widthPercent: 18 },
  { id: 'buyer', label: 'Bought By', visible: true, widthPercent: 11 },
  { id: 'realm', label: 'Realm', visible: true, widthPercent: 11 },
  { id: 'buyDate', label: 'Buy Date', visible: true, widthPercent: 10 },
  { id: 'sellDate', label: 'Sell Date', visible: true, widthPercent: 10 },
  { id: 'posts', label: 'Posts', visible: true, widthPercent: 6 },
  { id: 'buyPrice', label: 'Buy Price', visible: true, widthPercent: 11 },
  { id: 'sellPrice', label: 'Sell Price', visible: true, widthPercent: 11 },
  { id: 'netProfit', label: 'Net Profit', visible: true, widthPercent: 12 }
]

const STORAGE_KEY = 'goblin_pnl_columns_config'

function loadSavedColumns(): PnLColumnDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_COLUMNS
    const parsed = JSON.parse(raw) as PnLColumnDef[]
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_COLUMNS
    // Ensure all default columns exist even if saved config is outdated
    const savedIds = new Set(parsed.map((c) => c.id))
    const missing = DEFAULT_COLUMNS.filter((c) => !savedIds.has(c.id))
    return [...parsed, ...missing]
  } catch {
    return DEFAULT_COLUMNS
  }
}

// ─── Deterministic Distinct Color Generator ─────────────────────────────────
function stringToColor(str?: string): string {
  if (!str) return '#94a3b8'
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  // Golden ratio angle multiplier (137.508°) guarantees max visual color distribution on the HSL wheel
  const hue = Math.abs(hash * 137.508) % 360
  return `hsl(${Math.round(hue)}, 78%, 75%)`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function refreshWowhead() {
  const wh = window as unknown as { $WowheadPower?: { refreshLinks?: () => void } }
  wh.$WowheadPower?.refreshLinks?.()
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

  // Column customization state
  const [columns, setColumns] = useState<PnLColumnDef[]>(loadSavedColumns)
  const [showColMenu, setShowColMenu] = useState(false)

  // Save column config on change
  const updateColumns = (newCols: PnLColumnDef[]) => {
    setColumns(newCols)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newCols))
    } catch {
      // Ignore storage write errors
    }
  }

  const toggleColumnVisibility = (id: PnLColumnDef['id']) => {
    const updated = columns.map((col) =>
      col.id === id ? { ...col, visible: !col.visible } : col
    )
    updateColumns(updated)
  }

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= columns.length) return
    const updated = [...columns]
    const temp = updated[index]
    updated[index] = updated[targetIndex]
    updated[targetIndex] = temp
    updateColumns(updated)
  }

  const resetColumns = () => {
    updateColumns(DEFAULT_COLUMNS)
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
          // Let Wowhead process all newly rendered links
          setTimeout(refreshWowhead, 300)
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

  // Refresh Wowhead every time sales list renders
  useEffect(() => {
    if (sales.length > 0) setTimeout(refreshWowhead, 250)
  }, [sales, columns])

  const filteredSales = sales.filter((s) => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    const matchesName = s.itemName.toLowerCase().includes(q)
    const matchesBuyer = s.buyer ? s.buyer.toLowerCase().includes(q) : false
    const matchesRealm = s.realm ? s.realm.toLowerCase().includes(q) : false
    return matchesName || matchesBuyer || matchesRealm
  })

  // Visible columns & scaling widths
  const visibleCols = columns.filter((c) => c.visible)
  const totalWeight = visibleCols.reduce((sum, c) => sum + c.widthPercent, 0) || 1

  const getColWidth = (col: PnLColumnDef): string => {
    return `${((col.widthPercent / totalWeight) * 100).toFixed(1)}%`
  }

  const thStyle = (textAlign: 'left' | 'center' | 'right', width: string, isLast = false): React.CSSProperties => ({
    padding: '12px 8px', width, textAlign, color: '#fbbf24',
    fontFamily: 'var(--font-header, sans-serif)', letterSpacing: '0.04em',
    borderRight: isLast ? 'none' : '1px solid rgba(251,191,36,0.35)',
    borderBottom: '1px solid rgba(251,191,36,0.35)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  })

  const tdStyle = (textAlign: 'left' | 'center' | 'right', isLast = false): React.CSSProperties => ({
    padding: '10px 8px', textAlign,
    borderRight: isLast ? 'none' : '1px solid rgba(255,255,255,0.08)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  })

  // Render individual cell by column ID
  const renderTableCell = (
    colId: PnLColumnDef['id'],
    sale: RecentSaleItemDto,
    isLast: boolean,
    bId: number | null,
    isProfit: boolean
  ) => {
    switch (colId) {
      case 'item':
        return (
          <td key={colId} style={{ ...tdStyle('center', isLast), overflow: 'visible' }}>
            <WowItemLinkCell blizzardId={bId} itemName={sale.itemName} quantity={sale.quantity} />
          </td>
        )
      case 'buyer':
        return (
          <td
            key={colId}
            style={{
              ...tdStyle('center', isLast),
              color: sale.buyer ? stringToColor(sale.buyer) : '#64748b',
              fontWeight: 600
            }}
            title={sale.buyer ? `Bought by: ${sale.buyer}` : undefined}
          >
            {sale.buyer || <span style={{ color: '#64748b', fontStyle: 'italic', fontWeight: 400 }}>—</span>}
          </td>
        )
      case 'realm':
        return (
          <td
            key={colId}
            style={{
              ...tdStyle('center', isLast),
              color: sale.realm ? stringToColor(sale.realm) : '#64748b',
              fontWeight: 600
            }}
            title={sale.realm ? `Realm: ${sale.realm}` : undefined}
          >
            {sale.realm || <span style={{ color: '#64748b', fontStyle: 'italic', fontWeight: 400 }}>—</span>}
          </td>
        )
      case 'buyDate':
        return (
          <td key={colId} style={{ ...tdStyle('center', isLast), color: '#94a3b8', fontSize: '0.85em' }}>
            {formatLocalDateTime(sale.buyTimeTs, sale.boughtAt)}
          </td>
        )
      case 'sellDate':
        return (
          <td key={colId} style={{ ...tdStyle('center', isLast), color: '#94a3b8', fontSize: '0.85em' }}>
            {formatLocalDateTime(sale.sellTimeTs, sale.soldAt)}
          </td>
        )
      case 'posts':
        return (
          <td key={colId} style={tdStyle('center', isLast)}>
            <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: '0.82em', fontWeight: 700, background: sale.postsBeforeSale > 5 ? 'rgba(245,158,11,0.15)' : 'rgba(96,165,250,0.15)', color: sale.postsBeforeSale > 5 ? '#fbbf24' : '#60a5fa', border: sale.postsBeforeSale > 5 ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(96,165,250,0.3)' }}>
              {sale.postsBeforeSale} {sale.postsBeforeSale === 1 ? 'post' : 'posts'}
            </span>
          </td>
        )
      case 'buyPrice':
        return (
          <td key={colId} style={{ ...tdStyle('center', isLast), overflow: 'visible', whiteSpace: 'nowrap' }}>
            <CoinBadge copper={sale.buyPriceCopper} fontSize="1em" />
          </td>
        )
      case 'sellPrice':
        return (
          <td key={colId} style={{ ...tdStyle('center', isLast), overflow: 'visible', whiteSpace: 'nowrap' }}>
            <CoinBadge copper={sale.sellPriceCopper} fontSize="1em" />
          </td>
        )
      case 'netProfit':
        return (
          <td
            key={colId}
            style={{
              ...tdStyle('center', isLast),
              overflow: 'visible',
              whiteSpace: 'nowrap',
              fontWeight: 700,
              color: isProfit ? '#4ade80' : '#f87171',
              background: isProfit ? 'rgba(74,222,128,0.05)' : 'rgba(248,113,113,0.05)'
            }}
          >
            <CoinBadge copper={sale.netProfitCopper} fontSize="1.04em" />
          </td>
        )
      default:
        return null
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(135deg,rgba(16,185,129,0.12),rgba(6,78,59,0.2))', border: '1px solid rgba(16,185,129,0.3)' }}>
          <img src="./images/goblin_assets/coin_badge_1.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total Revenue</div>
            <div style={{ fontSize: '1.05em', marginTop: 2 }}><CoinBadge copper={totalRev} /></div>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(135deg,rgba(245,158,11,0.12),rgba(120,53,15,0.2))', border: '1px solid rgba(245,158,11,0.3)' }}>
          <img src="./images/goblin_assets/coin_badge_1.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total Cost</div>
            <div style={{ fontSize: '1.05em', marginTop: 2 }}><CoinBadge copper={totalCost} /></div>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, background: totalProfit >= 0 ? 'linear-gradient(135deg,rgba(52,211,153,0.15),rgba(4,120,87,0.25))' : 'linear-gradient(135deg,rgba(248,113,113,0.15),rgba(153,27,27,0.25))', border: totalProfit >= 0 ? '1.5px solid rgba(52,211,153,0.4)' : '1.5px solid rgba(248,113,113,0.4)' }}>
          <img src={totalProfit >= 0 ? './images/goblin_assets/success.png' : './images/goblin_assets/clear.png'} alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Net Profit / Loss</div>
            <div style={{ fontSize: '1.05em', marginTop: 2, color: totalProfit >= 0 ? '#4ade80' : '#f87171' }}><CoinBadge copper={totalProfit} /></div>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(135deg,rgba(168,85,247,0.12),rgba(88,28,135,0.2))', border: '1px solid rgba(168,85,247,0.3)' }}>
          <img src="./images/goblin_assets/icon_inventory.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Sales Records</div>
            <div style={{ fontSize: '1.2em', fontWeight: 700, color: '#c084fc', marginTop: 2 }}>{sales.length} items</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <section className="glass-panel" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, maxWidth: 540 }}>
            <input
              type="text"
              className="input"
              placeholder="Search items, buyers, or realms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: '8px 14px', fontSize: '0.88em', flex: 1 }}
            />

            {/* Column Customizer Button & Popover Menu */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setShowColMenu(!showColMenu)}
                style={{
                  padding: '8px 12px',
                  fontSize: '0.85em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderColor: showColMenu ? '#fbbf24' : undefined,
                  background: showColMenu ? 'rgba(251,191,36,0.15)' : undefined
                }}
                title="Configure and reorder table columns"
              >
                <span>⚙️ Columns</span>
                <span style={{ fontSize: '0.7em', opacity: 0.8 }}>{showColMenu ? '▲' : '▼'}</span>
              </button>

              {showColMenu && (
                <div
                  className="glass-panel"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    zIndex: 100,
                    width: 300,
                    padding: '14px 16px',
                    background: 'rgba(15, 10, 5, 0.96)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(251, 191, 36, 0.4)',
                    borderRadius: 10,
                    boxShadow: '0 12px 30px rgba(0,0,0,0.85)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(251,191,36,0.2)' }}>
                    <div style={{ fontWeight: 700, color: '#fbbf24', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>⚙️</span> Column Settings
                    </div>
                    <button
                      type="button"
                      onClick={resetColumns}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.78em', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Reset Default
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
                    {columns.map((col, idx) => (
                      <div
                        key={col.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justify: 'space-between',
                          padding: '6px 8px',
                          borderRadius: 6,
                          background: col.visible ? 'rgba(251,191,36,0.06)' : 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.06)'
                        }}
                      >
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85em', color: col.visible ? '#f8fafc' : '#64748b', flex: 1, userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={col.visible}
                            onChange={() => toggleColumnVisibility(col.id)}
                            style={{ accentColor: '#fbbf24', cursor: 'pointer' }}
                          />
                          <span>{col.label}</span>
                        </label>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => moveColumn(idx, 'up')}
                            disabled={idx === 0}
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              border: 'none',
                              borderRadius: 4,
                              color: idx === 0 ? '#475569' : '#fbbf24',
                              width: 24,
                              height: 24,
                              fontSize: '0.75em',
                              cursor: idx === 0 ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title="Move column up"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => moveColumn(idx, 'down')}
                            disabled={idx === columns.length - 1}
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              border: 'none',
                              borderRadius: 4,
                              color: idx === columns.length - 1 ? '#475569' : '#fbbf24',
                              width: 24,
                              height: 24,
                              fontSize: '0.75em',
                              cursor: idx === columns.length - 1 ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title="Move column down"
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => setShowColMenu(false)}
                      style={{ padding: '4px 12px', fontSize: '0.8em' }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.8em', color: '#94a3b8' }}>Showing {filteredSales.length} of {sales.length} recent sales</span>
            <button type="button" className="btn btn--secondary" onClick={() => void loadSales()} disabled={loading} style={{ padding: '8px 14px', fontSize: '0.85em' }}>
              <img src="./images/goblin_assets/sync.png" alt="" style={{ width: 16, height: 16, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
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
        ) : visibleCols.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#fbbf24' }}>
            ⚠️ All table columns are currently hidden. Click <strong>⚙️ Columns</strong> above to enable visible columns.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(251,191,36,0.25)', overflowY: 'visible' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88em', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: 'rgba(30,22,8,0.95)' }}>
                  {visibleCols.map((col, i) => (
                    <th
                      key={col.id}
                      style={thStyle('center', getColWidth(col), i === visibleCols.length - 1)}
                      title={col.label}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale, index) => {
                  const isProfit = sale.netProfitCopper >= 0
                  const bId = sale.blizzardId ||
                    (sale.itemId ? parseInt(sale.itemId.replace(/\D/g, ''), 10) : null)

                  return (
                    <tr
                      key={sale.id || index}
                      style={{ background: index % 2 === 0 ? 'rgba(15,10,5,0.45)' : 'rgba(25,18,9,0.65)', transition: 'background 0.15s ease' }}
                      onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(251,191,36,0.08)' }}
                      onMouseOut={(e) => { e.currentTarget.style.background = index % 2 === 0 ? 'rgba(15,10,5,0.45)' : 'rgba(25,18,9,0.65)' }}
                    >
                      {visibleCols.map((col, i) =>
                        renderTableCell(col.id, sale, i === visibleCols.length - 1, bId, isProfit)
                      )}
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

