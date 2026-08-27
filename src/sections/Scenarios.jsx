import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from 'recharts'
import { useApp } from '../context/AppContext.jsx'
import { SectionHead } from '../components/Shell.jsx'
import { ChartCard, StatTile, VizTooltip } from '../components/ChartKit.jsx'
import { fmt, fmtInt, fmtMoney, EQUIV } from '../data/dataService.js'
import { roofAlbedoFactor, vegetationFactor, ageEfficiencyFactor, MODEL_PARAMS } from '../model/energyModel.js'
import { METROS } from '../data/metros.js'

const GRID_NOW = MODEL_PARAMS.gridKgCO2PerKwh

export default function Scenarios() {
  const { buildings, metro, pal } = useApp()
  const [roofPct, setRoofPct] = useState(5) // top % of emitters retrofitted
  const [albedo, setAlbedo] = useState(0.72)
  const [roofCost, setRoofCost] = useState(MODEL_PARAMS.coolRoofCostPerM2)
  const [ndviBoost, setNdviBoost] = useState(0.05)
  const [hvacShare, setHvacShare] = useState(20) // % of pre-1985 stock
  const [grid, setGrid] = useState(GRID_NOW)

  const r = useMemo(() => {
    let base = 0
    let after = 0
    let roofSaveKg = 0
    let greenSaveKg = 0
    let hvacSaveKg = 0
    let gridSaveKg = 0
    let roofCostUsd = 0
    let roofDollarSaveYr = 0
    let roofTargetCount = 0
    let hvacCostUsd = 0
    const cut = 100 - roofPct

    for (const b of buildings) {
      const w = b.weight || 1
      const elec0 = b.elecKwh
      const gasCarbon0 = Math.max(0, b.carbonKg - elec0 * GRID_NOW)
      base += b.carbonKg * w

      let cooling = b.coolingKwh
      let elec = elec0

      // 1) Cool roof on targeted top emitters
      const targeted = b.pctile >= cut && b.roofAlbedo < albedo - 0.02
      if (targeted) {
        const f0 = roofAlbedoFactor(b.roofAlbedo)
        const f1 = roofAlbedoFactor(albedo)
        const newCooling = cooling * (f1 / f0)
        const dk = cooling - newCooling
        cooling = newCooling
        elec -= dk
        roofSaveKg += dk * GRID_NOW * w
        roofCostUsd += b.footprintM2 * roofCost * w
        roofDollarSaveYr += dk * MODEL_PARAMS.retailElecPerKwh * w
        roofTargetCount += w
      }

      // 2) Urban greening in hot zones (NDVI boost where anomaly ≥ 3.5°F)
      if (ndviBoost > 0 && b.uhiDeltaF >= 3.5) {
        const v0 = vegetationFactor(b.ndvi)
        const v1 = vegetationFactor(Math.min(0.8, b.ndvi + ndviBoost))
        const newCooling = cooling * (v1 / v0)
        const dk = cooling - newCooling
        cooling = newCooling
        elec -= dk
        greenSaveKg += dk * GRID_NOW * w
      }

      // 3) HVAC modernization of pre-1985 stock (expected-value share)
      let gasCarbon = gasCarbon0
      if (hvacShare > 0 && b.yearBuilt < 1985) {
        const p = hvacShare / 100
        const f = ageEfficiencyFactor(b.yearBuilt)
        const reduce = Math.max(0, 1 - 0.9 / f) * p
        const dCool = cooling * reduce
        cooling -= dCool
        elec -= dCool
        const dGas = gasCarbon * reduce
        gasCarbon -= dGas
        hvacSaveKg += (dCool * GRID_NOW + dGas) * w
        hvacCostUsd += b.floorAreaM2 * MODEL_PARAMS.hvacRetrofitCostPerM2Floor * p * w
      }

      // 4) Grid decarbonization on remaining electricity
      gridSaveKg += elec * (GRID_NOW - grid) * w
      after += (elec * grid + gasCarbon) * w
    }

    const demandSaveKg = roofSaveKg + greenSaveKg + hvacSaveKg
    return {
      baseMT: base / 1e9,
      afterMT: after / 1e9,
      savedMT: (base - after) / 1e9,
      cutPct: base ? (100 * (base - after)) / base : 0,
      roofMT: roofSaveKg / 1e9,
      greenMT: greenSaveKg / 1e9,
      hvacMT: hvacSaveKg / 1e9,
      gridMT: gridSaveKg / 1e9,
      demandMT: demandSaveKg / 1e9,
      roofCostUsd,
      roofDollarSaveYr,
      roofPaybackYr: roofDollarSaveYr > 0 ? roofCostUsd / roofDollarSaveYr : Infinity,
      roofCostPerTon:
        roofSaveKg > 0 ? roofCostUsd / ((roofSaveKg / 1000) * 20) : Infinity, // 20-yr roof life
      roofTargetCount,
      hvacCostUsd,
    }
  }, [buildings, roofPct, albedo, roofCost, ndviBoost, hvacShare, grid])

  const measures = [
    { name: 'Cool roofs', mt: r.roofMT },
    { name: 'Urban greening', mt: r.greenMT },
    { name: 'HVAC retrofits', mt: r.hvacMT },
    { name: 'Grid decarbonization', mt: r.gridMT },
  ]

  const scope = metro === 'all' ? 'four metros' : METROS[metro].name

  return (
    <>
      <SectionHead title="Scenario lab">
        Drag the levers and watch modeled carbon respond — every number recomputes live across{' '}
        {fmtInt(buildings.length)} sampled buildings ({scope}), expansion-weighted to the full
        building stock.
      </SectionHead>

      <div className="grid cols-23">
        <div className="card">
          <div className="card-head">
            <div className="titles">
              <h3>Policy levers</h3>
              <div className="sub">Set the ambition level of each program</div>
            </div>
          </div>

          <Slider
            label="Cool-roof program — top emitters targeted"
            value={roofPct}
            fmtVal={(v) => v + '% of buildings'}
            min={0}
            max={25}
            step={1}
            onChange={setRoofPct}
          />
          <Slider
            label="Retrofit roof albedo"
            value={albedo}
            fmtVal={(v) => v.toFixed(2)}
            min={0.55}
            max={0.85}
            step={0.01}
            onChange={setAlbedo}
          />
          <Slider
            label="Install cost"
            value={roofCost}
            fmtVal={(v) => '$' + v + ' / m² roof'}
            min={15}
            max={50}
            step={1}
            onChange={setRoofCost}
          />
          <div className="divider" />
          <Slider
            label="Urban greening — NDVI gain in hot zones (≥ +3.5°F)"
            value={ndviBoost}
            fmtVal={(v) => '+' + v.toFixed(2) + ' NDVI'}
            min={0}
            max={0.15}
            step={0.01}
            onChange={setNdviBoost}
          />
          <Slider
            label="HVAC modernization — share of pre-1985 stock"
            value={hvacShare}
            fmtVal={(v) => v + '%'}
            min={0}
            max={100}
            step={5}
            onChange={setHvacShare}
          />
          <Slider
            label="ERCOT grid intensity"
            value={grid}
            fmtVal={(v) => v.toFixed(2) + ' kg CO2/kWh'}
            min={0.1}
            max={0.45}
            step={0.01}
            onChange={setGrid}
          />
          <p className="foot-note">
            Measures compound in sequence (roofs → greening → HVAC → grid) so savings are never
            double-counted.
          </p>
        </div>

        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div className="grid cols-3" style={{ gap: 14 }}>
            <StatTile label="Baseline" value={fmt(r.baseMT)} unit="Mt/yr" foot="Current modeled emissions" />
            <StatTile
              label="Scenario"
              value={fmt(r.afterMT)}
              unit="Mt/yr"
              foot={
                <span className="delta-good">
                  −{fmt(r.savedMT)} Mt (−{r.cutPct.toFixed(1)}%)
                </span>
              }
            />
            <StatTile
              label="Equivalent to"
              value={fmt(r.savedMT * 1e6 * EQUIV.carsPerTon)}
              unit="cars"
              foot="Taken off the road, every year"
            />
          </div>

          <ChartCard
            title="Where the savings come from"
            sub="Annual Mt CO2e avoided by measure"
            table={{
              columns: [
                { key: 'name', label: 'Measure' },
                { key: 'mt', label: 'Mt CO2e/yr', num: true, fmt: (v) => v.toFixed(2) },
              ],
              rows: measures,
            }}
          >
            <ResponsiveContainer width="100%" height={205}>
              <BarChart data={measures} layout="vertical" margin={{ top: 4, right: 52, left: 30, bottom: 0 }}>
                <CartesianGrid stroke={pal.grid} horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={{ stroke: pal.axis }} tickFormatter={(v) => fmt(v, 1)} />
                <YAxis type="category" dataKey="name" width={128} tickLine={false} axisLine={false} tick={{ fill: pal.text2, fontSize: 12 }} />
                <Tooltip
                  cursor={{ fill: pal.grid, opacity: 0.5 }}
                  content={<VizTooltip valueFmt={(v) => v.toFixed(2) + ' Mt/yr'} />}
                />
                <Bar dataKey="mt" name="Avoided carbon" fill={pal.series[0]} maxBarSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  <LabelList dataKey="mt" position="right" formatter={(v) => v.toFixed(2)} style={{ fill: pal.text2, fontSize: 11, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="card">
            <div className="card-head">
              <div className="titles">
                <h3>Cool-roof program economics</h3>
                <div className="sub">
                  Targeting the top {roofPct}% of emitters ≈ {fmt(r.roofTargetCount)} buildings metro-wide
                </div>
              </div>
            </div>
            <div className="policy-impact" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div>
                <div className="k">Investment</div>
                <div className="v">{fmtMoney(r.roofCostUsd)}</div>
              </div>
              <div>
                <div className="k">Energy savings</div>
                <div className="v">{fmtMoney(r.roofDollarSaveYr)}/yr</div>
              </div>
              <div>
                <div className="k">Payback</div>
                <div className="v">{Number.isFinite(r.roofPaybackYr) ? r.roofPaybackYr.toFixed(1) + ' yrs' : '—'}</div>
              </div>
              <div>
                <div className="k">Abatement cost</div>
                <div className="v">{Number.isFinite(r.roofCostPerTon) ? fmtMoney(r.roofCostPerTon) + '/t' : '—'}</div>
              </div>
            </div>
            <p className="foot-note">
              Abatement cost assumes a 20-year roof life. HVAC program investment at current
              setting: {fmtMoney(r.hvacCostUsd)}. Hyperlocal targeting is what makes the payback
              work — the same budget spread uniformly returns roughly half the savings.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

function Slider({ label, value, fmtVal, min, max, step, onChange }) {
  return (
    <div>
      <div className="slider-row">
        <span className="lbl">{label}</span>
        <span className="val">{fmtVal(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}
