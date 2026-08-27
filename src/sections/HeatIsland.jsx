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
  Legend,
  LabelList,
} from 'recharts'
import { useApp } from '../context/AppContext.jsx'
import { SectionHead } from '../components/Shell.jsx'
import { ChartCard, StatTile, VizTooltip } from '../components/ChartKit.jsx'
import { computeSummary, uhiBuckets, metroBreakdown, fmt, fmtInt, EQUIV } from '../data/dataService.js'
import { METROS, METRO_LIST } from '../data/metros.js'

export default function HeatIsland() {
  const { buildings, metro, pal, dataset } = useApp()
  const s = useMemo(() => computeSummary(buildings), [buildings])
  const buckets = useMemo(() => uhiBuckets(buildings), [buildings])

  // Station-view vs hyperlocal cooling carbon per metro
  const metroUhi = useMemo(
    () =>
      METRO_LIST.map((m) => {
        const bs = dataset.byMetro[m.id]
        let coolKg = 0
        let uhiKg = 0
        for (const b of bs) {
          const w = b.weight || 1
          coolKg += b.coolingKwh * 0.4 * w
          uhiKg += b.uhiPenaltyKg * w
        }
        return {
          name: m.short,
          station: (coolKg - uhiKg) / 1e9,
          uhi: uhiKg / 1e9,
          pct: (100 * uhiKg) / coolKg,
        }
      }),
    [dataset]
  )

  const hottest = useMemo(() => {
    const byDistrict = new Map()
    for (const b of buildings) {
      const key = `${b.metro}|${b.district}`
      const e = byDistrict.get(key) || { metro: b.metro, district: b.district, uhiSum: 0, kg: 0, uhiKg: 0, n: 0 }
      e.uhiSum += b.uhiDeltaF
      e.kg += b.carbonKg
      e.uhiKg += b.uhiPenaltyKg
      e.n++
      byDistrict.set(key, e)
    }
    return [...byDistrict.values()]
      .map((d) => ({ ...d, meanUhi: d.uhiSum / d.n }))
      .sort((a, b) => b.meanUhi - a.meanUhi)
      .slice(0, 6)
  }, [buildings])

  const treesNeeded = s.modeledUhiMTons * 1e6 * EQUIV.treesPerTon

  return (
    <>
      <SectionHead title="The urban heat island carbon penalty">
        Airport weather stations see one temperature per metro. Hyperlocal sensing shows
        downtown blocks running +6 to +8°F hotter — heat that converts directly into cooling
        load, electricity and carbon. This section quantifies that hidden penalty.
      </SectionHead>

      <div className="grid kpis">
        <StatTile
          label="Heat-island carbon"
          value={fmt(s.modeledUhiMTons)}
          unit="Mt CO2e / yr"
          foot={`${metro === 'all' ? 'Across four metros' : METROS[metro].short} — emissions that exist only because cities run hot`}
        />
        <StatTile
          label="Share of cooling carbon"
          value={s.uhiShareOfCoolingPct.toFixed(0) + '%'}
          foot="Under-estimated by station-based methods"
        />
        <StatTile
          label="Peak local anomaly"
          value={'+' + Math.max(...buildings.map((b) => b.uhiDeltaF)).toFixed(1) + '°F'}
          foot="Hottest sampled building site vs metro baseline"
        />
        <StatTile
          label="Offset equivalent"
          value={fmt(treesNeeded)}
          unit="trees"
          foot="Mature urban trees needed to absorb the UHI penalty"
        />
      </div>

      <div className="grid cols-2 mt">
        <ChartCard
          title="Hotter blocks, heavier cooling"
          sub="Mean cooling electricity by hyperlocal heat anomaly, kWh per m² floor"
          table={{
            columns: [
              { key: 'label', label: 'Anomaly' },
              { key: 'coolingIntensity', label: 'kWh/m²', num: true, fmt: (v) => v.toFixed(1) },
              { key: 'count', label: 'Buildings', num: true, fmt: (v) => fmtInt(v) },
              { key: 'uhiSharePct', label: 'UHI share of carbon', num: true, fmt: (v) => v.toFixed(1) + '%' },
            ],
            rows: buckets,
          }}
        >
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={buckets} margin={{ top: 22, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={pal.grid} vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: pal.axis }} interval={0} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: pal.grid, opacity: 0.5 }}
                content={<VizTooltip valueFmt={(v) => v.toFixed(1) + ' kWh/m²'} />}
              />
              <Bar dataKey="coolingIntensity" name="Cooling intensity" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {buckets.map((b, i) => (
                  <Cell key={b.label} fill={pal.heat[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="foot-note">
            Semantic heat scale (legend left→right = cooler→hotter). Buildings in +6°F zones use
            ~2.4× the cooling energy per m² of buildings in near-baseline zones.
          </p>
        </ChartCard>

        <ChartCard
          title="What weather stations miss"
          sub="Cooling carbon per metro: station-view estimate vs hyperlocal penalty, Mt CO2e/yr"
          table={{
            columns: [
              { key: 'name', label: 'Metro' },
              { key: 'station', label: 'Station-view', num: true, fmt: (v) => v.toFixed(2) },
              { key: 'uhi', label: 'UHI penalty', num: true, fmt: (v) => v.toFixed(2) },
              { key: 'pct', label: 'Missed share', num: true, fmt: (v) => v.toFixed(1) + '%' },
            ],
            rows: metroUhi,
          }}
        >
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={metroUhi} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={pal.grid} vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: pal.axis }} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: pal.grid, opacity: 0.5 }}
                content={<VizTooltip valueFmt={(v) => v.toFixed(2) + ' Mt/yr'} />}
              />
              <Legend iconSize={9} />
              <Bar dataKey="station" name="Station-view cooling carbon" stackId="a" fill={pal.deemphasis} maxBarSize={24} stroke={pal.surface} strokeWidth={1} isAnimationActive={false} />
              <Bar dataKey="uhi" name="Hidden UHI penalty" stackId="a" fill={pal.heat[2]} maxBarSize={24} radius={[4, 4, 0, 0]} stroke={pal.surface} strokeWidth={1} isAnimationActive={false}>
                <LabelList dataKey="pct" position="top" formatter={(v) => '+' + v.toFixed(0) + '%'} style={{ fill: pal.text2, fontSize: 11, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="foot-note">
            The orange cap is carbon a station-based method never sees — 11–13% of cooling
            emissions in every metro, concentrated in exactly the districts with the least tree
            cover.
          </p>
        </ChartCard>
      </div>

      <div className="card mt">
        <div className="card-head">
          <div className="titles">
            <h3>Hottest districts {metro === 'all' ? '(all metros)' : 'in ' + METROS[metro].short}</h3>
            <div className="sub">Mean hyperlocal anomaly and the carbon it adds — the urban-greening shortlist</div>
          </div>
        </div>
        <div className="grid cols-3" style={{ gap: 10 }}>
          {hottest.map((d) => (
            <div key={d.metro + d.district} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <div style={{ fontWeight: 650, fontSize: 12.5, minWidth: 0 }}>{d.district}</div>
                <div style={{ fontWeight: 800, fontSize: 15, color: pal.heat[3], whiteSpace: 'nowrap' }}>
                  +{d.meanUhi.toFixed(1)}°F
                </div>
              </div>
              <div className="small muted" style={{ marginTop: 2 }}>
                {METROS[d.metro].short} · {fmtInt(d.n)} sampled buildings
              </div>
              <div className="small" style={{ color: 'var(--text-2)', marginTop: 4 }}>
                UHI adds {fmt(d.uhiKg / 1000, 0)} t/yr ({((100 * d.uhiKg) / d.kg).toFixed(1)}% of the district's carbon)
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
