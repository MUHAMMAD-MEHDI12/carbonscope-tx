/**
 * Chart + map color tokens per theme.
 * Categorical/sequential values follow the validated reference dataviz palette
 * (adjacent-pair CVD ΔE ≥ 8 in both modes; first three slots all-pairs safe —
 * which is why building TYPES are capped at three categories).
 * The carbon HEAT ramp is a semantic-heat sequential scale (monotone lightness,
 * yellow→deep red) — always shown with a scale legend.
 */

export const PALETTES = {
  dark: {
    surface: '#1a1a19',
    page: '#0d0d0d',
    text: '#ffffff',
    text2: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
    border: 'rgba(255,255,255,0.10)',
    series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    deemphasis: '#3f3f3c',
    seq: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#2a78d6', '#1c5cab', '#184f95'],
    // ordinal blue ramp for dark mode: light→dark but darkest step ≥2:1 on surface
    ordinal: ['#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'],
    heat: ['#f6c945', '#ef9b2d', '#e56a29', '#d03b3b', '#941f30'],
    status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
    goodText: '#0ca30c',
    accent: '#3987e5',
  },
  light: {
    surface: '#fcfcfb',
    page: '#f9f9f7',
    text: '#0b0b0b',
    text2: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    border: 'rgba(11,11,11,0.10)',
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
    deemphasis: '#d8d7cf',
    seq: ['#cde2fb', '#9ec5f4', '#6da7ec', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'],
    ordinal: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'],
    heat: ['#f0bd2d', '#e98f21', '#dd5f20', '#c33434', '#8a1c2c'],
    status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
    goodText: '#006300',
    accent: '#2a78d6',
  },
}

/** Building-type identity — three categories, all-pairs CVD-safe (slots 1–3). */
export function typeColors(theme) {
  const p = PALETTES[theme]
  return {
    residential: p.series[0],
    commercial: p.series[1],
    industrial: p.series[2],
  }
}

/** Carbon heat-bin thresholds (annual tCO2e per building) shared by map + legend. */
export const HEAT_BINS = [
  { label: '< 10 t', lo: 0, hi: 10 },
  { label: '10–50 t', lo: 10, hi: 50 },
  { label: '50–200 t', lo: 50, hi: 200 },
  { label: '200–600 t', lo: 200, hi: 600 },
  { label: '> 600 t', lo: 600, hi: Infinity },
]

export function heatColorFor(tons, theme) {
  const p = PALETTES[theme]
  const idx = HEAT_BINS.findIndex((b) => tons >= b.lo && tons < b.hi)
  return p.heat[Math.max(0, idx)]
}

/** UHI anomaly color (same semantic-heat ramp, °F bins). */
export const UHI_BINS = [
  { label: '+1–2°F', lo: 1, hi: 2 },
  { label: '+2–3.5°F', lo: 2, hi: 3.5 },
  { label: '+3.5–5°F', lo: 3.5, hi: 5 },
  { label: '+5–6.5°F', lo: 5, hi: 6.5 },
  { label: '> +6.5°F', lo: 6.5, hi: 99 },
]

export function uhiColorFor(uhiF, theme) {
  const p = PALETTES[theme]
  const idx = UHI_BINS.findIndex((b) => uhiF >= b.lo && uhiF < b.hi)
  return idx === -1 ? null : p.heat[idx]
}
