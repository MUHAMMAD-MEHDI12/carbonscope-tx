/**
 * Turn a real building-footprints GeoJSON (e.g. Microsoft Global ML Building
 * Footprints, or any FeatureCollection of Polygons) into the dashboard's
 * compact real-buildings file.
 *
 * USAGE (from the repo root):
 *   node scripts/prepare_buildings.mjs                       # processes data/dallas_buildings.geojson
 *   node scripts/prepare_buildings.mjs --metro dallas --file data/dallas_buildings.geojson
 *   node scripts/prepare_buildings.mjs --max 3000            # sample size cap
 *
 * If the file is very large and node runs out of memory:
 *   node --max-old-space-size=8192 scripts/prepare_buildings.mjs
 *
 * Output: src/data/real_buildings/<metro>_buildings.json
 * (compact: [[lat, lng, footprint_m2], ...] + meta)
 *
 * The dashboard then uses REAL positions + footprint areas for that metro;
 * type/vintage/roof stay as documented model estimates, and temperatures come
 * from the measured FortyGuard tiles where captured.
 *
 * NOTE: the raw .geojson itself should NOT be committed to GitHub (it can
 * exceed GitHub's 100 MB limit) — .gitignore excludes data/*_buildings.geojson.
 * Only the small compact output gets committed.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')

// ---- args ----
const args = process.argv.slice(2)
const getArg = (name, dflt) => {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const METRO = getArg('metro', 'dallas')
const FILE = getArg('file', join(ROOT, 'data', `${METRO}_buildings.geojson`))
const MAX = parseInt(getArg('max', '3000'), 10)

// Captured AOIs (must match the FortyGuard captures so temps are measured)
const AOIS = {
  dallas: [-96.88, 32.72, -96.74, 32.79],
  houston: [-95.5, 29.7, -95.36, 29.77],
  austin: [-97.8, 30.22, -97.66, 30.29],
  sanantonio: [-98.56, 29.37, -98.42, 29.44],
}
const AOI = AOIS[METRO]
if (!AOI) {
  console.error(`Unknown metro "${METRO}". Options: ${Object.keys(AOIS).join(', ')}`)
  process.exit(1)
}
if (!existsSync(FILE)) {
  console.error(`File not found: ${FILE}\nPut your footprints file there (or pass --file <path>).`)
  process.exit(1)
}

console.log(`Reading ${FILE} (${(statSync(FILE).size / 1e6).toFixed(1)} MB)…`)
const text = readFileSync(FILE, 'utf8')

// Accept both a normal FeatureCollection and line-delimited GeoJSON (.geojsonl)
let features = []
const trimmed = text.trimStart()
if (trimmed.startsWith('{') && trimmed.slice(0, 200).includes('FeatureCollection')) {
  features = JSON.parse(text).features || []
} else {
  for (const line of text.split('\n')) {
    const l = line.trim().replace(/,$/, '')
    if (!l || l === '[' || l === ']') continue
    try {
      const f = JSON.parse(l)
      if (f.type === 'Feature') features.push(f)
    } catch (e) {
      /* skip non-JSON lines */
    }
  }
}
console.log(`Total features in file: ${features.length.toLocaleString()}`)
if (!features.length) {
  console.error('No features found — is this a GeoJSON FeatureCollection?')
  process.exit(1)
}

// ---- auto-detect coordinate system quirks ------------------------------------
// Sample some coordinates to detect: [lat,lng] swap, or Web-Mercator meters.
function* sampleCoords(limit = 500) {
  let n = 0
  for (const f of features) {
    const g = f.geometry
    if (!g) continue
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    for (const poly of polys) {
      for (const pt of poly[0] || []) {
        yield pt
        if (++n >= limit) return
      }
    }
  }
}
let cntXbig = 0
let cntYbig = 0
let cntMeters = 0
let total = 0
for (const [x, y] of sampleCoords()) {
  total++
  if (Math.abs(x) > 1000 || Math.abs(y) > 1000) cntMeters++
  else {
    if (Math.abs(x) > 90) cntXbig++
    if (Math.abs(y) > 90) cntYbig++
  }
}
const R = 6378137
const isMercator = cntMeters > total * 0.8
const isSwapped = !isMercator && cntYbig > total * 0.8 && cntXbig < total * 0.2
if (isMercator) console.log('Detected projected (Web-Mercator) coordinates — converting to lat/lng automatically.')
if (isSwapped) console.log('Detected [lat, lng] coordinate order — swapping to GeoJSON [lng, lat] automatically.')

function fixPt([x, y]) {
  if (isMercator) {
    return [(x / R) * (180 / Math.PI), (Math.atan(Math.exp(y / R)) * 2 - Math.PI / 2) * (180 / Math.PI)]
  }
  if (isSwapped) return [y, x]
  return [x, y]
}
if (isMercator || isSwapped) {
  for (const f of features) {
    const g = f.geometry
    if (!g) continue
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    for (const poly of polys) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length; i++) ring[i] = fixPt(ring[i])
      }
    }
  }
}

// Print the file's own coverage so mismatches are obvious
let bW = 180, bS = 90, bE = -180, bN = -90
for (const [x, y] of sampleCoords(2000)) {
  if (x < bW) bW = x
  if (x > bE) bE = x
  if (y < bS) bS = y
  if (y > bN) bN = y
}
console.log(`File coverage (sampled): lng ${bW.toFixed(3)} → ${bE.toFixed(3)}, lat ${bS.toFixed(3)} → ${bN.toFixed(3)}`)
console.log(`Captured-AOI filter:     lng ${AOI[0]} → ${AOI[2]}, lat ${AOI[1]} → ${AOI[3]}`)
const ANYWHERE = args.includes('--anywhere')

// ---- centroid + spherical area per polygon ----
const M_LAT = 110574
function ringAreaM2(ring, latRef) {
  const mLng = 111320 * Math.cos((latRef * Math.PI) / 180)
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    a += (x1 * mLng) * (y2 * M_LAT) - (x2 * mLng) * (y1 * M_LAT)
  }
  return Math.abs(a / 2)
}

const inAoi = (lng, lat) => lng >= AOI[0] && lng <= AOI[2] && lat >= AOI[1] && lat <= AOI[3]

// Shape-preserving Douglas–Peucker simplification (planar approx — fine at
// building scale). Points are [lng, lat]; tolerance in degrees.
function douglasPeucker(pts, tol) {
  if (pts.length <= 4) return pts
  const cosLat = Math.cos((pts[0][1] * Math.PI) / 180)
  const keep = new Array(pts.length).fill(false)
  keep[0] = true
  keep[pts.length - 1] = true
  const segDist = (p, a, b) => {
    const ax = a[0] * cosLat
    const ay = a[1]
    const bx = b[0] * cosLat
    const by = b[1]
    const px = p[0] * cosLat
    const py = p[1]
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    if (!len2) return Math.hypot(px - ax, py - ay)
    let t = ((px - ax) * dx + (py - ay) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let maxD = 0
    let idx = -1
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

const rows = []
let skippedGeom = 0
for (const f of features) {
  const g = f.geometry
  if (!g) {
    skippedGeom++
    continue
  }
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null
  if (!polys) {
    skippedGeom++
    continue
  }
  // centroid of first ring + summed area
  let cx = 0
  let cy = 0
  let n = 0
  let area = 0
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
  if (!n || area < 25) continue // skip slivers / sheds under 25 m²
  cx /= n
  cy /= n
  if (!ANYWHERE && !inAoi(cx, cy)) continue
  // TRUE footprint outline for high-zoom satellite overlay.
  // Simplified with Douglas–Peucker at ~0.5 m tolerance — shape-preserving, so
  // outlines stay visually identical to the source geojson (rectangles keep 4
  // corners, L-shapes keep their notches).
  let ring = null
  const outer = polys[0] && polys[0][0]
  if (outer && outer.length >= 4) {
    const pts = outer.slice(0, -1) // drop closing duplicate
    const simplified = douglasPeucker(pts, 0.5 / 111320) // 0.5 m in degrees
    ring = simplified.map(([x, y]) => [+y.toFixed(6), +x.toFixed(6)])
    if (ring.length < 3) ring = null
  }
  rows.push(ring ? [+cy.toFixed(5), +cx.toFixed(5), Math.round(area), ring] : [+cy.toFixed(5), +cx.toFixed(5), Math.round(area)])
}
console.log(
  ANYWHERE
    ? `Kept (no AOI filter): ${rows.length.toLocaleString()} buildings`
    : `Inside the ${METRO} captured AOI: ${rows.length.toLocaleString()} buildings (skipped ${skippedGeom} non-polygon features)`
)
if (!rows.length) {
  console.error(
    '\nNo buildings fall inside the captured AOI. Compare the two coverage lines above:\n' +
      ' - If the file covers a DIFFERENT part of the metro, re-run with --anywhere to use all of\n' +
      '   its buildings (buildings outside the captured AOI get modeled temps instead of measured).\n' +
      '   node scripts/prepare_buildings.mjs --file "src/data/dallas_buildings.geojson" --anywhere'
  )
  process.exit(1)
}

// ---- stratified sample: keep ALL large buildings, sample the rest ----
let sample = rows
if (rows.length > MAX) {
  const large = rows.filter((r) => r[2] >= 2000)
  const rest = rows.filter((r) => r[2] < 2000)
  const need = Math.max(0, MAX - large.length)
  const step = rest.length / need
  const picked = []
  for (let i = 0; i < need; i++) picked.push(rest[Math.floor(i * step)])
  sample = large.concat(picked)
  console.log(`Sampled ${sample.length.toLocaleString()} (all ${large.length} ≥2000 m² + ${picked.length} of ${rest.length.toLocaleString()} smaller)`)
}

const outDir = join(ROOT, 'src', 'data', 'real_buildings')
mkdirSync(outDir, { recursive: true })
// actual extent of the kept buildings (so the map can frame them)
let eW = 180, eS = 90, eE = -180, eN = -90
for (const [la, ln] of sample) {
  if (ln < eW) eW = ln
  if (ln > eE) eE = ln
  if (la < eS) eS = la
  if (la > eN) eN = la
}
const out = {
  meta: {
    source: 'real-footprints',
    metro: METRO,
    total_in_file: features.length,
    total_in_aoi: rows.length,
    sampled: sample.length,
    aoi: AOI,
    extent: [+eW.toFixed(4), +eS.toFixed(4), +eE.toFixed(4), +eN.toFixed(4)],
    anywhere: ANYWHERE,
    note: 'positions + footprint areas are real; type/vintage/roof are model estimates',
  },
  buildings: sample,
}
const outPath = join(outDir, `${METRO}_buildings.json`)
writeFileSync(outPath, JSON.stringify(out))
console.log(`\n✔ wrote src/data/real_buildings/${METRO}_buildings.json (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`)
console.log('Next: Commit & Sync in VS Code — the dashboard picks it up automatically.')
