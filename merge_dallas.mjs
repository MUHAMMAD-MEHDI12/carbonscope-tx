import { createReadStream, writeFileSync, mkdirSync, existsSync, statSync } from 'fs'
import { chain } from 'stream-chain'
import { parser } from 'stream-json'
import { streamArray } from 'stream-json/streamers/stream-array.js'
import { pick } from 'stream-json/filters/pick.js'

const args = process.argv.slice(2)
const getArg = (name, dflt) => {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const DALLAS_FILE = getArg('dallas', null)
const SOURCE_FILE = getArg('source', null)
const MAX = parseInt(getArg('max', '3000'), 10)
const RADIUS_M = parseFloat(getArg('radius-m', '150'))
const FORCE_NDVI_FIELD = getArg('ndvi-field', null)
const FORCE_CARBON_FIELD = getArg('carbon-field', null)

const AOI = [-96.96, 32.62, -96.65, 32.87]

if (!DALLAS_FILE || !existsSync(DALLAS_FILE)) {
  console.error('ERROR: pass --dallas "<path to dallas_buildings.geojson>"')
  process.exit(1)
}
if (!SOURCE_FILE || !existsSync(SOURCE_FILE)) {
  console.error('ERROR: pass --source "<path to buildings_with_carbon_footprints.geojson>"')
  process.exit(1)
}

console.log(`Dallas positions file: ${DALLAS_FILE} (${(statSync(DALLAS_FILE).size / 1e6).toFixed(1)} MB)`)
console.log(`Source (NDVI/carbon):  ${SOURCE_FILE} (${(statSync(SOURCE_FILE).size / 1e6).toFixed(0)} MB)`)
console.log(`Dallas AOI: lng ${AOI[0]} -> ${AOI[2]}, lat ${AOI[1]} -> ${AOI[3]}`)
console.log(`Match radius: ${RADIUS_M} m\n`)

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

async function loadDallasBuildings() {
  const rows = []
  await new Promise((resolve, reject) => {
    const pipeline = chain([createReadStream(DALLAS_FILE, { encoding: 'utf8' }), parser(), pick({ filter: 'features' }), streamArray()])
    pipeline.on('data', ({ value: f }) => {
      const g = f.geometry
      if (!g) return
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null
      if (!polys) return
      let cx = 0, cy = 0, n = 0, area = 0
      for (const poly of polys) {
        const ring = poly[0]
        if (!ring || ring.length < 4) continue
        for (let i = 0; i < ring.length - 1; i++) { cx += ring[i][0]; cy += ring[i][1]; n++ }
        area += ringAreaM2(ring, ring[0][1])
      }
      if (!n || area < 25) return
      cx /= n; cy /= n
      if (!inAoi(cx, cy)) return
      let ring = null
      const outer = polys[0] && polys[0][0]
      if (outer && outer.length >= 4) {
        const pts = outer.slice(0, -1)
        const simplified = douglasPeucker(pts, 0.5 / 111320)
        ring = simplified.map(([x, y]) => [+y.toFixed(6), +x.toFixed(6)])
        if (ring.length < 3) ring = null
      }
      rows.push({ lat: cy, lng: cx, area: Math.round(area), ring })
    })
    pipeline.on('end', resolve)
    pipeline.on('error', reject)
  })
  return rows
}

console.log('Step 1: loading real Dallas positions...')
const dallasBuildings = await loadDallasBuildings()
console.log(`  Found ${dallasBuildings.length.toLocaleString()} real Dallas buildings (in-AOI)\n`)
if (!dallasBuildings.length) {
  console.error('No in-AOI buildings found in the Dallas file either - stopping.')
  process.exit(1)
}

let sample = dallasBuildings
if (dallasBuildings.length > MAX) {
  const large = dallasBuildings.filter((r) => r.area >= 2000)
  const rest = dallasBuildings.filter((r) => r.area < 2000)
  const need = Math.max(0, MAX - large.length)
  const step = rest.length / Math.max(1, need)
  const picked = []
  for (let i = 0; i < need; i++) picked.push(rest[Math.floor(i * step)])
  sample = large.concat(picked)
  console.log(`Sampled down to ${sample.length.toLocaleString()} buildings\n`)
}

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
  const pipeline = chain([createReadStream(SOURCE_FILE, { encoding: 'utf8' }), parser(), pick({ filter: 'features' }), streamArray()])
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
    pipeline.on('error', (e) => (scanned > 0 ? resolve(numericKeys) : reject(e)))
  })
}
console.log('Step 2: detecting NDVI/carbon field names in source file...')
const numericKeys = await detectFields()
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
  console.log(`  Carbon field: "${carbonField}" (${carbonUnits})`)
} else {
  console.log('  No carbon field found in source.')
  carbonField = null
}
let ndviField = FORCE_NDVI_FIELD
if (!ndviField) {
  const ranked = [...numericKeys.keys()].map((k) => [k, scoreNdvi(k)]).filter(([, s]) => s >= 4).sort((a, b) => b[1] - a[1])
  if (ranked.length) ndviField = ranked[0][0]
}
if (ndviField && numericKeys.has(ndviField)) console.log(`  NDVI field:   "${ndviField}"`)
else { console.log('  No NDVI field found in source.'); ndviField = null }

console.log('\nStep 3: collecting source-file points that are themselves inside the Dallas AOI...')
const PAD = RADIUS_M / 111320
const nearAoi = [AOI[0] - PAD, AOI[1] - PAD, AOI[2] + PAD, AOI[3] + PAD]
const sourcePoints = []
let scannedTotal = 0
await new Promise((resolve, reject) => {
  const pipeline = chain([createReadStream(SOURCE_FILE, { encoding: 'utf8' }), parser(), pick({ filter: 'features' }), streamArray()])
  pipeline.on('data', ({ value: f }) => {
    scannedTotal++
    if (scannedTotal % 300000 === 0) console.log(`  ...${scannedTotal.toLocaleString()} scanned, ${sourcePoints.length.toLocaleString()} near-Dallas matches so far`)
    const g = f.geometry
    if (!g) return
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null
    if (!polys) return
    const ring = polys[0] && polys[0][0]
    if (!ring || ring.length < 4) return
    let cx = 0, cy = 0, n = 0
    for (let i = 0; i < ring.length - 1; i++) { cx += ring[i][0]; cy += ring[i][1]; n++ }
    if (!n) return
    cx /= n; cy /= n
    if (cx < nearAoi[0] || cx > nearAoi[2] || cy < nearAoi[1] || cy > nearAoi[3]) return
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
    if (ndvi != null || tons != null) sourcePoints.push({ lat: cy, lng: cx, ndvi, tons })
  })
  pipeline.on('end', resolve)
  pipeline.on('error', reject)
})
console.log(`  Total scanned: ${scannedTotal.toLocaleString()}`)
console.log(`  Source points near Dallas (own coords): ${sourcePoints.length.toLocaleString()}\n`)

console.log('Step 4: matching each Dallas building to its nearest source point...')
function distM(lat1, lng1, lat2, lng2) {
  const dLat = (lat1 - lat2) * M_LAT
  const dLng = (lng1 - lng2) * 111320 * Math.cos((lat1 * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}
let matched = 0
const out = []
for (const b of sample) {
  let best = null
  let bestD = Infinity
  if (sourcePoints.length) {
    for (const sp of sourcePoints) {
      const d = distM(b.lat, b.lng, sp.lat, sp.lng)
      if (d < bestD) { bestD = d; best = sp }
    }
  }
  const row = [+b.lat.toFixed(5), +b.lng.toFixed(5), b.area]
  if (b.ring) row.push(b.ring)
  if (best && bestD <= RADIUS_M) {
    const bag = {}
    if (best.tons != null) bag.c = +best.tons.toFixed(2)
    if (best.ndvi != null) bag.n = +best.ndvi.toFixed(4)
    if (Object.keys(bag).length) { row.push(bag); matched++ }
  }
  out.push(row)
}
console.log(`  Matched ${matched.toLocaleString()} / ${sample.length.toLocaleString()} buildings within ${RADIUS_M}m\n`)

const outDir = 'src/data/real_buildings'
mkdirSync(outDir, { recursive: true })
let eW = 180, eS = 90, eE = -180, eN = -90
for (const r of out) {
  if (r[1] < eW) eW = r[1]
  if (r[1] > eE) eE = r[1]
  if (r[0] < eS) eS = r[0]
  if (r[0] > eN) eN = r[0]
}
const meta = {
  source: 'real-footprints',
  metro: 'dallas',
  sampled: out.length,
  matched_ndvi_or_carbon: matched,
  aoi: AOI,
  extent: [+eW.toFixed(4), +eS.toFixed(4), +eE.toFixed(4), +eN.toFixed(4)],
  note: 'positions + footprints from dallas_buildings.geojson (verified in-AOI); NDVI/carbon matched from nearest real building in source file within ' + RADIUS_M + 'm - never fabricated',
}
writeFileSync(`${outDir}/dallas_buildings.json`, JSON.stringify({ meta, buildings: out }))
console.log(`Wrote ${outDir}/dallas_buildings.json`)
console.log(`  Extent: ${meta.extent.join(', ')}`)
console.log('\nNext: npm run build && git add -A && git commit -m "fix: correct Dallas coords + real NDVI/carbon via nearest-match" && git push origin main && npm run deploy')
