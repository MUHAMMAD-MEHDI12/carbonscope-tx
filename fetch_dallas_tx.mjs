import { writeFileSync } from 'fs'
import https from 'https'

const args = process.argv.slice(2)
const getArg = (name, dflt) => {
  const i = args.indexOf('--' + name)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const MAX = parseInt(getArg('max', '3000'), 10)

const DALLAS_TX_BBOX = [-96.96, 32.62, -96.65, 32.87]

const DATASET_LINKS_URL = 'https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv'

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve, reject)
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve, reject)
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject)
  })
}

function mercatorToLat(y) {
  return (Math.atan(Math.sinh(y)) * 180) / Math.PI
}
function quadkeyToBbox(quadkey) {
  let x = 0
  let y = 0
  let z = quadkey.length
  for (const ch of quadkey) {
    const bit = 1 << (z - 1)
    if (ch === '1') x += bit
    else if (ch === '2') y += bit
    else if (ch === '3') { x += bit; y += bit }
    else if (ch === '5') x += bit
    else if (ch === '6') y += bit
    else if (ch === '7') { x += bit; y += bit }
    z--
  }
  const n = 2 ** quadkey.length
  const lonMin = (x / n) * 360 - 180
  const lonMax = ((x + 1) / n) * 360 - 180
  const latN = mercatorToLat(Math.PI * (1 - (2 * (y + 1)) / n))
  const latS = mercatorToLat(Math.PI * (1 - (2 * y) / n))
  return [lonMin, Math.min(latS, latN), lonMax, Math.max(latS, latN)]
}
function bboxIntersects(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

console.log('Dallas, TX target bbox:', DALLAS_TX_BBOX)
console.log('\nFetching Microsoft building footprints dataset index...')
const csvText = await fetchText(DATASET_LINKS_URL)
const lines = csvText.split('\n').filter((l) => l.trim())
const headers = lines[0].split(',')
const locIdx = headers.indexOf('Location')
const qkIdx = headers.indexOf('QuadKey')
const urlIdx = headers.indexOf('Url')

const usTiles = []
for (let i = 1; i < lines.length; i++) {
  const cells = lines[i].split(',')
  if (cells[locIdx] === 'UnitedStates') {
    usTiles.push({ quadkey: cells[qkIdx], url: cells[urlIdx] })
  }
}
console.log(`Found ${usTiles.length.toLocaleString()} US tiles in the index`)

const intersecting = usTiles.filter((t) => bboxIntersects(quadkeyToBbox(t.quadkey), DALLAS_TX_BBOX))
console.log(`${intersecting.length} tiles intersect the Dallas, TX bounding box`)
if (!intersecting.length) {
  console.error('No intersecting tiles found - check network access')
  process.exit(1)
}

const zlib = await import('zlib')
const rows = []
let totalFeatures = 0

for (const tile of intersecting) {
  console.log(`Downloading tile ${tile.quadkey}...`)
  try {
    const gz = await fetchBuffer(tile.url)
    const text = zlib.gunzipSync(gz).toString('utf8')
    const lines2 = text.split('\n').filter((l) => l.trim())
    for (const line of lines2) {
      let f
      try {
        f = JSON.parse(line)
      } catch {
        continue
      }
      if (!f || f.type !== 'Feature') continue
      totalFeatures++
      const g = f.geometry
      if (!g) continue
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null
      if (!polys) continue
      const ring = polys[0] && polys[0][0]
      if (!ring || ring.length < 4) continue
      let cx = 0, cy = 0, n = 0
      for (let i = 0; i < ring.length - 1; i++) {
        cx += ring[i][0]
        cy += ring[i][1]
        n++
      }
      if (!n) continue
      cx /= n
      cy /= n
      if (cx < DALLAS_TX_BBOX[0] || cx > DALLAS_TX_BBOX[2] || cy < DALLAS_TX_BBOX[1] || cy > DALLAS_TX_BBOX[3]) continue
      rows.push(f)
    }
    console.log(`  ...running total in Dallas TX bbox: ${rows.length.toLocaleString()}`)
  } catch (e) {
    console.log(`  Skipped tile ${tile.quadkey}: ${e.message}`)
  }
}

console.log(`\nTotal features scanned: ${totalFeatures.toLocaleString()}`)
console.log(`Real Dallas, TX buildings found: ${rows.length.toLocaleString()}`)

if (!rows.length) {
  console.error('No buildings found in the Dallas, TX bbox.')
  process.exit(1)
}

let sample = rows
if (rows.length > MAX) {
  const step = rows.length / MAX
  sample = []
  for (let i = 0; i < MAX; i++) sample.push(rows[Math.floor(i * step)])
}

writeFileSync('dallas_tx_raw.geojson', JSON.stringify({ type: 'FeatureCollection', features: sample }))
console.log(`\nWrote dallas_tx_raw.geojson (${sample.length.toLocaleString()} real Dallas, TX buildings)`)
console.log('\nNext: node merge_dallas.mjs --dallas dallas_tx_raw.geojson --source "D:\\Hackathon_work\\buildings_with_carbon_footprints.geojson" --max 3000')
