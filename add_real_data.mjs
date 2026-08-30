/**
 * add_real_data.mjs
 * ------------------------------------------------------------------
 * Extracts REAL positions, footprints, NDVI, and carbon from your
 * team's big GeoJSON (buildings_with_gee_ndvi_and_hotspots.geojson,
 * or buildings_with_carbon_footprints.geojson) into the dashboard's
 * compact format — for ANY metro (dallas / austin / sanantonio).
 *
 * This fixes the Dallas gap: prepare_buildings.mjs already auto-detects
 * carbon but never looked for NDVI, and csv_to_buildings.mjs only ever
 * had NDVI + point coords (no real footprints, no carbon). This script
 * pulls NDVI + carbon + real footprint polygons from the SAME big file
 * in one pass, so nothing gets clobbered or left synthetic.
 *
 * Streams the file (doesn't load it all into memory) so it's safe on
 * 900MB-1.2GB files without needing --max-old-space-size flags.
 *
 * USAGE (from repo root, after `npm install`):
 *   node add_real_data.mjs --metro dallas --file "D:\Hackathon_work\buildings_with_gee_ndvi_and_hotspots.geojson"
 *   node add_real_data.mjs --metro austin --file "D:\Hackathon_work\buildings_with_gee_ndvi_and_hotspots.geojson"
 *   node add_real_data.mjs --metro sanantonio --file "D:\Hackathon_work\buildings_with_gee_ndvi_and_hotspots.geojson"
 *
 * Optional flags:
 *   --max 5000          sample cap (default 5000, matches Austin/SA)
 *   --anywhere           don't filter to the metro's captured AOI box
 *   --ndvi-field NAME     force a specific property name for NDVI
 *   --carbon-field NAME   force a specific property name for carbon
 *
 * Output: src/data/real_buildings/<metro>_buildings.json
 * (same compact format the dashboard already reads — no other code
 * needs to change)
 * ------------------------------------------------------------------
 */
import { createReadStream, writeFileSync, mkdirSync, existsSync, statSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { chain } from 'stream-chain'
import { parser } from 'stream-json'
import { streamArray } from 'stream-json/streamers/stream-array.js'
import { pick } from 'stream-json/filters/pick.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = process.cwd() // run this from the repo root

// ---------------- args ----------------
const args = process.argv.slice(2)
const getArg = (name, dflt) => {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const METRO = getArg('metro', 'dallas')
const FILE = getArg('file', null)
const MAX = parseInt(getArg('max', '5000'), 10)
const ANYWHERE = args.includes('--anywhere')
const FORCE_NDVI_FIELD = getArg('ndvi-field', null)
const FORCE_CARBON_FIELD = getArg('carbon-field', null)

const AOIS = {
  dallas: [-96.96, 32.62, -96.65, 32.87],       // full Dallas County
  austin: [-97.88, 30.15, -97.60, 30.40],       // full Travis County
  sanantonio: [-98.65, 29.30, -98.35, 29.55],   // full Bexar County
}
const AOI = AOIS[METRO]
if (!AOI) {
  console.error(`Unknown metro "${METRO}". Options: ${Object.keys(AOIS).join(', ')}`)
  process.exit(1)
}
if (!FILE || !existsSync(FILE)) {
  console.error(`ERROR: pass --file "<path to your big geojson>"`)
  process.exit(1)
}
console.log(`Metro: ${METRO}`)
console.log(`File:  ${FILE} (${(statSync(FILE).size / 1e6).toFixed(0)} MB)`)
console.log(`AOI:   lng ${AOI[0]} → ${AOI[2]}, lat ${AOI[1]} → ${AOI[3]}${ANYWHERE ? '  (filter OFF, --anywhere)' : ''}`)

// ---------------- field auto-detection (first pass, first 800 features) ----------------
function scoreCarbon(k) {
  const n = k.toLowerCase()
  if (/per_?m2|intensity|factor|rate|eui/.test(n)) return -1
  let s = 0
  if (/co2|carbon/.test(n)) s += 4
  if (/emis|ghg/.test(n)) s += 3
  if (/total|annual|yr|year/.test(n)) s += 2
  if (/(^|_)(t|tons?|tonnes|kg)($|_)/.test(n)) s += 1
  return s
}
function scoreNdvi(k) {
  const n = k.toLowerCase()
  let s = 0
  if (/ndvi/.test(n)) s += 5
  if (/mean/.test(n)) s += 1
  if (/veg|green/.test(n)) s += 1
  return s
}

async function detectFields() {
  const numericKeys = new Map()
  let scanned = 0
  const pipeline = chain([
    createReadStream(FILE, { encoding: 'utf8' }),
    parser(),
    pick({ filter: 'features' }),
    streamArray(),
  ])
  return new Promise((resolve, reject) => {
    pipeline.on('data', ({ value: f }) => {
      if (scanned >= 800) return
      const p = f.properties || {}
      for (const [k, v] of Object.entries(p)) {
        const num = typeof v === 'number' ? v : typeof v === 'string' && v !== '' && Number.isFinite(+v) ? +v : null
        if (num == null) continue
        if (!numericKeys.has(k)) numericKeys.set(k, [])
        const arr = numericKeys.get(k)
        if (arr.length < 200) arr.push(num)
      }
      scanned++
      if (scanned >= 800) pipeline.destroy()
    })
    pipeline.on('close', () => resolve(numericKeys))
    pipeline.on('error', (e) => {
      if (scanned > 0) resolve(numericKeys) // partial scan is fine
      else reject(e)
    })
  })
}

console.log('\nScanning property names (first 800 features)...')
const numericKeys = await detectFields()
console.log(`Numeric properties found: ${[...numericKeys.keys()].join(', ') || '(none)'}`)

let carbonField = FORCE_CARBON_FIELD
if (!carbonField) {
  const ranked = [...numericKeys.keys()].map((k) => [k, scoreCarbon(k)]).filter(([, s]) => s >= 3).sort((a, b) => b[1] - a[1])
  if (ranked.length) carbonField = ranked[0][0]
}
let carbonUnits = null
if (carbonField && numericKeys.has(carbonField)) {
  const vals = numericKeys.get(carbonField).filter((v) => v > 0).sort((a, b) => a - b)
  const median = vals[Math.floor(vals.length / 2)] || 0
  const n = carbonField.toLowerCase()
  carbonUnits = /kg/.test(n) ? 'kg' : /(^|_)(t|tons?|tonnes|tco2e?)($|_)/.test(n) ? 'tons' : median > 1500 ? 'kg' : 'tons'
  console.log(`✓ Carbon field:  "${carbonField}" (units: ${carbonUnits}, median ${median.toLocaleString()})`)
} else {
  console.log('⚠ No carbon field detected — carbon will stay modeled for this run.')
  carbonField = null
}

let ndviField = FORCE_NDVI_FIELD
if (!ndviField) {
  const ranked = [...numericKeys.keys()].map((k) => [k, scoreNdvi(k)]).filter(([, s]) => s >= 4).sort((a, b) => b[1] - a[1])
  if (ranked.length) ndviField = ranked[0][0]
}
if (ndviField && numericKeys.has(ndviField)) {
  console.log(`✓ NDVI field:    "${ndviField}"`)
} else {
  console.log('⚠ No NDVI field detected — NDVI will stay modeled for this run.')
  ndviField = null
}

// ---------------- main streaming pass ----------------
const M_LAT = 110574
function ringAreaM2(ring, latRef) {
  const mLng = 111320 * Math.cos((latRef * Math.PI) / 180)
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    a += x1 * mLng * (y2 * M_LAT) - x2 * mLng * (y1 * M_LAT)
  }
  return Math.abs(a / 2)
}
const inAoi = (lng, lat) => lng >= AOI[0] && lng <= AOI[2] && lat >= AOI[1] && lat <= AOI[3]

function douglasPeucker(pts, tol) {
  if (pts.length <= 4) return pts
  const cosLat = Math.cos((pts[0][1] * Math.PI) / 180)
  const keep = new Array(pts.length).fill(false)
  keep[0] = true
  keep[pts.length - 1] = true
  const segDist = (p, a, b) => {
    const ax = a[0] * cosLat, ay = a[1], bx = b[0] * cosLat, by = b[1]
    const px = p[0] * cosLat, py = p[1]
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    if (!len2) return Math.hypot(px - ax, py - ay)
    let t = ((px - ax) * dx + (py - ay) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let maxD = 0, idx = -1
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i], pts[a], pts[b])
      if (d > maxD) { maxD = d; idx = i }
    }
    if (maxD > tol && idx > 0) { keep[idx] = true; stack.push([a, idx], [idx, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

const rows = []
let total = 0
let skippedGeom = 0

console.log('\nStreaming full file (this is the slow part, 2-6 min for ~1GB)...')
await new Promise((resolve, reject) => {
  const pipeline = chain([
    createReadStream(FILE, { encoding: 'utf8' }),
    parser(),
    pick({ filter: 'features' }),
    streamArray(),
  ])
  pipeline.on('data', ({ value: f }) => {
    total++
    if (total % 200000 === 0) console.log(`  ...${total.toLocaleString()} features scanned, ${rows.length.toLocaleString()} kept so far`)
    const g = f.geometry
    if (!g) { skippedGeom++; return }
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null
    if (!polys) { skippedGeom++; return }
    let cx = 0, cy = 0, n = 0, area = 0
    for (const poly of polys) {
      const ring = poly[0]
      if (!ring || ring.length < 4) continue
      for (let i = 0; i < ring.length - 1; i++) { cx += ring[i][0]; cy += ring[i][1]; n++ }
      area += ringAreaM2(ring, ring[0][1])
    }
    if (!n || area < 25) return
    cx /= n; cy /= n
    if (!ANYWHERE && !inAoi(cx, cy)) return

    let ring = null
    const outer = polys[0] && polys[0][0]
    if (outer && outer.length >= 4) {
      const pts = outer.slice(0, -1)
      const simplified = douglasPeucker(pts, 0.5 / 111320)
      ring = simplified.map(([x, y]) => [+y.toFixed(6), +x.toFixed(6)])
      if (ring.length < 3) ring = null
    }

    const p = f.properties || {}
    let ndvi = null
    if (ndviField && p[ndviField] != null) {
      const v = typeof p[ndviField] === 'number' ? p[ndviField] : +p[ndviField]
      if (Number.isFinite(v)) ndvi = Math.max(-1, Math.min(1, v))
    }
    let tons = null
    if (carbonField && p[carbonField] != null) {
      const raw = typeof p[carbonField] === 'number' ? p[carbonField] : +p[carbonField]
      if (Number.isFinite(raw) && raw > 0) {
        const t = carbonUnits === 'kg' ? raw / 1000 : raw
        if (t >= 0.01 && t <= 200000) tons = t
      }
    }

    // format: [lat, lng, area_m2, ring?, {c, n}?]  — matches dashboard's parser
    const row = [+cy.toFixed(5), +cx.toFixed(5), Math.round(area)]
    if (ring) row.push(ring)
    if (ndvi != null || tons != null) {
      const bag = {}
      if (tons != null) bag.c = +tons.toFixed(2)
      if (ndvi != null) bag.n = +ndvi.toFixed(4)
      row.push(bag)
    }
    rows.push(row)
  })
  pipeline.on('end', resolve)
  pipeline.on('error', reject)
})

console.log(`\nTotal features in file: ${total.toLocaleString()}`)
console.log(`Skipped (no polygon geometry): ${skippedGeom.toLocaleString()}`)
console.log(ANYWHERE ? `Kept (no AOI filter): ${rows.length.toLocaleString()}` : `Inside ${METRO} AOI: ${rows.length.toLocaleString()}`)

if (!rows.length) {
  console.error('\nNo buildings matched. Try --anywhere to skip the AOI filter and check coverage.')
  process.exit(1)
}

// ---------------- stratified sample (keep all large buildings) ----------------
let sample = rows
if (rows.length > MAX) {
  const large = rows.filter((r) => r[2] >= 2000)
  const rest = rows.filter((r) => r[2] < 2000)
  const need = Math.max(0, MAX - large.length)
  const step = rest.length / Math.max(1, need)
  const picked = []
  for (let i = 0; i < need; i++) picked.push(rest[Math.floor(i * step)])
  sample = large.concat(picked)
  console.log(`Sampled ${sample.length.toLocaleString()} (all ${large.length} large + ${picked.length} smaller)`)
}

// ---------------- write output ----------------
const outDir = join(ROOT, 'src', 'data', 'real_buildings')
mkdirSync(outDir, { recursive: true })

let eW = 180, eS = 90, eE = -180, eN = -90
let nWithNdvi = 0, nWithCarbon = 0, sumTons = 0
for (const r of sample) {
  const [la, ln] = r
  if (ln < eW) eW = ln
  if (ln > eE) eE = ln
  if (la < eS) eS = la
  if (la > eN) eN = la
  const last = r[r.length - 1]
  if (last && typeof last === 'object' && !Array.isArray(last)) {
    if (last.n != null) nWithNdvi++
    if (last.c != null) { nWithCarbon++; sumTons += last.c }
  }
}

const out = {
  meta: {
    source: 'real-footprints',
    metro: METRO,
    total_in_file: total,
    total_matched: rows.length,
    sampled: sample.length,
    aoi: AOI,
    extent: [+eW.toFixed(4), +eS.toFixed(4), +eE.toFixed(4), +eN.toFixed(4)],
    anywhere: ANYWHERE,
    note: 'positions + footprint areas + NDVI + carbon are real where present; type/vintage/roof stay model estimates',
    ndvi: { field: ndviField, n_with_ndvi: nWithNdvi },
    carbon: carbonField
      ? { field: carbonField, units_in_file: carbonUnits, n_with_carbon: nWithCarbon, sum_tons: Math.round(sumTons), mean_tons: nWithCarbon ? +(sumTons / nWithCarbon).toFixed(2) : 0 }
      : null,
  },
  buildings: sample,
}
const outPath = join(outDir, `${METRO}_buildings.json`)
writeFileSync(outPath, JSON.stringify(out))
console.log(`\n✔ Wrote ${outPath}`)
console.log(`  NDVI real for:   ${nWithNdvi.toLocaleString()} / ${sample.length.toLocaleString()} buildings`)
console.log(`  Carbon real for: ${nWithCarbon.toLocaleString()} / ${sample.length.toLocaleString()} buildings`)
console.log('\nNext: npm run build && git add -A && git commit -m "fix: real NDVI + carbon for ' + METRO + '" && git push origin main && npm run deploy')
