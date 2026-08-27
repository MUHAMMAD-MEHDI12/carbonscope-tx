import { useState } from 'react'

/**
 * Card wrapper for every chart: title/subtitle, optional actions, and a
 * chart ⇄ table toggle — the table view is the accessibility relief channel
 * (every value readable without color or hover).
 */
export function ChartCard({ title, sub, table, children, actions, className = '' }) {
  const [showTable, setShowTable] = useState(false)
  return (
    <div className={'card ' + className}>
      <div className="card-head">
        <div className="titles">
          <h3>{title}</h3>
          {sub ? <div className="sub">{sub}</div> : null}
        </div>
        <div className="card-actions">
          {actions}
          {table ? (
            <button
              className={'mini-btn' + (showTable ? ' on' : '')}
              onClick={() => setShowTable((v) => !v)}
              title="Toggle table view"
            >
              {showTable ? 'Chart' : 'Table'}
            </button>
          ) : null}
        </div>
      </div>
      {showTable && table ? <DataTable {...table} /> : children}
    </div>
  )
}

/** Generic table used by the table-view toggle. columns: [{key, label, num, fmt}] */
export function DataTable({ columns, rows }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.num ? 'num' : ''}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? 'num' : ''}>
                  {c.fmt ? c.fmt(r[c.key], r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Custom Recharts tooltip — values lead (bold, tabular), names follow,
 * series keyed by a short color stroke.
 */
export function VizTooltip({ active, payload, label, valueFmt, labelFmt }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="viz-tooltip">
      {label !== undefined && label !== '' ? (
        <div className="tt-title">{labelFmt ? labelFmt(label) : label}</div>
      ) : null}
      {payload.map((p, i) => (
        <div className="tt-row" key={i}>
          <span className="tt-key" style={{ background: p.color || p.payload?.fill }} />
          <span className="tt-name">{p.name}</span>
          <span className="tt-val">{valueFmt ? valueFmt(p.value, p) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

/** KPI stat tile. */
export function StatTile({ label, value, unit, foot, dot }) {
  return (
    <div className="tile">
      <div className="label">
        {dot ? <span className="dot" style={{ background: dot, width: 8, height: 8, borderRadius: 99, display: 'inline-block' }} /> : null}
        {label}
      </div>
      <div className="value">
        {value}
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
      {foot ? <div className="foot">{foot}</div> : null}
    </div>
  )
}
