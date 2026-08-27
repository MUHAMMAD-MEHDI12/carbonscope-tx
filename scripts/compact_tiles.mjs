/**
 * Compact raw FortyGuard heatmap captures (data/<metro>_day_<date>.json, from
 * scripts/capture_metros.py) into the dashboard's measured-tiles format at
 * src/data/measured/<metro>_tiles.json.
 *
 * Run: node scripts/compact_tiles.mjs
 * Then commit & sync — those metros switch from modeled to measured automatically.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dir, '../data')
const OUT = join(__dir, '../src/data/measured')
mkdirSync(OUT, { recursive: true })

const files = readdirSync(DATA).filter((f) => /^[a-z]+_day_\d{4}-\d{2}-\d{2}\.json$/.test(f))
if (!files.length) {
  console.log('No raw captures found in data/. Run scripts/capture_metros.py first.')
  process.exit(0)
}

for (const f of files) {
  const m = f.match(/^([a-z]+)_day_(\d{4}-\d{2}-\d{2})\.json$/)
  const metro = m[1]
  const date = m[2]
  if (metro === 'houston') {
    console.log(`${f}: Houston already ships compacted (src/data/houston_tiles.json) — skipping`)
    continue
  }
  const raw = JSON.parse(readFileSync(join(DATA, f), 'utf8'))
  const feats = (raw.result || raw).map_data.features
  const tiles = []
  const maxes = []
  for (const ft of feats) {
    const ring = ft.geometry.coordinates[0]
    const n = ring.length - 1
    let cx = 0
    let cy = 0
    for (let i = 0; i < n; i++) {
      cx += ring[i][0]
      cy += ring[i][1]
    }
    cx /= n
    cy /= n
    const p = ft.properties
    tiles.push([
      +cy.toFixed(5),
      +cx.toFixed(5),
      +(+p.average_temperature).toFixed(2),
      +(+p.max_temperature).toFixed(2),
      +(+p.min_temperature).toFixed(2),
    ])
    maxes.push(p.max_temperature)
  }
  maxes.sort((a, b) => a - b)
  const q = (p) => maxes[Math.min(maxes.length - 1, Math.floor(p * maxes.length))]
  const out = {
    meta: {
      source: 'fortyguard',
      date,
      activity_id: raw.activity_id || null,
      n: tiles.length,
      p05_max: +q(0.05).toFixed(2),
      p95_max: +q(0.95).toFixed(2),
    },
    tiles,
  }
  const outPath = join(OUT, `${metro}_tiles.json`)
  writeFileSync(outPath, JSON.stringify(out))
  console.log(`${f} → src/data/measured/${metro}_tiles.json  (${tiles.length} tiles, p05 ${out.meta.p05_max}°C, p95 ${out.meta.p95_max}°C)`)
}
console.log('\nDone. Commit & sync to deploy — measured metros light up automatically.')
