/**
 * Synthetic building-stock generator (deterministic, seeded).
 *
 * Produces per-building records with the exact schema the real pipeline emits
 * (see README → data contract), then runs each through the physical energy
 * model. Replace this module's output with real data and nothing downstream
 * changes.
 */
import { METROS } from './metros.js'
import { mulberry32, makeGaussian, makeChoice, clamp } from './rng.js'
import {
  calculateBuildingCarbon,
  coolRoofSavingsKg,
  localDegreeDays,
  MODEL_PARAMS,
} from '../model/energyModel.js'
import { MEASURED, measuredTileFor } from './measuredTiles.js'
import { REAL_BUILDINGS } from './realBuildings.js'

/** Nearest district (for labeling + type/vintage context) when using real footprints. */
function nearestDistrict(metro, lat, lng) {
  let best = metro.districts[0]
  let bestD = Infinity
  for (const d of metro.districts) {
    const dd = (d.center[0] - lat) ** 2 + (d.center[1] - lng) ** 2
    if (dd < bestD) {
      bestD = dd
      best = d
    }
  }
  // ~degrees → km (rough): is the building far outside the mapped districts?
  const farKm = Math.sqrt(bestD) * 105
  return { d: best, far: farKm > 6 }
}

// ---- REAL FortyGuard captures -----------------------------------------------
// Buildings that fall inside a captured AOI take their hyperlocal heat anomaly
// from the MEASURED tile they sit in, instead of the urban-form model.
// Houston ships with the repo; add Dallas/Austin/San Antonio via
// scripts/capture_metros.py + scripts/compact_tiles.mjs (see measuredTiles.js).

const KM_PER_DEG_LAT = 111.32

// Footprint area (m²) log-normal-ish parameters per type
const SIZE_BY_TYPE = {
  residential: { min: 70, mode: 145, max: 480 },
  commercial: { min: 150, mode: 430, max: 9000 },
  industrial: { min: 400, mode: 1750, max: 24000 },
}

const STORIES_BY_TYPE = {
  residential: [[1, 0.55], [2, 0.4], [3, 0.05]],
  commercial: [[1, 0.5], [2, 0.26], [3, 0.1], [5, 0.07], [8, 0.04], [14, 0.022], [24, 0.008]],
  industrial: [[1, 0.85], [2, 0.15]],
}

function sampleSize(rand, gauss, type, sizeBoost) {
  const s = SIZE_BY_TYPE[type]
  // skewed distribution: log-space gaussian around the mode; sizeBoost shifts
  // the district's mix upward (downtown towers, big-box industrial) but is
  // tempered so the stratified sample stays close to stock-mean sizes
  const boost = 1 + (sizeBoost - 1) * 0.48
  const mu = Math.log(s.mode * boost)
  const sigma = type === 'residential' ? 0.35 : 0.8
  return clamp(Math.exp(gauss(mu, sigma)), s.min, s.max * Math.max(1, boost * 0.7))
}

function footprintPolygon(rand, lat, lng, areaM2) {
  // Rotated rectangle approximating the footprint, in [lat, lng] rings
  const aspect = 0.5 + rand() * 1.3
  const wM = Math.sqrt(areaM2 * aspect)
  const hM = areaM2 / wM
  const theta = rand() * Math.PI
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
  const toLat = (dxM, dyM) => lat + ((dxM * -sin + dyM * cos) / 1000) / KM_PER_DEG_LAT
  const toLng = (dxM, dyM) => lng + ((dxM * cos + dyM * sin) / 1000) / kmPerDegLng
  const hw = wM / 2
  const hh = hM / 2
  return [
    [toLat(-hw, -hh), toLng(-hw, -hh)],
    [toLat(hw, -hh), toLng(hw, -hh)],
    [toLat(hw, hh), toLng(hw, hh)],
    [toLat(-hw, hh), toLng(-hw, hh)],
  ]
}

/** Generate the full sample for one metro. */
export function generateMetroBuildings(metroId) {
  const metro = METROS[metroId]
  const rand = mulberry32(hashCode(metroId) ^ 0x51ab3)
  const gauss = makeGaussian(rand)
  const choice = makeChoice(rand)

  const districtPick = metro.districts.map((d) => [d, d.weight])
  const buildings = []

  // If real footprints exist for this metro (scripts/prepare_buildings.mjs),
  // use REAL positions + areas; otherwise procedural placement.
  const real = REAL_BUILDINGS[metroId]
  const count = real ? real.buildings.length : metro.sampleSize

  for (let i = 0; i < count; i++) {
    let d
    let lat
    let lng
    let type
    let footprintM2

    let farFromDistricts = false
    let realRing = null
    let teamTons = null
    let realNdvi = null
    if (real) {
      const rb = real.buildings[i]
      lat = rb[0]
      lng = rb[1]
      footprintM2 = Math.max(30, Math.round(rb[2]))
      // Extras after [lat,lng,area]: an Array is the true footprint ring; a
      // finite number is the TEAM-computed annual carbon (t CO2e), old-style;
      // a plain object {c, n} carries real carbon (t CO2e) and/or real NDVI
      // together (current prepare_buildings.mjs / add_real_data.mjs output).
      // Order-independent so old files still load.
      for (let k = 3; k < rb.length; k++) {
        const v = rb[k]
        if (Array.isArray(v)) realRing = v
        else if (Number.isFinite(v) && v > 0) teamTons = v
        else if (v && typeof v === 'object') {
          if (Number.isFinite(v.c) && v.c > 0) teamTons = v.c
          if (Number.isFinite(v.n)) realNdvi = v.n
        }
      }
      const nd = nearestDistrict(metro, lat, lng)
      d = nd.d
      farFromDistricts = nd.far
      // type from REAL footprint area (per the plan's classification), with
      // district context breaking ties for the largest stock
      if (footprintM2 < 450) type = 'residential'
      else if (footprintM2 < 2500) type = 'commercial'
      else {
        const indW = d.types.find((t) => t[0] === 'industrial')?.[1] || 0
        type = indW >= 0.3 || rand() < 0.4 ? 'industrial' : 'commercial'
      }
    } else {
      d = choice(districtPick)
      // position: gaussian scatter around district center
      const spreadLat = d.spreadKm / KM_PER_DEG_LAT
      const spreadLng = d.spreadKm / (KM_PER_DEG_LAT * Math.cos((d.center[0] * Math.PI) / 180))
      lat = gauss(d.center[0], spreadLat * 0.55)
      lng = gauss(d.center[1], spreadLng * 0.55)
      type = choice(d.types)
      footprintM2 = Math.round(sampleSize(rand, gauss, type, d.sizeBoost))
    }
    const stories = choice(STORIES_BY_TYPE[type])
    const floorAreaM2 = footprintM2 * stories

    const yearBuilt = Math.round(clamp(gauss((d.vintage[0] + d.vintage[1]) / 2, (d.vintage[1] - d.vintage[0]) / 4), 1900, 2025))

    // Vegetation: real GEE NDVI when we have it for this building; otherwise
    // fall back to the district-based model (base + noise, paved-surface bias).
    const ndvi =
      realNdvi != null
        ? clamp(realNdvi, 0, 1)
        : clamp(gauss(d.ndvi, 0.06) - (type !== 'residential' ? 0.03 : 0), 0.03, 0.75)

    // Roof albedo: older commercial/industrial roofs skew dark
    let albedoBase = type === 'residential' ? 0.38 : 0.33
    if (yearBuilt > 2005) albedoBase += 0.1
    if (yearBuilt < 1975) albedoBase -= 0.05
    const roofAlbedo = clamp(gauss(albedoBase, 0.09), 0.12, 0.82)

    // FortyGuard hyperlocal temperature anomaly: district UHI + micro-scale noise,
    // slightly amplified by low vegetation. In Houston's captured AOI, the
    // anomaly comes from the MEASURED tile instead (°C above the AOI's 5th-pct
    // day max, converted to °F).
    let uhiDeltaF = clamp(gauss(d.uhiF, 0.9) + (0.25 - ndvi) * 2.0, 0, 11)
    let measured = false
    let tileMaxC = null
    let tileMinC = null
    const reg = MEASURED[metro.id]
    if (reg) {
      const t = measuredTileFor(metro.id, lat, lng)
      if (t) {
        uhiDeltaF = clamp((t[3] - reg.meta.p05_max) * 1.8, 0, 11)
        tileMaxC = t[3]
        tileMinC = t[4]
        measured = true
      }
    }
    const { cdd, hdd } = localDegreeDays(metro.baseCDD, metro.baseHDD, uhiDeltaF)

    const rec = {
      id: `${metro.id.toUpperCase().slice(0, 3)}-${String(i + 1).padStart(5, '0')}`,
      metro: metro.id,
      district: farFromDistricts ? `${metro.short} — outer corridor` : d.name,
      lat: round5(lat),
      lng: round5(lng),
      polygon: footprintPolygon(rand, lat, lng, footprintM2),
      type,
      footprintM2,
      stories,
      floorAreaM2,
      yearBuilt,
      roofAlbedo: round2(roofAlbedo),
      ndvi: round2(ndvi),
      uhiDeltaF: round1(uhiDeltaF),
      cdd: Math.round(cdd),
      hdd: Math.round(hdd),
      measured,
      tileMaxC,
      tileMinC,
      realFootprint: !!real,
      realRing,
      realNdvi: realNdvi != null,
    }

    const res = calculateBuildingCarbon(rec)
    rec.coolingKwh = Math.round(res.coolingKwh)
    rec.elecKwh = Math.round(res.elecKwh)
    rec.carbonKg = Math.round(res.carbonKg)
    rec.carbonTons = res.carbonKg / 1000
    rec.intensityKgM2 = round1(res.carbonKg / rec.floorAreaM2)
    rec.energyCostUsd = Math.round(res.energyCostUsd)
    rec.coolRoofSavingsKg = Math.round(coolRoofSavingsKg(rec, res))

    // UHI penalty: recompute at metro baseline degree days (cheap second pass)
    const base = calculateBuildingCarbon({ ...rec, cdd: metro.baseCDD, hdd: metro.baseHDD })
    rec.uhiPenaltyKg = Math.round(res.carbonKg - base.carbonKg)

    // TEAM-computed carbon (from the group's own GeoJSON): use it as this
    // building's annual total, scaling the model's internal split (electricity,
    // cooling, UHI share, savings) proportionally so charts stay consistent.
    if (teamTons != null) {
      const f = (teamTons * 1000) / Math.max(1, rec.carbonKg)
      rec.carbonKg = Math.round(teamTons * 1000)
      rec.carbonTons = teamTons
      rec.coolingKwh = Math.round(rec.coolingKwh * f)
      rec.elecKwh = Math.round(rec.elecKwh * f)
      rec.energyCostUsd = Math.round(rec.energyCostUsd * f)
      rec.coolRoofSavingsKg = Math.round(rec.coolRoofSavingsKg * f)
      rec.uhiPenaltyKg = Math.round(rec.uhiPenaltyKg * f)
      rec.intensityKgM2 = round1(rec.carbonKg / rec.floorAreaM2)
      rec.teamCarbon = true
    }

    buildings.push(rec)
  }

  // Percentile rank by carbon within the metro (for "top emitters" layer)
  const sorted = [...buildings].sort((a, b) => b.carbonKg - a.carbonKg)
  sorted.forEach((b, idx) => {
    b.rank = idx + 1
    b.pctile = round1(100 * (1 - idx / sorted.length))
  })

  return buildings
}

/** Semi-transparent temperature surface cells per metro (FortyGuard layer). */
export function generateTempGrid(metroId) {
  const metro = METROS[metroId]
  const cells = []
  const step = 0.012 // ~1.3 km cells
  // bounding box from districts
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
  metro.districts.forEach((d) => {
    const dLat = (d.spreadKm * 1.6) / KM_PER_DEG_LAT
    const dLng = (d.spreadKm * 1.6) / (KM_PER_DEG_LAT * Math.cos((d.center[0] * Math.PI) / 180))
    minLat = Math.min(minLat, d.center[0] - dLat)
    maxLat = Math.max(maxLat, d.center[0] + dLat)
    minLng = Math.min(minLng, d.center[1] - dLng)
    maxLng = Math.max(maxLng, d.center[1] + dLng)
  })
  for (let lat = minLat; lat < maxLat; lat += step) {
    for (let lng = minLng; lng < maxLng; lng += step) {
      // anomaly = max over gaussian district plumes
      let anomaly = 0
      for (const d of metro.districts) {
        const dKmLat = (lat + step / 2 - d.center[0]) * KM_PER_DEG_LAT
        const dKmLng = (lng + step / 2 - d.center[1]) * KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
        const dist2 = dKmLat * dKmLat + dKmLng * dKmLng
        const sigma = d.spreadKm * 0.75
        anomaly = Math.max(anomaly, d.uhiF * Math.exp(-dist2 / (2 * sigma * sigma)))
      }
      if (anomaly > 0.8) {
        cells.push({ lat: round5(lat), lng: round5(lng), step, uhiF: round1(anomaly) })
      }
    }
  }
  return cells
}

function hashCode(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h >>> 0
}
const round5 = (x) => Math.round(x * 1e5) / 1e5
const round2 = (x) => Math.round(x * 100) / 100
const round1 = (x) => Math.round(x * 10) / 10

export { MODEL_PARAMS }
