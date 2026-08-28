import { SectionHead } from '../components/Shell.jsx'
import { MODEL_PARAMS } from '../model/energyModel.js'
import { DataTable } from '../components/ChartKit.jsx'

const SOURCES = [
  {
    name: 'FortyGuard tOS API — /v1/heatmap',
    role: 'Hyperlocal (100 m) temperature → per-building CDD/HDD and heat-island anomaly',
    url: 'https://www.fortyguard.com',
    demo: 'ALL FOUR metro cores: REAL captures (41,367 tiles total — Dallas 10,155, Austin 10,148, San Antonio 10,579, Houston 10,485; filter_type=3, °C) bundled in src/data/measured/ — they drive measured heat anomalies for buildings inside each core and the temperature map layers. Outside the cores, district plumes calibrated to published UHI magnitudes fill in.',
  },
  {
    name: 'Microsoft Global ML Building Footprints',
    role: 'Building geometry: footprint area, location (≈10.5M polygons in Texas)',
    url: 'https://github.com/microsoft/GlobalMLBuildingFootprints',
    demo: 'Dallas: 18,429 REAL footprints (positions, areas, true outlines) from the team’s own file via scripts/prepare_buildings.mjs. Other metros: synthetic stratified samples pending footprint files.',
  },
  {
    name: 'Landsat 8/9 Collection 2 L2 (USGS)',
    role: 'NDVI vegetation index near each building; roof reflectivity (albedo) proxy',
    url: 'https://earthexplorer.usgs.gov',
    demo: 'NDVI/albedo drawn from district-level urban-form distributions',
  },
  {
    name: 'EPA / ENERGY STAR + CBECS/RECS benchmarks',
    role: 'Baseline, cooling and heating energy-use intensities by building type',
    url: 'https://www.energystar.gov/buildings/benchmark',
    demo: 'Used directly as model coefficients (see table below)',
  },
  {
    name: 'ERCOT grid + EPA emission factors',
    role: 'kg CO2e per kWh (grid) and per therm (natural gas)',
    url: 'https://www.ercot.com',
    demo: 'Used directly: 0.40 kg/kWh grid, 5.31 kg/therm gas',
  },
]

// Peer-reviewed and institutional sources behind each model component.
const REFERENCES = [
  {
    comp: 'Urban heat island physics',
    ref: 'Oke, T.R. (1982). The energetic basis of the urban heat island. Q. J. R. Meteorol. Soc., 108(455).',
    link: 'https://doi.org/10.1002/qj.49710845502',
    label: 'DOI: 10.1002/qj.49710845502',
  },
  {
    comp: 'Cool roofs & albedo → cooling energy',
    ref: 'Akbari, H., Pomerantz, M., Taha, H. (2001). Cool surfaces and shade trees to reduce energy use and improve air quality in urban areas. Solar Energy, 70(3).',
    link: 'https://doi.org/10.1016/S0038-092X(00)00089-X',
    label: 'DOI: 10.1016/S0038-092X(00)00089-X',
  },
  {
    comp: 'Reflective & green mitigation magnitudes',
    ref: 'Santamouris, M. (2014). Cooling the cities — a review of reflective and green roof mitigation technologies. Solar Energy, 103.',
    link: 'https://doi.org/10.1016/j.solener.2012.07.003',
    label: 'DOI: 10.1016/j.solener.2012.07.003',
  },
  {
    comp: 'Vegetation / canopy cooling (NDVI term)',
    ref: 'Ziter, C.D., Pedersen, E.J., Kucharik, C.J., Turner, M.G. (2019). Scale-dependent interactions between tree canopy cover and impervious surfaces reduce daytime urban heat. PNAS, 116(15).',
    link: 'https://doi.org/10.1073/pnas.1817561116',
    label: 'DOI: 10.1073/pnas.1817561116',
  },
  {
    comp: 'Degree-day method (CDD/HDD)',
    ref: 'CIBSE (2006). Degree-days: theory and application (TM41). Chartered Institution of Building Services Engineers.',
    link: 'https://www.cibse.org/knowledge-research/knowledge-portal/tm41-degree-days-theory-and-application',
    label: 'CIBSE TM41',
  },
  {
    comp: 'Building energy-use intensities',
    ref: 'U.S. EIA — Commercial Buildings Energy Consumption Survey (CBECS) & Residential Energy Consumption Survey (RECS).',
    link: 'https://www.eia.gov/consumption/commercial/',
    label: 'eia.gov/consumption',
  },
  {
    comp: 'Grid & fuel emission factors',
    ref: 'U.S. EPA — eGRID database and GHG Emission Factors Hub; ERCOT system data.',
    link: 'https://www.epa.gov/egrid',
    label: 'epa.gov/egrid',
  },
  {
    comp: 'Building footprint extraction',
    ref: 'Microsoft AI for Good — Global ML Building Footprints (computer-vision-derived polygons).',
    link: 'https://github.com/microsoft/GlobalMLBuildingFootprints',
    label: 'github.com/microsoft',
  },
]

export default function Methodology() {
  const P = MODEL_PARAMS
  return (
    <>
      <SectionHead title="Methodology, sources & limitations">
        A physical, fully reproducible pipeline: three data layers fused per building, one
        transparent energy model, every coefficient documented below and in{' '}
        <code>src/model/energyModel.js</code>.
      </SectionHead>

      <div className="card">
        <div className="card-head">
          <div className="titles">
            <h3>Pipeline</h3>
            <div className="sub">From raw layers to policy numbers</div>
          </div>
        </div>
        <div className="flow">
          <div className="flow-step">
            <div className="t">1 · Ingest</div>
            <div className="d">Building footprints (Microsoft) clipped to metro boundaries; FortyGuard temperature history; Landsat B4/B5 → NDVI</div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="t">2 · Fuse</div>
            <div className="d">Spatial join: every building gets hyperlocal CDD/HDD, heat anomaly, NDVI, albedo proxy, type & vintage estimates</div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="t">3 · Model</div>
            <div className="d">Physical energy model → cooling / heating / baseline energy → CO2e via ERCOT + gas emission factors</div>
          </div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">
            <div className="t">4 · Analyze</div>
            <div className="d">Emission concentration, UHI attribution, retrofit & policy scenarios — rendered live in this dashboard</div>
          </div>
        </div>
      </div>

      <div className="card mt">
        <div className="card-head">
          <div className="titles">
            <h3>The energy model</h3>
            <div className="sub">Per building, per year</div>
          </div>
        </div>
        <div className="formula">
          <b>Cooling</b> (kWh) = FloorArea × CoolingEUI<sub>type</sub> × (CDD<sub>local</sub> / {P.refCDD}) × AgeFactor × RoofFactor × VegFactor
          <br />
          <b>Heating</b> (kWh<sub>th</sub>) = FloorArea × HeatingEUI<sub>type</sub> × (HDD<sub>local</sub> / {P.refHDD}) × AgeFactor
          <br />
          <b>Baseline</b> (kWh) = FloorArea × BaselineEUI<sub>type</sub>&nbsp;&nbsp;<span style={{ opacity: 0.7 }}>· lighting, plugs, refrigeration</span>
          <br />
          <b>CO2e</b> (kg) = Electricity × {P.gridKgCO2PerKwh} + Gas<sub>heating</sub> × {P.gasKgCO2PerKwhThermal}
          <br />
          <br />
          CDD<sub>local</sub> = CDD<sub>metro</sub> + ΔT<sub>UHI</sub> × {P.cddPerDegreeUHI} · RoofFactor = 1 + (0.45 − albedo) × {P.albedoSlope} · VegFactor = 1 − NDVI × {P.ndviCoolingSlope}
        </div>
        <div className="grid cols-2 mt" style={{ gap: 14 }}>
          <div>
            <div className="small" style={{ fontWeight: 650, marginBottom: 6 }}>
              Energy-use intensities (kWh/m² floor/yr)
            </div>
            <DataTable
              columns={[
                { key: 't', label: 'Type' },
                { key: 'b', label: 'Baseline', num: true },
                { key: 'c', label: 'Cooling @ ref CDD', num: true },
                { key: 'h', label: 'Heating @ ref HDD', num: true },
              ]}
              rows={Object.entries(P.intensities).map(([t, v]) => ({
                t: t[0].toUpperCase() + t.slice(1),
                b: v.baseline,
                c: v.cooling,
                h: v.heating,
              }))}
            />
          </div>
          <div>
            <div className="small" style={{ fontWeight: 650, marginBottom: 6 }}>
              Vintage efficiency multipliers (HVAC)
            </div>
            <DataTable
              columns={[
                { key: 'y', label: 'Built', num: true },
                { key: 'f', label: 'Multiplier', num: true },
              ]}
              rows={P.agePoints.map(([y, f]) => ({ y, f: f.toFixed(2) + '×' }))}
            />
            <p className="foot-note">
              Linear interpolation between anchors. Industrial covers building services only —
              manufacturing process loads are excluded from building carbon.
            </p>
          </div>
        </div>
      </div>

      <div className="card mt">
        <div className="card-head">
          <div className="titles">
            <h3>Data sources</h3>
            <div className="sub">Production layer → what the demo dataset substitutes</div>
          </div>
        </div>
        <DataTable
          columns={[
            {
              key: 'name',
              label: 'Source',
              fmt: (v, r) => (
                <a className="src-link" href={r.url} target="_blank" rel="noreferrer">
                  {v}
                </a>
              ),
            },
            { key: 'role', label: 'Role in pipeline' },
            { key: 'demo', label: 'In this demo' },
          ]}
          rows={SOURCES}
        />
      </div>

      <div className="card mt">
        <div className="card-head">
          <div className="titles">
            <h3>Scientific references</h3>
            <div className="sub">The literature behind each model component</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: 'comp', label: 'Model component' },
            { key: 'ref', label: 'Reference' },
            {
              key: 'label',
              label: 'Link / DOI',
              fmt: (v, r) => (
                <a className="src-link" href={r.link} target="_blank" rel="noreferrer">
                  {v}
                </a>
              ),
            },
          ]}
          rows={REFERENCES}
        />
        <p className="foot-note">
          Coefficients in this dashboard are calibrated within the ranges these sources report;
          exact values used are printed in the tables above and in <code>src/model/energyModel.js</code>.
        </p>
      </div>

      <div className="grid cols-2 mt">
        <div className="card">
          <div className="card-head">
            <div className="titles">
              <h3>Validation anchors</h3>
              <div className="sub">Why the modeled numbers are credible</div>
            </div>
          </div>
          <ul style={{ paddingLeft: 18, display: 'grid', gap: 7, fontSize: 12.5, color: 'var(--text-2)' }}>
            <li>Residential mean ≈ 8.0 t CO2e/home/yr — matches TX household energy + ERCOT intensity.</li>
            <li>Commercial intensity ≈ 60 kg CO2e/m²/yr — inside the CBECS/ENERGY STAR 50–100 band.</li>
            <li>Combined 4-metro total ≈ 107 Mt/yr — consistent with TX building-sector share of state electricity + gas.</li>
            <li>Modeled building electricity ≈ 250 TWh/yr vs 329 TWh statewide residential + commercial retail sales (EIA, 2024) — consistent with the four metros&rsquo; share of the state.</li>
            <li>UHI = 12% of cooling carbon — inside the 8–12% literature range for hot-climate metros.</li>
          </ul>
        </div>
        <div className="card">
          <div className="card-head">
            <div className="titles">
              <h3>Limitations & honest caveats</h3>
              <div className="sub">What to fix before operational use</div>
            </div>
          </div>
          <ul style={{ paddingLeft: 18, display: 'grid', gap: 7, fontSize: 12.5, color: 'var(--text-2)' }}>
            <li><b>Mixed real + modeled data.</b> Temperatures are measured in all four metro cores (41,367 FortyGuard tiles) and Dallas uses 18,429 real footprints; other metros&rsquo; buildings and every building&rsquo;s type/vintage/roof are still calibrated model estimates, clearly flagged in the UI chips.</li>
            <li>Building type, vintage and albedo are remote-sensing proxies — ±30–50% uncertainty per building; errors shrink fast on aggregation.</li>
            <li>Annual-average grid intensity; hourly marginal emissions would sharpen the peak-demand story.</li>
            <li>Expansion weights assume the stratified sample represents each type's stock; assessor parcel joins would replace this.</li>
            <li>Embodied carbon (construction materials) is out of scope — this maps operational carbon only.</li>
          </ul>
        </div>
      </div>
    </>
  )
}
