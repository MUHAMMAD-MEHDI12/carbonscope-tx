/**
 * merge_dallas_csv.mjs
 * ------------------------------------------------------------------
 * Adds REAL NDVI to Dallas buildings using ndvi_hotspot_samples.csv —
 * confirmed trustworthy (its Dallas rows are genuinely in Dallas, TX,
 * unlike the GeoJSON files which had Dallas County, Alabama mixed in).
 *
 * Takes the already-correct Dallas positions (dallas_tx_raw.geojson,
 * or src/data/real_buildings/dallas_buildings.json) and, for each
 * building, finds the nearest NDVI sample point in the CSV within a
 * radius. If no real CSV point is close enough, that building's NDVI
 * is left unset (stays modeled) — never invented.
 *
 * USAGE (from repo root):
 *   node merge_dallas_csv.mjs --dallas dallas_tx_raw.geojson --csv "D:\Hackathon_work\ndvi_hotspot_samples.csv"
 *
 * Optional:
 *   --max 3000
 *   --radius-m 400        NDVI samples are sparse (996 for all of Dallas
 *                          County), so a wider radius than the building-
 *                          to-building merge is reasonable here.
 * ------------------------------------------------------------------
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { createReadStream } from 'fs'
import { chain } from 'stream-chain'
import { parser } from 'stream-json'
import { streamArray } from 'stream-json/streamers/stream-array.js'
import { pick } from 'stream-json/filters/pick.js'

const args = process.argv.slice(2)
const getArg = (name, dflt) => {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const DALLAS_FILE = getArg('dallas', 'dallas_tx_raw.geojson')
const CSV_FILE = getArg('csv', null)
const MAX = parseInt(getArg('max', '3000'), 10)
const RADIUS_M = parseFloat(getArg('radius-m', '400'))

if (!CSV_FILE) {
  console.error('ERROR: pass --csv "<path to ndvi_hotspot_samples.csv>"')
  process.exit(1)
}

const AOI = [-96.96, 32.62, -96.65, 32.87]
const M_LAT = 110574

function parseCSVLine(line) {
  const cells = []
  let cur = '',
    inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"'
        i++
      } else inQ = !inQ
    } else if (c === ',' && !inQ) {
      cells.push(cur)
      cur = ''
    } else cur += c
  }
  cells.push(cur)
  return cells
}

console.log('Loading Dallas NDVI samples from CSV...')
const csvText = readFileSync(CSV_FILE, 'utf8')
const lines = csvText.split('\n').filter((l) => l.trim())
const headers = parseCSVLine(lines[0])
const countyIdx = headers.findIndex((h) => h.trim() === 'County')
const ndviIdx = headers.findIndex((h) => h.trim() === 'NDVI')
const geoIdx = headers.findIndex((h) => h.trim() === '.geo')

const ndviSamples = [] // { lat, lng, ndvi }
for (let i = 1; i < lines.length; i++) {
  const cells = parseCSVLine(lines[i])
  const county = (cells[countyIdx] || '').trim()
  if (county !== 'Dallas') continue
  const ndviRaw = parseFloat(cells[ndviIdx])
  if (!Number.isFinite(ndviRaw)) continue
  let geo
  try {
    geo = JSON.parse(cells[geoIdx])
  } catch {
    continue
  }
  const [lng, lat] = geo.coordinates || []
  if (typeof lat !== 'number' || typeof lng !== 'number') continue
  ndviSamples.push({ lat, lng, ndvi: Math.max(-1, Math.min(1, ndviRaw)) })
}
console.log(`  Loaded ${ndviSamples.length} real Dallas NDVI samples from CSV\n`)
if (!ndviSamples.length) {
  console.error('No Dallas NDVI rows found in the CSV — check the County column values.')
  process.exit(1)
}

// ---- load Dallas building positions (GeoJSON, already-verified real Dallas TX) ----
console.log(`Loading Dallas building positions from ${DALLAS_FILE}...`)
const M_LAT2 = 110574
function ringAreaM2(ring, latRef) {
  const mLng = 111320 * Math.cos((latRef * Math.PI) / 180)
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    a += x1 * mLng * (y2 * M_LAT2) - x2 * mLng * (y1 * M_LAT2)
  }
  return Math.abs(a / 2)
}
function douglasPeucker(pts, tol) {
  if (pts.length <= 4) return pts
  const cosLat = Math.cos((pts[0][1] * Math.PI) / 180)
  const keep = new Array(pts.length).fill(false)
  keep[0] = true
  keep[pts.length - 1] = true
  const segDist = (p, a, b) => {
    const ax = a[0] * cosLat,
      ay = a[1],
      bx = b[0] * cosLat,
      by = b[1]
    const px = p[0] * cosLat,
      py = p[1]
    const dx = bx - ax,
      dy = by - ay
    const len2 = dx * dx + dy * dy
    if (!len2) return Math.hypot(px - ax, py - ay)
    let t = ((px - ax) * dx + (py - ay) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let maxD = 0,
      idx = -1
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i], pts[a], pts[b])
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = true
      stack.push([a, idx], [idx, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}
const inAoi = (lng, lat) => lng >= AOI[0] && lng <= AOI[2] && lat >= AOI[1] && lat <= AOI[3]

const dallasBuildings = []
await new Promise((resolve, reject) => {
  const pipeline = chain([createReadStream(DALLAS_FILE, { encoding: 'utf8' }), parser(), pick({ filter: 'features' }), streamArray()])
  pipeline.on('data', ({ value: f }) => {
    const g = f.geometry
    if (!g) return
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null
    if (!polys) return
    let cx = 0,
      cy = 0,
      n = 0,
      area = 0
    for (const poly of polys) {
      const ring = poly[0]
      if (!ring || ring.length < 4) continue
      for (let i = 0; i < ring.length - 1; i++) {
        cx += ring[i][0]
        cy += ring[i][1]
        n++
      }
      area += ringAreaM2(ring, ring[0][1])
    }
    if (!n || area < 25) return
    cx /= n
    cy /= n
    if (!inAoi(cx, cy)) return
    let ring = null
    const outer = polys[0] && polys[0][0]
    if (outer && outer.length >= 4) {
      const pts = outer.slice(0, -1)
      const simplified = douglasPeucker(pts, 0.5 / 111320)
      ring = simplified.map(([x, y]) => [+y.toFixed(6), +x.toFixed(6)])
      if (ring.length < 3) ring = null
    }
    dallasBuildings.push({ lat: cy, lng: cx, area: Math.round(area), ring })
  })
  pipeline.on('end', resolve)
  pipeline.on('error', reject)
})
console.log(`  Found ${dallasBuildings.length.toLocaleString()} real Dallas, TX buildings (in-AOI)\n`)

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

// ---- nearest-neighbor match: building -> nearest real NDVI sample ----
console.log('Matching each building to its nearest real NDVI sample...')
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
  for (const sp of ndviSamples) {
    const d = distM(b.lat, b.lng, sp.lat, sp.lng)
    if (d < bestD) {
      bestD = d
      best = sp
    }
  }
  const row = [+b.lat.toFixed(5), +b.lng.toFixed(5), b.area]
  if (b.ring) row.push(b.ring)
  if (best && bestD <= RADIUS_M) {
    row.push({ n: +best.ndvi.toFixed(4) })
    matched++
  }
  out.push(row)
}
console.log(`  Matched real NDVI for ${matched.toLocaleString()} / ${sample.length.toLocaleString()} buildings (within ${RADIUS_M}m)\n`)

const outDir = 'src/data/real_buildings'
mkdirSync(outDir, { recursive: true })
let eW = 180,
  eS = 90,
  eE = -180,
  eN = -90
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
  matched_ndvi: matched,
  aoi: AOI,
  extent: [+eW.toFixed(4), +eS.toFixed(4), +eE.toFixed(4), +eN.toFixed(4)],
  ndvi: { field: 'NDVI', source: 'GEE CSV (ndvi_hotspot_samples.csv)', n_with_ndvi: matched },
  note:
    'positions + footprints from verified Dallas, TX buildings; NDVI matched from nearest real GEE sample within ' +
    RADIUS_M +
    'm — never fabricated. Carbon still modeled (no real Dallas carbon source found yet).',
}
writeFileSync(`${outDir}/dallas_buildings.json`, JSON.stringify({ meta, buildings: out }))
console.log(`Wrote ${outDir}/dallas_buildings.json`)
console.log(`  Extent: ${meta.extent.join(', ')}`)
console.log('\nNext: npm run build && git add -A && git commit -m "fix: real Dallas NDVI from GEE CSV" && git push origin main && npm run deploy')
