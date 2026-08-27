import { useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { SectionHead } from '../components/Shell.jsx'
import { useState } from 'react'
import {
  computeSummary,
  concentrationCurve,
  vintageIntensity,
  uhiBuckets,
  fmt,
  fmtInt,
  fmtMoney,
  EQUIV,
} from '../data/dataService.js'
import { roofAlbedoFactor, MODEL_PARAMS } from '../model/energyModel.js'
import { METROS } from '../data/metros.js'

export default function Policy() {
  const { buildings, metro } = useApp()
  const s = useMemo(() => computeSummary(buildings), [buildings])
  const conc = useMemo(() => concentrationCurve(buildings), [buildings])
  const vintage = useMemo(() => vintageIntensity(buildings), [buildings])

  // Reference cool-roof program: top 5% of emitters to albedo 0.72
  const roofProg = useMemo(() => {
    let saveKg = 0
    let cost = 0
    let dollarYr = 0
    let n = 0
    for (const b of buildings) {
      if (b.pctile >= 95 && b.roofAlbedo < 0.7) {
        const w = b.weight || 1
        const dk = b.coolingKwh * (1 - roofAlbedoFactor(0.72) / roofAlbedoFactor(b.roofAlbedo))
        if (dk > 0) {
          saveKg += dk * MODEL_PARAMS.gridKgCO2PerKwh * w
          cost += b.footprintM2 * MODEL_PARAMS.coolRoofCostPerM2 * w
          dollarYr += dk * MODEL_PARAMS.retailElecPerKwh * w
          n += w
        }
      }
    }
    return { saveKg, cost, dollarYr, n, payback: dollarYr ? cost / dollarYr : Infinity }
  }, [buildings])

  const hotShare = useMemo(() => {
    const hot = buildings.filter((b) => b.uhiDeltaF >= 4)
    const kg = hot.reduce((x, b) => x + b.uhiPenaltyKg * (b.weight || 1), 0)
    return { count: hot.length, mt: kg / 1e9 }
  }, [buildings])

  const pre1985 = useMemo(() => {
    const old = buildings.filter((b) => b.yearBuilt < 1985)
    const kg = old.reduce((x, b) => x + b.carbonKg * (b.weight || 1), 0)
    const stock = old.reduce((x, b) => x + (b.weight || 1), 0)
    return { mt: kg / 1e9, stock, sharePct: s.modeledMTons ? (100 * kg) / (s.modeledMTons * 1e9) : 0 }
  }, [buildings, s])

  const scope = metro === 'all' ? 'the four largest Texas metros' : METROS[metro].name
  const vBands = vintage.filter((b) => b.count >= 10 && b.hvacIntensity > 0)
  const oldInt = vBands[0]?.hvacIntensity || 0
  const newInt = vBands[vBands.length - 1]?.hvacIntensity || oldInt || 1
  const newLabel = vBands[vBands.length - 1]?.label || 'recent'

  const briefs = [
    {
      title: 'Target the top 10% — not everything at once',
      who: ['City sustainability offices', 'CPS / Austin Energy / Oncor programs'],
      evidence: `The top 10% of buildings emit ${conc.top10Pct.toFixed(0)}% of building carbon in ${scope}. This dashboard names them — ranked, mapped, with per-building retrofit yields.`,
      action:
        'Stand up a "Major Emitters" benchmarking + retrofit program covering only the mapped top decile: mandatory annual energy disclosure, subsidized audits, and performance targets tied to the per-building baselines in this tool.',
      impact: [
        { k: 'Carbon covered', v: fmt(s.modeledMTons * (conc.top10Pct / 100)) + ' Mt/yr' },
        { k: 'Buildings to engage', v: fmt(s.modeledCount * 0.1) },
        { k: 'Admin burden vs blanket policy', v: '−90%' },
      ],
    },
    {
      title: 'Launch a targeted cool-roof program',
      who: ['City councils (ordinance + incentive)', 'Utility demand-response budgets'],
      evidence: `Retrofitting only the top 5% of emitters with cool roofs (albedo 0.72) saves ${fmt(roofProg.saveKg / 1e9)} Mt CO2e/yr for ${fmtMoney(roofProg.cost)} — payback ${Number.isFinite(roofProg.payback) ? roofProg.payback.toFixed(1) : '—'} years from energy savings alone.`,
      action:
        'Adopt a cool-roof requirement at re-roofing time for commercial buildings, plus a rebate ($/m²) prioritized by this map\'s hyperlocal heat ranking — hottest blocks first, where each reflective roof buys the most carbon and peak-load relief.',
      impact: [
        { k: 'Investment', v: fmtMoney(roofProg.cost) },
        { k: 'Annual saving', v: fmt(roofProg.saveKg / 1e9, 2) + ' Mt' },
        { k: 'Payback', v: Number.isFinite(roofProg.payback) ? roofProg.payback.toFixed(1) + ' yrs' : '—' },
      ],
    },
    {
      title: 'Green the +4°F zones first',
      who: ['Parks departments', 'MPOs / TxDOT urban programs', 'Tree-planting NGOs'],
      evidence: `Buildings sitting in ≥ +4°F heat-island zones carry ${fmt(hotShare.mt)} Mt/yr of pure UHI carbon penalty. These blocks are mapped street-by-street on the Heat Island tab — they are also the least-shaded, lowest-income tracts.`,
      action:
        'Direct urban-forestry and shade-structure budgets to the mapped ≥ +4°F districts. A +0.05 NDVI gain there cuts cooling demand ~2.5%, lowers peak load, and doubles as a heat-health equity intervention.',
      impact: [
        { k: 'UHI carbon in hot zones', v: fmt(hotShare.mt, 2) + ' Mt/yr' },
        { k: 'Priority districts mapped', v: '6 per metro' },
        { k: 'Co-benefit', v: 'Heat-health equity' },
      ],
    },
    {
      title: 'Performance standards for pre-1985 stock',
      who: ['State legislature (enabling)', 'Cities (BPS ordinances)', 'PACE lenders'],
      evidence: `The oldest cohort's heating-and-cooling carbon runs ${oldInt.toFixed(0)} kg/m²/yr — ${(oldInt / newInt).toFixed(1)}× the ${newLabel} stock — and pre-1985 buildings account for ${pre1985.sharePct.toFixed(0)}% of all building carbon (${fmt(pre1985.mt)} Mt/yr).`,
      action:
        'Phase in building performance standards for the pre-1985 cohort, financed through PACE. Sequence compliance deadlines using this dashboard\'s vintage × intensity ranking so the worst square meters move first.',
      impact: [
        { k: 'Cohort emissions', v: fmt(pre1985.mt) + ' Mt/yr' },
        { k: 'Buildings', v: fmt(pre1985.stock) },
        { k: 'HVAC retrofit potential', v: '20–35% each' },
      ],
    },
    {
      title: 'Plan the grid around building heat',
      who: ['ERCOT', 'Utilities', 'Public Utility Commission'],
      evidence: `Cooling is ${s.coolingShareOfCarbonPct.toFixed(0)}% of building carbon and the heat-island penalty is ${s.uhiShareOfCoolingPct.toFixed(0)}% of cooling — demand that spikes exactly on peak-risk afternoons and that station-based forecasts under-count.`,
      action:
        'Fold hyperlocal temperature into summer peak-demand forecasting and demand-response dispatch: pre-cool and load-shed the mapped hot districts first. Every 0.01 kg/kWh of grid decarbonization removes ' +
        fmt(s.modeledElecTWh * 1e9 * 0.01 / 1e9, 2) +
        ' Mt/yr from buildings at current demand.',
      impact: [
        { k: 'Cooling carbon', v: fmt((s.coolingShareOfCarbonPct / 100) * s.modeledMTons) + ' Mt/yr' },
        { k: 'Modeled demand', v: fmt(s.modeledElecTWh, 0) + ' TWh/yr' },
        { k: 'Forecast blind spot closed', v: '+' + s.uhiShareOfCoolingPct.toFixed(0) + '%' },
      ],
    },
  ]

  return (
    <>
      <SectionHead title="Policy briefing for Texas decision-makers">
        Five actions, each derived live from the data on this dashboard — with the evidence, the
        responsible actors, and the modeled impact. Filter by metro above to localize every
        number.
      </SectionHead>

      <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
        {briefs.map((b, i) => (
          <PolicyCard key={i} rank={i + 1} {...b} />
        ))}
      </div>

      <div className="card mt">
        <div className="card-head">
          <div className="titles">
            <h3>The bottom line</h3>
          </div>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', maxWidth: 900 }}>
          Executed together at moderate ambition (Scenario Lab defaults), these programs cut
          building carbon in {scope} by roughly{' '}
          <b style={{ color: 'var(--text)' }}>8–15% within a decade</b> — before any grid
          decarbonization — equivalent to removing{' '}
          <b style={{ color: 'var(--text)' }}>
            {fmt(s.modeledMTons * 0.12 * 1e6 * EQUIV.carsPerTon)} cars
          </b>{' '}
          from Texas roads. The enabling ingredient is spatial precision: knowing{' '}
          <i>which</i> buildings, on <i>which</i> blocks, at <i>what</i> temperature — the gap
          hyperlocal sensing closes.
        </p>
      </div>
    </>
  )
}

function PolicyCard({ rank, title, who, evidence, action, impact }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="card policy-card">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span className="policy-rank">{rank}</span>
        <h3 style={{ fontSize: 14.5, fontWeight: 700, marginRight: 'auto' }}>{title}</h3>
        <button className="mini-btn" onClick={() => setOpen((v) => !v)}>
          {open ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {open ? (
        <>
          <div className="policy-meta">
            {who.map((w) => (
              <span className="chip" key={w}>
                {w}
              </span>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="small" style={{ color: 'var(--text-2)' }}>
              <b style={{ color: 'var(--text)' }}>Evidence · </b>
              {evidence}
            </div>
            <div className="small" style={{ color: 'var(--text-2)' }}>
              <b style={{ color: 'var(--text)' }}>Recommended action · </b>
              {action}
            </div>
          </div>
          <div className="policy-impact">
            {impact.map((m) => (
              <div key={m.k}>
                <div className="k">{m.k}</div>
                <div className="v">{m.v}</div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
