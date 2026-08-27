/**
 * Registry of REAL building footprints per metro (from scripts/prepare_buildings.mjs).
 * When a metro has an entry, the generator uses real positions + footprint areas
 * for that metro instead of procedural placement. Empty by default.
 */
export const REAL_BUILDINGS = {}

try {
  const files = import.meta.glob('./real_buildings/*_buildings.json', { eager: true })
  for (const [path, mod] of Object.entries(files)) {
    const m = path.match(/real_buildings\/([a-z]+)_buildings\.json$/)
    if (m) REAL_BUILDINGS[m[1]] = mod.default || mod
  }
} catch (e) {
  /* non-Vite environment (node scripts) — registry stays empty */
}

export const REAL_BUILDING_METROS = () => Object.keys(REAL_BUILDINGS)
