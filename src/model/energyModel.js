/**
 * CarbonScope TX — Building Energy & Carbon Model
 * ------------------------------------------------
 * Estimates annual energy use and carbon emissions for a single building from
 * physical + climatic attributes. This is the SAME model that runs against real
 * data (FortyGuard temperatures, Microsoft footprints, Landsat NDVI) — the demo
 * merely feeds it synthetic buildings.
 *
 * Model scope:
 *   carbon = baseline (non-HVAC) + cooling (electric) + heating (gas/electric mix)
 * Cooling and heating are the temperature-sensitive slices — the part FortyGuard's
 * hyperlocal data improves. All coefficients are exposed in MODEL_PARAMS so they
 * can be tuned/审 audited in one place and are printed on the Methodology page.
 *
 * Sources for defaults (see Methodology section for links):
 *  - EPA / ENERGY STAR & CBECS/RECS building energy benchmarks (intensities)
 *  - ERCOT grid carbon intensity (kg CO2 / kWh)
 *  - EPA emission factors for natural gas (5.31 kg CO2 / therm)
 *  - Cool-roof literature (LBNL Heat Island Group) for albedo effects
 */

export const MODEL_PARAMS = {
  // ---- Grid & fuel carbon factors -----------------------------------------
  gridKgCO2PerKwh: 0.40,        // ERCOT average grid intensity, kg CO2e per kWh
  gasKgCO2PerKwhThermal: 0.181, // 5.31 kg CO2/therm ÷ 29.3 kWh/therm
  gasHeatingShare: 0.60,        // share of heating load served by natural gas in TX
  retailElecPerKwh: 0.14,       // $/kWh — used for payback economics
  retailGasPerKwhThermal: 0.045,// $/kWh(thermal) — used for payback economics

  // ---- Reference climate (coefficients are calibrated at these) -----------
  refCDD: 2900, // cooling degree days (base 65°F), typical TX metro
  refHDD: 2100, // heating degree days (base 65°F)

  // ---- Energy-use intensities, kWh per m² of FLOOR area per year ----------
  // baseline = lighting, plugs, refrigeration, process loads (not temp-driven)
  // cooling  = electric cooling at reference CDD
  // heating  = thermal heating demand at reference HDD
  // NOTE: industrial covers building services only (lighting, HVAC, offices);
  // manufacturing process loads are excluded — they belong to the industrial
  // sector, not building carbon.
  intensities: {
    residential: { baseline: 42, cooling: 16, heating: 26 },
    commercial:  { baseline: 88, cooling: 28, heating: 24 },
    industrial:  { baseline: 62, cooling: 14, heating: 16 },
  },

  // ---- Vintage (age) efficiency multipliers on HVAC loads ------------------
  // Piecewise-linear between anchor years (older stock = less efficient).
  agePoints: [
    [1950, 2.3],
    [1970, 1.9],
    [1990, 1.35],
    [2010, 0.95],
    [2024, 0.65],
  ],

  // ---- Roof albedo effect on cooling ---------------------------------------
  // Neutral albedo 0.45; darker roofs absorb more heat. Slope tuned so a dark
  // roof (0.25) adds ~+17% cooling and a cool roof (0.65) saves ~-17%.
  albedoNeutral: 0.45,
  albedoSlope: 0.875,

  // ---- Vegetation / shade effect on cooling --------------------------------
  // Each +0.1 NDVI near the building ≈ -5% cooling demand (shade + evapotranspiration).
  ndviCoolingSlope: 0.5,
  ndviCoolingFloor: 0.7, // never below -30%

  // ---- Urban heat island → degree days -------------------------------------
  // Each +1°F of hyperlocal UHI anomaly ≈ +150 CDD and -80 HDD per year.
  cddPerDegreeUHI: 150,
  hddPerDegreeUHI: 80,

  // ---- Retrofit economics --------------------------------------------------
  coolRoofCostPerM2: 30,     // $/m² of roof area (plan assumption)
  coolRoofTargetAlbedo: 0.72,
  hvacRetrofitCostPerM2Floor: 55, // $/m² floor for deep HVAC retrofit
}

/** Linear interpolation over the vintage anchor points. */
export function ageEfficiencyFactor(yearBuilt, params = MODEL_PARAMS) {
  const pts = params.agePoints
  if (yearBuilt <= pts[0][0]) return pts[0][1]
  if (yearBuilt >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const [y0, f0] = pts[i]
    const [y1, f1] = pts[i + 1]
    if (yearBuilt >= y0 && yearBuilt <= y1) {
      const t = (yearBuilt - y0) / (y1 - y0)
      return f0 + t * (f1 - f0)
    }
  }
  return 1
}

/** Multiplier on cooling demand from roof reflectivity. */
export function roofAlbedoFactor(albedo, params = MODEL_PARAMS) {
  return Math.max(0.6, 1 + (params.albedoNeutral - albedo) * params.albedoSlope)
}

/** Multiplier on cooling demand from nearby vegetation (NDVI 0–1). */
export function vegetationFactor(ndvi, params = MODEL_PARAMS) {
  return Math.max(params.ndviCoolingFloor, 1 - ndvi * params.ndviCoolingSlope)
}

/**
 * Convert a hyperlocal UHI temperature anomaly (°F) into local degree days.
 * This is where FortyGuard data plugs in: with real data, pass measured
 * CDD/HDD directly instead of the anomaly approximation.
 */
export function localDegreeDays(metroCDD, metroHDD, uhiDeltaF, params = MODEL_PARAMS) {
  return {
    cdd: Math.max(0, metroCDD + uhiDeltaF * params.cddPerDegreeUHI),
    hdd: Math.max(0, metroHDD - uhiDeltaF * params.hddPerDegreeUHI),
  }
}

/**
 * Core model. Returns annual energy (kWh) and carbon (kg CO2e) for one building.
 *
 * @param {object} b
 * @param {number} b.floorAreaM2   total conditioned floor area (footprint × stories)
 * @param {number} b.footprintM2   roof/footprint area (for retrofit costing)
 * @param {string} b.type          'residential' | 'commercial' | 'industrial'
 * @param {number} b.yearBuilt
 * @param {number} b.roofAlbedo    0–1
 * @param {number} b.ndvi          0–1 vegetation index near the building
 * @param {number} b.cdd           local annual cooling degree days (hyperlocal)
 * @param {number} b.hdd           local annual heating degree days (hyperlocal)
 */
export function calculateBuildingCarbon(b, params = MODEL_PARAMS) {
  const inten = params.intensities[b.type] || params.intensities.commercial
  const ageF = ageEfficiencyFactor(b.yearBuilt, params)
  const roofF = roofAlbedoFactor(b.roofAlbedo, params)
  const vegF = vegetationFactor(b.ndvi, params)

  const baselineKwh = inten.baseline * b.floorAreaM2

  const coolingKwh =
    inten.cooling * b.floorAreaM2 * (b.cdd / params.refCDD) * ageF * roofF * vegF

  const heatingKwhThermal =
    inten.heating * b.floorAreaM2 * (b.hdd / params.refHDD) * ageF

  // Carbon: baseline + cooling are electric; heating splits gas/electric.
  const gasKwh = heatingKwhThermal * params.gasHeatingShare
  const elecHeatKwh = heatingKwhThermal * (1 - params.gasHeatingShare) * 0.45 // heat-pump/resistance mix COP≈2.2

  const elecKwh = baselineKwh + coolingKwh + elecHeatKwh
  const carbonKg =
    elecKwh * params.gridKgCO2PerKwh + gasKwh * params.gasKgCO2PerKwhThermal

  const energyCostUsd =
    elecKwh * params.retailElecPerKwh + gasKwh * params.retailGasPerKwhThermal

  return {
    baselineKwh,
    coolingKwh,
    heatingKwhThermal,
    elecKwh,
    carbonKg,
    energyCostUsd,
    factors: { ageF, roofF, vegF },
  }
}

/**
 * Carbon saved (kg/yr) if this building's roof were retrofitted to a cool roof.
 * Only the cooling slice changes.
 */
export function coolRoofSavingsKg(b, result, params = MODEL_PARAMS) {
  const newRoofF = roofAlbedoFactor(params.coolRoofTargetAlbedo, params)
  const oldRoofF = result.factors.roofF
  if (oldRoofF <= newRoofF) return 0
  const newCooling = result.coolingKwh * (newRoofF / oldRoofF)
  return (result.coolingKwh - newCooling) * params.gridKgCO2PerKwh
}

/**
 * Carbon attributable to the urban heat island: current carbon minus carbon
 * recomputed at the metro's baseline (rural-reference) degree days.
 */
export function uhiCarbonPenaltyKg(b, metroCDD, metroHDD, params = MODEL_PARAMS) {
  const withUhi = calculateBuildingCarbon(b, params)
  const without = calculateBuildingCarbon({ ...b, cdd: metroCDD, hdd: metroHDD }, params)
  return withUhi.carbonKg - without.carbonKg
}
