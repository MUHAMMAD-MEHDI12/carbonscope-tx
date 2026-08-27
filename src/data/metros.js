/**
 * Metro + district configuration for the synthetic sample.
 * Coordinates are real metro geography; district structure encodes the urban
 * form that drives the model (density, vintage, vegetation, UHI intensity).
 *
 * stock: approximate real building counts by type in the metro (from the
 * Microsoft footprint totals + county assessor mixes). The sample is
 * deliberately stratified (oversamples large commercial/industrial so the map
 * is informative); per-type expansion weights de-bias it when computing
 * modeled metro-wide totals — clearly labeled in the UI. Map + distribution
 * views always show the raw sample.
 *
 * With real data: replace the generator output with the full building stock
 * (see README → "Swapping in real data") and set every expansion weight to 1.
 */

export const METROS = {
  dallas: {
    id: 'dallas',
    name: 'Dallas–Fort Worth',
    short: 'Dallas',
    center: [32.7767, -96.797],
    zoom: 11,
    population: 8.1e6,
    baseCDD: 2850, // metro-scale (airport/rural reference) degree days
    baseHDD: 2150,
    sampleSize: 2600,
    stock: { residential: 1980000, commercial: 190000, industrial: 30000 },
    summerHighF: 96.2,
    districts: [
      { id: 'dt', name: 'Downtown / Uptown core', center: [32.7823, -96.7994], spreadKm: 2.2, weight: 0.16, uhiF: 6.8, ndvi: 0.14, vintage: [1955, 2018], types: [['commercial', 0.82], ['residential', 0.14], ['industrial', 0.04]], sizeBoost: 2.4 },
      { id: 'in', name: 'Stemmons industrial corridor', center: [32.8203, -96.8709], spreadKm: 3.4, weight: 0.1, uhiF: 5.2, ndvi: 0.11, vintage: [1958, 2005], types: [['industrial', 0.72], ['commercial', 0.24], ['residential', 0.04]], sizeBoost: 3.1 },
      { id: 'ir', name: 'Inner-loop neighborhoods', center: [32.75, -96.83], spreadKm: 4.5, weight: 0.26, uhiF: 3.6, ndvi: 0.28, vintage: [1948, 1985], types: [['residential', 0.8], ['commercial', 0.17], ['industrial', 0.03]], sizeBoost: 1 },
      { id: 'nb', name: 'North Dallas / Plano corridor', center: [32.95, -96.82], spreadKm: 6, weight: 0.28, uhiF: 2.3, ndvi: 0.34, vintage: [1975, 2015], types: [['residential', 0.7], ['commercial', 0.27], ['industrial', 0.03]], sizeBoost: 1.25 },
      { id: 'fw', name: 'Fort Worth core', center: [32.7555, -97.3308], spreadKm: 3, weight: 0.2, uhiF: 4.9, ndvi: 0.2, vintage: [1950, 2012], types: [['commercial', 0.42], ['residential', 0.48], ['industrial', 0.1]], sizeBoost: 1.5 },
    ],
  },

  houston: {
    id: 'houston',
    name: 'Greater Houston',
    short: 'Houston',
    center: [29.7604, -95.3698],
    zoom: 11,
    population: 7.5e6,
    baseCDD: 3050,
    baseHDD: 1450,
    sampleSize: 2700,
    stock: { residential: 1790000, commercial: 172000, industrial: 40000 },
    summerHighF: 94.8,
    districts: [
      { id: 'dt', name: 'Downtown / Midtown', center: [29.7589, -95.3677], spreadKm: 2.4, weight: 0.15, uhiF: 7.2, ndvi: 0.13, vintage: [1952, 2019], types: [['commercial', 0.84], ['residential', 0.13], ['industrial', 0.03]], sizeBoost: 2.6 },
      { id: 'sc', name: 'Ship Channel petrochemical belt', center: [29.735, -95.22], spreadKm: 4.2, weight: 0.14, uhiF: 6.1, ndvi: 0.09, vintage: [1950, 2000], types: [['industrial', 0.85], ['commercial', 0.12], ['residential', 0.03]], sizeBoost: 3.6 },
      { id: 'ir', name: 'Inner-loop neighborhoods', center: [29.77, -95.42], spreadKm: 4.4, weight: 0.25, uhiF: 4.1, ndvi: 0.26, vintage: [1945, 1988], types: [['residential', 0.78], ['commercial', 0.19], ['industrial', 0.03]], sizeBoost: 1 },
      { id: 'wc', name: 'Westchase / Energy Corridor', center: [29.75, -95.6], spreadKm: 4.6, weight: 0.22, uhiF: 3.2, ndvi: 0.3, vintage: [1975, 2016], types: [['commercial', 0.5], ['residential', 0.45], ['industrial', 0.05]], sizeBoost: 1.6 },
      { id: 'sb', name: 'Suburban ring (Katy–Woodlands)', center: [29.95, -95.5], spreadKm: 7, weight: 0.24, uhiF: 1.8, ndvi: 0.4, vintage: [1985, 2022], types: [['residential', 0.82], ['commercial', 0.16], ['industrial', 0.02]], sizeBoost: 1.1 },
    ],
  },

  austin: {
    id: 'austin',
    name: 'Austin–Round Rock',
    short: 'Austin',
    center: [30.2672, -97.7431],
    zoom: 11,
    population: 2.5e6,
    baseCDD: 2980,
    baseHDD: 1650,
    sampleSize: 1700,
    stock: { residential: 648000, commercial: 62000, industrial: 8000 },
    summerHighF: 97.1,
    districts: [
      { id: 'dt', name: 'Downtown / Rainey', center: [30.267, -97.7431], spreadKm: 1.8, weight: 0.18, uhiF: 6.2, ndvi: 0.16, vintage: [1960, 2022], types: [['commercial', 0.8], ['residential', 0.17], ['industrial', 0.03]], sizeBoost: 2.2 },
      { id: 'dm', name: 'The Domain / tech north', center: [30.4019, -97.7252], spreadKm: 2.6, weight: 0.18, uhiF: 3.4, ndvi: 0.27, vintage: [1995, 2023], types: [['commercial', 0.62], ['residential', 0.35], ['industrial', 0.03]], sizeBoost: 1.7 },
      { id: 'er', name: 'East Austin', center: [30.26, -97.7], spreadKm: 2.8, weight: 0.22, uhiF: 4.4, ndvi: 0.24, vintage: [1948, 2015], types: [['residential', 0.68], ['commercial', 0.24], ['industrial', 0.08]], sizeBoost: 1 },
      { id: 'sw', name: 'South / Southwest hills', center: [30.22, -97.83], spreadKm: 4.5, weight: 0.24, uhiF: 2.1, ndvi: 0.44, vintage: [1975, 2018], types: [['residential', 0.85], ['commercial', 0.13], ['industrial', 0.02]], sizeBoost: 1 },
      { id: 'ne', name: 'NE manufacturing (Samsung belt)', center: [30.39, -97.62], spreadKm: 3.5, weight: 0.18, uhiF: 3.8, ndvi: 0.22, vintage: [1980, 2023], types: [['industrial', 0.6], ['commercial', 0.25], ['residential', 0.15]], sizeBoost: 2.3 },
    ],
  },

  sanantonio: {
    id: 'sanantonio',
    name: 'San Antonio–New Braunfels',
    short: 'San Antonio',
    center: [29.4241, -98.4936],
    zoom: 11,
    population: 2.7e6,
    baseCDD: 3120,
    baseHDD: 1500,
    sampleSize: 1800,
    stock: { residential: 700000, commercial: 70000, industrial: 10000 },
    summerHighF: 96.5,
    districts: [
      { id: 'dt', name: 'Downtown / River Walk', center: [29.4252, -98.4946], spreadKm: 2, weight: 0.17, uhiF: 6.5, ndvi: 0.15, vintage: [1950, 2015], types: [['commercial', 0.78], ['residential', 0.18], ['industrial', 0.04]], sizeBoost: 2.1 },
      { id: 'kl', name: 'Kelly / Port SA industrial', center: [29.383, -98.581], spreadKm: 2.8, weight: 0.12, uhiF: 5, ndvi: 0.13, vintage: [1955, 2005], types: [['industrial', 0.7], ['commercial', 0.25], ['residential', 0.05]], sizeBoost: 2.9 },
      { id: 'ir', name: 'Inner-loop neighborhoods', center: [29.44, -98.52], spreadKm: 4, weight: 0.3, uhiF: 3.8, ndvi: 0.25, vintage: [1945, 1990], types: [['residential', 0.82], ['commercial', 0.15], ['industrial', 0.03]], sizeBoost: 1 },
      { id: 'nc', name: 'North Central / Stone Oak', center: [29.6, -98.48], spreadKm: 5, weight: 0.26, uhiF: 2, ndvi: 0.38, vintage: [1985, 2022], types: [['residential', 0.8], ['commercial', 0.18], ['industrial', 0.02]], sizeBoost: 1.15 },
      { id: 'md', name: 'Medical Center / USAA', center: [29.5075, -98.575], spreadKm: 2.4, weight: 0.15, uhiF: 4.2, ndvi: 0.22, vintage: [1970, 2018], types: [['commercial', 0.6], ['residential', 0.36], ['industrial', 0.04]], sizeBoost: 1.8 },
    ],
  },
}

export const METRO_LIST = Object.values(METROS)
export const METRO_IDS = Object.keys(METROS)

export const TYPE_LABELS = {
  residential: 'Residential',
  commercial: 'Commercial',
  industrial: 'Industrial',
}
