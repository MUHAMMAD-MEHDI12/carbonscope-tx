/**
 * Deterministic seeded RNG (mulberry32) so the synthetic dataset is identical
 * on every load — critical for a reproducible demo and stable screenshots.
 */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Approximate normal via sum of uniforms (Irwin–Hall). */
export function makeGaussian(rand) {
  return function (mean = 0, std = 1) {
    let s = 0
    for (let i = 0; i < 6; i++) s += rand()
    return mean + ((s - 3) / 1.2247) * std // ~N(0,1) scaled
  }
}

/** Weighted choice from [[value, weight], ...] */
export function makeChoice(rand) {
  return function (pairs) {
    const total = pairs.reduce((s, p) => s + p[1], 0)
    let r = rand() * total
    for (const [v, w] of pairs) {
      r -= w
      if (r <= 0) return v
    }
    return pairs[pairs.length - 1][0]
  }
}

export function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x))
}
