import { useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  ReferenceLine,
  LabelList,
  Cell,
} from 'recharts'
import { useApp } from '../context/AppContext.jsx'
import { SectionHead } from '../components/Shell.jsx'
import { ChartCard, StatTile, VizTooltip } from '../components/ChartKit.jsx'
import {
  computeSummary,
  metroBreakdown,
  typeBreakdown,
  concentrationCurve,
  fmt,
  fmtInt,
  EQUIV,
} from '../data/dataService.js'
import { TYPE_LABELS, METROS } from '../data/metros.js'
import { typeColors } from '../theme/palette.js'

export default function Overview() {
  const { buildings, metro, pal, theme } = useApp()
  const s = useMemo(() => computeSummary(buildings), [buildings])
  const metros = useMemo(() => metroBreakdown(), [])
  const types = useMemo(() => typeBreakdown(buildings), [buildings])
  const conc = useMemo(() => concentrationCurve(buildings), [buildings])
  const tc = typeColors(theme)

  const scopeName = metro === 'all' ? 'the four largest Texas metros' : METROS[metro].name
  const carsEquiv = s.modeledMTons * 1e6 * EQUIV.carsPerTon

  return (
    <>
      <SectionHead title="The building carbon picture">
        Modeled annual CO2e from building energy across {scopeName} — fusing hyperlocal
        temperature (FortyGuard), building footprints (Microsoft ML) and vegetation from
        satellite imagery (Landsat NDVI) through a physical energy model.
      </SectionHead>

      <div className="grid kpis">
        <StatTile
          label="Building carbon"
          value={fmt(s.modeledMTons)}
          unit="Mt CO2e / yr"
          foot={`≈ ${fmt(carsEquiv)} passenger cars' annual emissions`}
        />
        <StatTile
          label="Building stock modeled"
          value={fmt(s.modeledCount)}
          unit="buildings"
          foot={`${fmtInt(s.count)} sampled at building level`}
        />
        <StatTile
          label="Heat-island carbon penalty"
          value={fmt(s.modeledUhiMTons)}
          unit="Mt / yr"
          foot={`${s.uhiSharePct.toFixed(1)}% of all building carbon — invisible to airport weather stations`}
        />
        <StatTile
          label="Cool-roof potential"
          value={fmt(s.modeledRetrofitMTons)}
          unit="Mt / yr"
          foot="If every viable dark roof were retrofitted to albedo 0.72"
        />
      </div>

      <div className="grid cols-2 mt">
        <ChartCard
          title="Annual building carbon by metro"
          sub="Modeled metro-wide totals, Mt CO2e per year"
          table={{
            columns: [
              { key: 'name', label: 'Metro' },
              { key: 'totalMTons', label: 'Mt CO2e/yr', num: true, fmt: (v) => v.toFixed(1) },
              { key: 'perCapitaTons', label: 't per capita', num: true, fmt: (v) => v.toFixed(1) },
              { key: 'modeledCount', label: 'Buildings', num: true, fmt: (v) => fmtInt(v) },
            ],
            rows: metros,
          }}
        >
          <ResponsiveContainer width="100%" height={252}>
            <BarChart data={metros} margin={{ top: 22, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={pal.grid} vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: pal.axis }} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v, 0)} />
              <Tooltip
                cursor={{ fill: pal.grid, opacity: 0.5 }}
                content={<VizTooltip valueFmt={(v) => v.toFixed(1) + ' Mt/yr'} />}
              />
              <Bar
                dataKey="totalMTons"
                name="Building carbon"
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              >
                {metros.map((m) => (
                  <Cell
                    key={m.id}
                    fill={metro === 'all' || metro === m.id ? pal.series[0] : pal.deemphasis}
                  />
                ))}
                <LabelList
                  dataKey="totalMTons"
                  position="top"
                  formatter={(v) => v.toFixed(0)}
                  style={{ fill: pal.text2, fontSize: 11, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="card">
          <div className="card-head">
            <div className="titles">
              <h3>Building type breakdown</h3>
              <div className="sub">Not shown</div>
            </div>
          </div>
          <p className="foot-note" style={{ marginTop: 4 }}>
            We don't have real residential / commercial / industrial classification
            data for these buildings, so we're not showing a type breakdown. Positions,
            footprint sizes and (where noted) NDVI and carbon are real; building type
            would have to be guessed from footprint size alone, which isn't reliable
            enough to report.
          </p>
        </div>
      </div>

      <div className="grid cols-2 mt">
        <ChartCard
          title="Emissions are highly concentrated"
          sub="Cumulative share of carbon vs share of buildings (sorted largest first)"
          table={{
            columns: [
              { key: 'buildingsPct', label: 'Top % of buildings', num: true, fmt: (v) => v.toFixed(0) + '%' },
              { key: 'carbonPct', label: 'Share of carbon', num: true, fmt: (v) => v.toFixed(1) + '%' },
            ],
            rows: conc.pts.filter((_, i) => i % 5 === 0),
          }}
        >
          <ResponsiveContainer width="100%" height={252}>
            <LineChart data={conc.pts} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={pal.grid} vertical={false} />
              <XAxis
                dataKey="buildingsPct"
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => v + '%'}
                tickLine={false}
                axisLine={{ stroke: pal.axis }}
              />
              <YAxis domain={[0, 100]} tickFormatter={(v) => v + '%'} tickLine={false} axisLine={false} />
              <Tooltip
                content={
                  <VizTooltip
                    labelFmt={(l) => `Top ${Number(l).toFixed(0)}% of buildings`}
                    valueFmt={(v) => v.toFixed(1) + '% of carbon'}
                  />
                }
              />
              <ReferenceLine
                segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
                stroke={pal.axis}
                strokeWidth={1}
              />
              <Line
                type="monotone"
                dataKey="carbonPct"
                name="Carbon share"
                stroke={pal.series[0]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="foot-note">
            The top 10% of buildings emit <b style={{ color: 'var(--text)' }}>{conc.top10Pct.toFixed(0)}%</b> of
            all building carbon — precision targeting beats blanket policy.
          </p>
        </ChartCard>

        <div className="card">
          <div className="card-head">
            <div className="titles">
              <h3>Why hyperlocal temperature changes the answer</h3>
              <div className="sub">The FortyGuard difference, quantified</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <CompareRow
              k="Weather-station view"
              v="One airport reading per metro"
              d="Urban heat islands invisible — cooling demand under-estimated in exactly the neighborhoods that emit most"
              pal={pal}
              dim
            />
            <CompareRow
              k="Hyperlocal view"
              v="Street-scale temperature anomalies up to +7–8°F"
              d={`Reveals ${fmt(s.modeledUhiMTons)} Mt/yr of heat-island carbon (${s.uhiSharePct.toFixed(1)}% of total) and pinpoints which blocks to fix first`}
              pal={pal}
            />
          </div>
          <div className="divider" />
          <div className="grid cols-3" style={{ gap: 10 }}>
            <MiniStat label="Cooling share of building carbon" value={`${s.coolingShareOfCarbonPct.toFixed(0)}%`} />
            <MiniStat label="UHI share of cooling carbon" value={`${s.uhiShareOfCoolingPct.toFixed(0)}%`} />
            <MiniStat label="Modeled electricity" value={`${fmt(s.modeledElecTWh, 0)} TWh/yr`} />
          </div>
          <p className="foot-note">
            Values recompute live from the building sample as you filter metros above.
          </p>
        </div>
      </div>
    </>
  )
}

function TypeShareBar({ types, tc, pal }) {
  // Part-to-whole horizontal stacked bar with 2px surface gaps
  return (
    <div>
      <div style={{ display: 'flex', height: 26, borderRadius: 7, overflow: 'hidden', gap: 2, background: 'transparent' }}>
        {types.map((t) => (
          <div
            key={t.type}
            title={`${TYPE_LABELS[t.type]}: ${t.pct.toFixed(1)}%`}
            style={{ width: `${t.pct}%`, background: tc[t.type], borderRadius: 4, minWidth: 8 }}
          />
        ))}
      </div>
    </div>
  )
}

function CompareRow({ k, v, d, pal, dim }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 2,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'var(--surface-2)',
        borderLeft: `3px solid ${dim ? pal.deemphasis : pal.series[0]}`,
      }}
    >
      <div className="small muted">{k}</div>
      <div style={{ fontWeight: 650, fontSize: 13.5 }}>{v}</div>
      <div className="small" style={{ color: 'var(--text-2)' }}>
        {d}
      </div>
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div>
      <div className="small muted">{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.4px', marginTop: 2 }}>{value}</div>
    </div>
  )
}
