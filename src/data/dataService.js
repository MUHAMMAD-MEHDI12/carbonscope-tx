/**
 * Data service — the single place sections get data from.
 *
 * REAL-DATA SWAP POINT: `loadDataset()` currently builds the synthetic sample.
 * To run on real pipeline output, fetch your GeoJSON/CSV here, map it to the
 * building schema (see README), and return the same shape. Everything else
 * (charts, map, scenarios, policy numbers) works unchanged.
 */
import { METROS, METRO_LIST } from './metros.js'
import { generateMetroBuildings, generateTempGrid } from './generateBuildings.js'
import { MODEL_PARAMS } from '../model/energyModel.js'

let _cache = null

export function loadDataset() {
  if (_cache) return _cache
  const byMetro = {}
  const tempGrids = {}
  for (const m of METRO_LIST) {
    const bs = generateMetroBuildings(m.id)
    // Stratified-sample expansion: weight = real stock count / sampled count,
    // per building type, so modeled totals are de-biased. (Set to 1 with real
    // full-stock data.)
    const countByType = { residential: 0, commercial: 0, industrial: 0 }
    bs.forEach((b) => countByType[b.type]++)
    bs.forEach((b) => {
      b.weight = countByType[b.type] ? m.stock[b.type] / countByType[b.type] : 0
    })
    byMetro[m.id] = bs
    tempGrids[m.id] = generateTempGrid(m.id)
  }
  const all = Object.values(byMetro).flat()
  _cache = { byMetro, tempGrids, all, generatedAt: 'synthetic-v1' }
  return _cache
}

/** Buildings for the current filter ('all' or a metro id). */
export function getBuildings(metroFilter) {
  const ds = loadDataset()
  return metroFilter === 'all' ? ds.all : ds.byMetro[metroFilter] || []
}

const TONS = 1 / 1000
const MTONS = 1 / 1e9

/** Expansion weight for modeled metro-wide totals (attached in loadDataset). */
function expFor(b) {
  return b.weight || 1
}

/** Headline aggregates for a set of buildings (modeled metro-wide totals). */
export function computeSummary(buildings) {
  let sampleKg = 0
  let modeledKg = 0
  let modeledCoolingKwh = 0
  let modeledElecKwh = 0
  let modeledUhiKg = 0
  let modeledRetrofitKg = 0
  let floorM2 = 0
  for (const b of buildings) {
    const e = expFor(b)
    sampleKg += b.carbonKg
    modeledKg += b.carbonKg * e
    modeledCoolingKwh += b.coolingKwh * e
    modeledElecKwh += b.elecKwh * e
    modeledUhiKg += b.uhiPenaltyKg * e
    modeledRetrofitKg += b.coolRoofSavingsKg * e
    floorM2 += b.floorAreaM2
  }
  const meanTons = buildings.length ? (sampleKg * TONS) / buildings.length : 0
  const sortedKg = buildings.map((b) => b.carbonKg).sort((a, b) => a - b)
  const medianTons = sortedKg.length ? (sortedKg[Math.floor(sortedKg.length / 2)] * TONS) : 0
  return {
    count: buildings.length,
    modeledCount: Math.round(buildings.reduce((s, b) => s + expFor(b), 0)),
    sampleTons: sampleKg * TONS,
    modeledMTons: modeledKg * MTONS,
    modeledCoolingTWh: modeledCoolingKwh / 1e9,
    modeledElecTWh: modeledElecKwh / 1e9,
    coolingShareOfCarbonPct: modeledKg
      ? (100 * modeledCoolingKwh * 0.4) / modeledKg
      : 0,
    uhiShareOfCoolingPct: modeledCoolingKwh
      ? (100 * modeledUhiKg) / (modeledCoolingKwh * 0.4)
      : 0,
    modeledUhiMTons: modeledUhiKg * MTONS,
    uhiSharePct: modeledKg ? (100 * modeledUhiKg) / modeledKg : 0,
    modeledRetrofitMTons: modeledRetrofitKg * MTONS,
    meanTons,
    medianTons,
    meanIntensity: buildings.length
      ? buildings.reduce((s, b) => s + b.carbonKg, 0) / floorM2
      : 0,
  }
}

/** Per-metro table (always all four, independent of filter). */
export function metroBreakdown() {
  const ds = loadDataset()
  return METRO_LIST.map((m) => {
    const bs = ds.byMetro[m.id]
    const s = computeSummary(bs)
    return {
      id: m.id,
      name: m.short,
      fullName: m.name,
      population: m.population,
      totalMTons: s.modeledMTons,
      perCapitaTons: (s.modeledMTons * 1e6) / m.population,
      uhiSharePct: s.uhiSharePct,
      meanTons: s.meanTons,
      sample: bs.length,
      modeledCount: s.modeledCount,
      summerHighF: m.summerHighF,
      baseCDD: m.baseCDD,
    }
  })
}

/** Carbon share by building type (modeled). */
export function typeBreakdown(buildings) {
  const acc = {
    residential: { type: 'residential', kg: 0, count: 0 },
    commercial: { type: 'commercial', kg: 0, count: 0 },
    industrial: { type: 'industrial', kg: 0, count: 0 },
  }
  for (const b of buildings) {
    acc[b.type].kg += b.carbonKg * expFor(b)
    acc[b.type].count += 1
  }
  const total = Object.values(acc).reduce((s, t) => s + t.kg, 0) || 1
  return Object.values(acc).map((t) => ({
    ...t,
    mtons: t.kg * MTONS,
    pct: (100 * t.kg) / total,
  }))
}

/** Histogram of per-building annual tons (log-ish bins). */
export function distributionBins(buildings) {
  const bins = [
    { label: '<5', lo: 0, hi: 5 },
    { label: '5–10', lo: 5, hi: 10 },
    { label: '10–25', lo: 10, hi: 25 },
    { label: '25–50', lo: 25, hi: 50 },
    { label: '50–100', lo: 50, hi: 100 },
    { label: '100–250', lo: 100, hi: 250 },
    { label: '250–500', lo: 250, hi: 500 },
    { label: '500–1k', lo: 500, hi: 1000 },
    { label: '1k–2.5k', lo: 1000, hi: 2500 },
    { label: '>2.5k', lo: 2500, hi: Infinity },
  ].map((b) => ({ ...b, count: 0 }))
  for (const b of buildings) {
    const t = b.carbonTons
    const bin = bins.find((x) => t >= x.lo && t < x.hi)
    if (bin) bin.count++
  }
  return bins
}

/** Concentration (Lorenz-style): share of carbon vs share of buildings. */
export function concentrationCurve(buildings) {
  const sorted = [...buildings].sort((a, b) => b.carbonKg - a.carbonKg)
  const total = sorted.reduce((s, b) => s + b.carbonKg, 0) || 1
  // prefix sums so each curve point is O(1)
  const prefix = new Array(sorted.length + 1)
  prefix[0] = 0
  for (let j = 0; j < sorted.length; j++) prefix[j + 1] = prefix[j] + sorted[j].carbonKg
  const pts = [{ buildingsPct: 0, carbonPct: 0 }]
  const steps = 50
  for (let i = 1; i <= steps; i++) {
    const upto = Math.floor((i / steps) * sorted.length)
    pts.push({ buildingsPct: (100 * i) / steps, carbonPct: (100 * prefix[upto]) / total })
  }
  // headline: share of carbon from top 10%
  const top10 = Math.floor(sorted.length * 0.1)
  let s10 = 0
  for (let j = 0; j < top10; j++) s10 += sorted[j].carbonKg
  return { pts, top10Pct: (100 * s10) / total }
}

export function topEmitters(buildings, n = 20) {
  return [...buildings].sort((a, b) => b.carbonKg - a.carbonKg).slice(0, n)
}

/**
 * Carbon intensity by construction era — ordinal.
 * `intensity` = total kg/m²; `hvacIntensity` = temperature-driven kg/m² only
 * (total minus the age-independent baseline), which is the vintage signal.
 */
export function vintageIntensity(buildings) {
  const bands = [
    { label: 'Pre-1960', lo: 0, hi: 1960 },
    { label: '1960s–70s', lo: 1960, hi: 1980 },
    { label: '1980s–90s', lo: 1980, hi: 2000 },
    { label: '2000s–10s', lo: 2000, hi: 2015 },
    { label: '2015+', lo: 2015, hi: 3000 },
  ].map((b) => ({ ...b, kg: 0, hvacKg: 0, m2: 0, count: 0 }))
  for (const b of buildings) {
    const band = bands.find((x) => b.yearBuilt >= x.lo && b.yearBuilt < x.hi)
    if (band) {
      const baselineKg =
        (MODEL_PARAMS.intensities[b.type]?.baseline || 0) *
        b.floorAreaM2 *
        MODEL_PARAMS.gridKgCO2PerKwh
      band.kg += b.carbonKg
      band.hvacKg += Math.max(0, b.carbonKg - baselineKg)
      band.m2 += b.floorAreaM2
      band.count++
    }
  }
  return bands.map((b) => ({
    ...b,
    intensity: b.m2 ? b.kg / b.m2 : 0,
    hvacIntensity: b.m2 ? b.hvacKg / b.m2 : 0,
  }))
}

/** UHI: bucket buildings by hyperlocal anomaly, mean cooling intensity per bucket. */
export function uhiBuckets(buildings) {
  const buckets = [
    { label: '0–1°F', lo: 0, hi: 1 },
    { label: '1–2.5°F', lo: 1, hi: 2.5 },
    { label: '2.5–4°F', lo: 2.5, hi: 4 },
    { label: '4–6°F', lo: 4, hi: 6 },
    { label: '6°F+', lo: 6, hi: 99 },
  ].map((b) => ({ ...b, coolKwh: 0, m2: 0, count: 0, uhiKg: 0, kg: 0 }))
  for (const b of buildings) {
    const k = buckets.find((x) => b.uhiDeltaF >= x.lo && b.uhiDeltaF < x.hi)
    if (k) {
      k.coolKwh += b.coolingKwh
      k.m2 += b.floorAreaM2
      k.count++
      k.uhiKg += b.uhiPenaltyKg
      k.kg += b.carbonKg
    }
  }
  return buckets.map((k) => ({
    ...k,
    coolingIntensity: k.m2 ? k.coolKwh / k.m2 : 0,
    uhiSharePct: k.kg ? (100 * k.uhiKg) / k.kg : 0,
  }))
}

/** Simple grid hotspot detection (Getis-Ord-style z-score on cell sums). */
export function hotspots(buildings, cell = 0.02) {
  const map = new Map()
  for (const b of buildings) {
    const key = `${Math.round(b.lat / cell)}|${Math.round(b.lng / cell)}`
    const e = map.get(key) || { lat: 0, lng: 0, kg: 0, n: 0 }
    e.lat += b.lat
    e.lng += b.lng
    e.kg += b.carbonKg
    e.n++
    map.set(key, e)
  }
  const cells = [...map.values()]
    .filter((c) => c.n >= 4)
    .map((c) => ({ lat: c.lat / c.n, lng: c.lng / c.n, kg: c.kg, n: c.n }))
  if (cells.length < 3) return []
  const mean = cells.reduce((s, c) => s + c.kg, 0) / cells.length
  const sd = Math.sqrt(cells.reduce((s, c) => s + (c.kg - mean) ** 2, 0) / cells.length) || 1
  return cells
    .map((c) => ({ ...c, z: (c.kg - mean) / sd }))
    .filter((c) => c.z > 1.6)
    .sort((a, b) => b.z - a.z)
    .slice(0, 12)
}

// ---------- formatting helpers ----------
export function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e9) return (n / 1e9).toFixed(digits) + 'B'
  if (abs >= 1e6) return (n / 1e6).toFixed(digits) + 'M'
  if (abs >= 1e4) return (n / 1e3).toFixed(0) + 'K'
  if (abs >= 1e3) return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (abs >= 100) return n.toFixed(0)
  if (abs >= 10) return n.toFixed(digits)
  return n.toFixed(abs >= 1 ? digits : 2)
}

export function fmtInt(n) {
  return Math.round(n).toLocaleString('en-US')
}

export function fmtMoney(n) {
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B'
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(n)
}

/** CO2 equivalents for storytelling. */
export const EQUIV = {
  carsPerTon: 1 / 4.6,      // EPA: typical passenger vehicle ≈ 4.6 t CO2/yr
  homesPerTon: 1 / 7.5,     // typical TX home energy ≈ 7.5 t CO2/yr (model output)
  treesPerTon: 1000 / 21,   // urban tree sequesters ≈ 21 kg CO2/yr
}
