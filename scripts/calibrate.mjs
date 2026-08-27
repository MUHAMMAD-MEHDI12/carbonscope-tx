/**
 * Calibration harness — prints modeled totals so synthetic data stays in
 * plausible real-world ranges. Run: npm run calibrate
 *
 * Sanity anchors:
 *  - US building-sector CO2 ≈ 1,600 Mt/yr (direct + electricity)
 *  - Texas ≈ 9–10% of US → building carbon ~130–160 Mt/yr statewide
 *  - The 4 big metros ≈ 65–70% of TX population → ~35–60 Mt/yr combined
 *  - Typical TX single-family home ≈ 7–9 t CO2e/yr
 *  - Office buildings ≈ 50–100 kg CO2e per m² floor per year
 */
import { loadDataset, computeSummary, metroBreakdown, typeBreakdown, uhiBuckets, concentrationCurve } from '../src/data/dataService.js'

const ds = loadDataset()
console.log('=== CarbonScope TX calibration ===\n')

const rows = metroBreakdown()
let combined = 0
for (const r of rows) {
  combined += r.totalMTons
  console.log(
    `${r.name.padEnd(12)} sample=${String(r.sample).padStart(5)}  modeled bldgs=${String(r.modeledCount.toLocaleString()).padStart(10)}  total=${r.totalMTons.toFixed(1).padStart(5)} Mt/yr  perCap=${r.perCapitaTons.toFixed(1)} t  UHI share=${r.uhiSharePct.toFixed(1)}%`
  )
}
console.log(`\nCombined 4-metro total: ${combined.toFixed(1)} Mt CO2e/yr  (plausible band 85–115)`)

const all = ds.all
const s = computeSummary(all)
console.log(`Mean per sampled building: ${s.meanTons.toFixed(1)} t | median ${s.medianTons.toFixed(1)} t | mean intensity ${s.meanIntensity.toFixed(1)} kg/m²`)

// residential-only mean (should be ~6–10 t)
const res = all.filter((b) => b.type === 'residential')
const resMean = res.reduce((x, b) => x + b.carbonTons, 0) / res.length
console.log(`Residential mean: ${resMean.toFixed(1)} t/yr (target 6–10) over ${res.length} homes`)

const com = all.filter((b) => b.type === 'commercial')
const comInt = com.reduce((x, b) => x + b.carbonKg, 0) / com.reduce((x, b) => x + b.floorAreaM2, 0)
console.log(`Commercial intensity: ${comInt.toFixed(0)} kg/m²/yr (target 50–100)`)

console.log('\nType shares (modeled):')
for (const t of typeBreakdown(all)) {
  console.log(`  ${t.type.padEnd(12)} ${t.pct.toFixed(1)}%  (${t.mtons.toFixed(1)} Mt)`)
}

const conc = concentrationCurve(all)
console.log(`\nTop 10% of buildings emit ${conc.top10Pct.toFixed(1)}% of carbon (expect 35–60%)`)

console.log('\nUHI buckets (cooling intensity kWh/m²):')
for (const k of uhiBuckets(all)) {
  console.log(`  ${k.label.padEnd(9)} n=${String(k.count).padStart(5)}  cooling=${k.coolingIntensity.toFixed(1)}  UHI share of carbon=${k.uhiSharePct.toFixed(1)}%`)
}
console.log(`\nMetro-wide UHI share of total carbon: ${s.uhiSharePct.toFixed(1)}% (expect ~4–10; plan cites 8–12% of cooling)`)
console.log(`Cool-roof retrofit potential (all buildings): ${s.modeledRetrofitMTons.toFixed(2)} Mt/yr`)
