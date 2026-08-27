/**
 * Registry of MEASURED FortyGuard tile captures, keyed by metro id.
 *
 * Houston ships with the repo. To add more metros:
 *   1. python scripts/capture_metros.py --key YOUR_API_KEY   (calls /v1/heatmap)
 *   2. node scripts/compact_tiles.mjs                         (compacts to src/data/measured/)
 *   3. commit + sync — buildings and the map temperature layer in those metros
 *      switch from modeled to measured automatically.
 *
 * Compact file shape: { meta: { p05_max, p95_max, date, ... }, tiles: [[lat, lng, avg, max, min], ...] }
 */
import houston from './houston_tiles.json'

export const MEASURED = { houston }

// Vite: auto-load any additional captures in src/data/measured/<metro>_tiles.json
// (guarded so Node scripts like calibrate.mjs still run without Vite)
try {
  if (typeof import.meta.glob === 'function') {
    const extra = import.meta.glob('./measured/*_tiles.json', { eager: true })
    for (const [path, mod] of Object.entries(extra)) {
      const m = path.match(/measured\/([a-z]+)_tiles\.json$/)
      if (m) MEASURED[m[1]] = mod.default || mod
    }
  }
} catch (e) {
  /* non-Vite environment — Houston only */
}

// ---- fast nearest-tile lookup (per-metro spatial index, ~0.001° bins) ----
const _indexes = new Map()

function indexFor(metroId) {
  let idx = _indexes.get(metroId)
  if (!idx) {
    idx = new Map()
    const reg = MEASURED[metroId]
    if (reg) {
      for (const t of reg.tiles) {
        const key = `${Math.round(t[0] * 1000)}|${Math.round(t[1] * 1000)}`
        if (!idx.has(key)) idx.set(key, t)
      }
    }
    _indexes.set(metroId, idx)
  }
  return idx
}

/** Nearest measured tile within ~150 m of (lat, lng), or null. */
export function measuredTileFor(metroId, lat, lng) {
  if (!MEASURED[metroId]) return null
  const idx = indexFor(metroId)
  const ky = Math.round(lat * 1000)
  const kx = Math.round(lng * 1000)
  let best = null
  let bestD = Infinity
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = idx.get(`${ky + dy}|${kx + dx}`)
      if (!t) continue
      const d = (t[0] - lat) ** 2 + (t[1] - lng) ** 2
      if (d < bestD) {
        bestD = d
        best = t
      }
    }
  }
  return best
}
