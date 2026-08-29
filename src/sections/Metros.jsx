import { useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  ScatterChart,
  Scatter,
  ZAxis,
  Legend,
} from 'recharts'
import { useApp } from '../context/AppContext.jsx'
import { SectionHead } from '../components/Shell.jsx'
import { ChartCard, VizTooltip, DataTable } from '../components/ChartKit.jsx'
import {
  metroBreakdown,
  distributionBins,
  vintageIntensity,
  topEmitters,
  fmt,
  fmtInt,
} from '../data/dataService.js'
import { METROS, TYPE_LABELS } from '../data/metros.js'
import { typeColors } from '../theme/palette.js'

export default function Metros() {
  const { buildings, metro, pal, theme } = useApp()
  const metros = useMemo(() => metroBreakdown(), [])
  const bins = useMemo(() => distributionBins(buildings), [buildings])
  const vintage = useMemo(() => vintageIntensity(buildings), [buildings])
  const top = useMemo(() => topEmitters(buildings, 20), [buildings])
  const tc = typeColors(theme)

  // Downsample scatter for SVG performance, keep the extremes
  const scatterByType = useMemo(() => {
    const sorted = [...buildings].sort((a, b) => b.carbonKg - a.carbonKg)
    const keep = new Set(sorted.slice(0, 150).map((b) => b.id))
    const step = Math.max(1, Math.floor(buildings.length / 600))
    const pts = buildings.filter((b, i) => i % step === 0 || keep.has(b.id))
    return ['all'].map((t) => ({
      type: t,
      data: pts
        .filter(() => true)
        .map((b) => ({ x: b.floorAreaM2, y: Math.max(0.5, b.carbonTons), id: b.id })),
    }))
  }, [buildings])

  return (
    <>
      <SectionHead title="Metro & building-stock analysis">
        How carbon varies across metros, building vintages and sizes — and exactly which
        buildings dominate the total.
      </SectionHead>

      <div className="grid cols-2">
        <ChartCard
          title="Carbon per resident"
          sub="Modeled building CO2e per capita, tons per year"
          table={{
            columns: [
              { key: 'name', label: 'Metro' },
              { key: 'perCapitaTons', label: 't/person/yr', num: true, fmt: (v) => v.toFixed(1) },
              { key: 'summerHighF', label: 'Avg summer high', num: true, fmt: (v) => v.toFixed(1) + '°F' },
              { key: 'baseCDD', label: 'Cooling degree days', num: true, fmt: (v) => fmtInt(v) },
            ],
            rows: metros,
          }}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={metros} margin={{ top: 22, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={pal.grid} vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: pal.axis }} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: pal.grid, opacity: 0.5 }}
                content={<VizTooltip valueFmt={(v) => v.toFixed(1) + ' t/person'} />}
              />
              <Bar dataKey="perCapitaTons" name="Per-capita carbon" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {metros.map((m) => (
                  <Cell key={m.id} fill={metro === 'all' || metro === m.id ? pal.series[0] : pal.deemphasis} />
                ))}
                <LabelList dataKey="perCapitaTons" position="top" formatter={(v) => v.toFixed(1)} style={{ fill: pal.text2, fontSize: 11, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Older buildings burn hotter"
          sub="Temperature-driven (HVAC) carbon intensity by construction era, kg CO2e per m² floor"
          table={{
            columns: [
              { key: 'label', label: 'Era' },
              { key: 'hvacIntensity', label: 'HVAC kg/m²/yr', num: true, fmt: (v) => v.toFixed(0) },
              { key: 'intensity', label: 'Total kg/m²/yr', num: true, fmt: (v) => v.toFixed(0) },
              { key: 'count', label: 'Sampled', num: true, fmt: (v) => fmtInt(v) },
            ],
            rows: vintage,
          }}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={vintage} margin={{ top: 22, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={pal.grid} vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: pal.axis }} interval={0} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: pal.grid, opacity: 0.5 }}
                content={<VizTooltip valueFmt={(v) => v.toFixed(0) + ' kg/m²'} />}
              />
              <Bar dataKey="hvacIntensity" name="HVAC carbon intensity" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {vintage.map((v, i) => (
                  <Cell key={v.label} fill={pal.ordinal[pal.ordinal.length - 1 - i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <VintageNote vintage={vintage} />
        </ChartCard>
      </div>

      <div className="grid cols-2 mt">
        <ChartCard
          title="Per-building emissions distribution"
          sub="Number of sampled buildings by annual tons CO2e"
          table={{
            columns: [
              { key: 'label', label: 'Tons/yr' },
              { key: 'count', label: 'Buildings', num: true, fmt: (v) => fmtInt(v) },
            ],
            rows: bins,
          }}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={bins} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={pal.grid} vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: pal.axis }} interval={0} angle={-32} textAnchor="end" height={52} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => fmt(v, 0)} />
              <Tooltip
                cursor={{ fill: pal.grid, opacity: 0.5 }}
                content={<VizTooltip valueFmt={(v) => fmtInt(v) + ' buildings'} />}
              />
              <Bar dataKey="count" name="Buildings" fill={pal.series[0]} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
          <p className="foot-note">
            Strongly right-skewed: most buildings are small emitters, a thin tail of large
            commercial/industrial stock carries the load.
          </p>
        </ChartCard>

        <ChartCard
          title="Size vs carbon by floor area"
          sub="Floor area (m², log) vs annual CO2e (t, log) — sampled subset"
          table={{
            columns: [
              { key: 'type', label: 'Group', fmt: () => 'All buildings' },
              { key: 'n', label: 'Points shown', num: true },
            ],
            rows: scatterByType.map((s) => ({ type: s.type, n: s.data.length })),
          }}
        >
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={pal.grid} />
              <XAxis
                dataKey="x"
                type="number"
                scale="log"
                domain={[60, 300000]}
                ticks={[100, 1000, 10000, 100000]}
                tickFormatter={(v) => fmt(v, 0)}
                tickLine={false}
                axisLine={{ stroke: pal.axis }}
                name="Floor area"
              />
              <YAxis
                dataKey="y"
                type="number"
                scale="log"
                domain={[0.5, 5000]}
                ticks={[1, 10, 100, 1000]}
                tickFormatter={(v) => fmt(v, 0)}
                tickLine={false}
                axisLine={false}
                name="Annual CO2e"
              />
              <ZAxis range={[28, 28]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3', stroke: pal.axis }}
                content={
                  <VizTooltip
                    valueFmt={(v, p) => (p.name === 'Floor area' ? fmtInt(v) + ' m²' : fmt(v) + ' t/yr')}
                  />
                }
              />
              <Legend iconSize={9} />
              {scatterByType.map((s, i) => (
                <Scatter
                  key={s.type}
                  name="Buildings"
                  data={s.data}
                  fill="#f59e0b"
                  fillOpacity={0.75}
                  isAnimationActive={false}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="card mt">
        <div className="card-head">
          <div className="titles">
            <h3>Top 20 emitters {metro === 'all' ? 'across all metros' : 'in ' + METROS[metro].short}</h3>
            <div className="sub">The precision-targeting shortlist — click these on the Carbon Map</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: 'rank', label: '#', num: true, fmt: (_, r) => topRank(top, r) },
            { key: 'id', label: 'Building' },
            { key: 'metro', label: 'Metro', fmt: (v) => METROS[v].short },
            { key: 'district', label: 'District' },

            { key: 'yearBuilt', label: 'Built', num: true },
            { key: 'floorAreaM2', label: 'Floor m²', num: true, fmt: (v) => fmtInt(v) },
            { key: 'uhiDeltaF', label: 'Heat anomaly', num: true, fmt: (v) => '+' + v.toFixed(1) + '°F' },
            { key: 'carbonTons', label: 't CO2e/yr', num: true, fmt: (v) => fmtInt(v) },
            { key: 'coolRoofSavingsKg', label: 'Cool-roof saves', num: true, fmt: (v) => (v / 1000).toFixed(0) + ' t' },
          ]}
          rows={top}
        />
      </div>
    </>
  )
}

function topRank(top, r) {
  return top.indexOf(r) + 1
}

function VintageNote({ vintage }) {
  const withData = vintage.filter((b) => b.count >= 10 && b.hvacIntensity > 0)
  const ratio =
    withData.length >= 2
      ? withData[0].hvacIntensity / withData[withData.length - 1].hvacIntensity
      : null
  return (
    <p className="foot-note">
      Ordered era scale (one-hue ramp). Baseline (plug/lighting) loads excluded — this is the
      heating-and-cooling slice that vintage actually drives
      {ratio
        ? `: ${withData[0].label} stock runs ${ratio.toFixed(1)}× the ${withData[withData.length - 1].label} intensity`
        : ''}
      .
    </p>
  )
}
