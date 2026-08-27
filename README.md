# CarbonScope TX 🌡️

**Building Carbon Intelligence for Texas** — an interactive dashboard that maps and quantifies
building carbon emissions across Dallas–Fort Worth, Houston, Austin and San Antonio by fusing
three data layers:

1. **FortyGuard hyperlocal temperature** → per-building cooling/heating degree days + urban-heat-island anomaly
2. **Microsoft ML building footprints** → geometry, size, location for every building
3. **Landsat 8/9 imagery** → NDVI vegetation index + roof-albedo proxy

…through a transparent, physical energy model (EPA/CBECS intensities × ERCOT grid carbon).

Built for the **FortyGuard Hackathon 2026**.

## What's inside

| Section | What it shows |
|---|---|
| **Overview** | Headline KPIs, carbon by metro, by building type, emission concentration curve |
| **Carbon Map** | Every sampled building on a Leaflet map, colored by annual CO2e; layers for top-10% emitters, FortyGuard temperature anomaly, and Getis-Ord-style carbon hotspots |
| **Metro Analysis** | Per-capita comparison, vintage × intensity, size-vs-carbon scatter, top-20 emitter shortlist |
| **Heat Island** | The carbon that airport weather stations miss — quantified per anomaly bucket, per metro, per district |
| **Scenario Lab** | Live policy simulator: cool roofs, urban greening, HVAC retrofits, grid decarbonization — with investment, payback and $/ton abatement |
| **Policy Briefing** | Five data-backed actions for Texas governments, with evidence, actors and modeled impact |
| **Methodology** | Pipeline, formulas, every coefficient, validation anchors, honest limitations |

Everything recomputes live when you filter by metro. Dark/light theme toggle included.

## Quick start

```bash
npm install
npm run dev        # local dev server
npm run build      # production build → dist/
npm run preview    # serve the production build
npm run calibrate  # sanity-check modeled totals against real-world anchors
npm run build:single  # one self-contained HTML file → dist-single/index.html
```

Requires Node 18+.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository (branch `main`).
2. In the repo: **Settings → Pages → Source: "GitHub Actions"**.
3. Done — the included workflow (`.github/workflows/deploy.yml`) builds and deploys on every
   push. Your dashboard will be live at `https://<user>.github.io/<repo>/`.

(The Vite config uses relative paths, so it works under any repo name with zero changes.)

## Real FortyGuard data on board

`data/houston_day_2024-07-15.json` is the team's **real** `/v1/heatmap` capture (10,485 ×
100 m tiles over Houston's Downtown↔Gulfton corridor, °C, filter_type=3). It is compacted to
`src/data/houston_tiles.json` and used two ways: Houston-core buildings take their hyperlocal
heat anomaly from the **measured tile** they sit in (flagged ✓ in map popups and by the
"Houston temps: measured" header chip), and the Houston map's temperature layer renders the
capture itself. Other metros use the calibrated urban-form model until captures are made —
same one-call recipe per metro.

The map also carries a **bundled offline vector basemap** (Natural Earth 10m: Texas highways,
urban areas, lakes, city labels — `src/data/tx_basemap.json`) rendered beneath the CARTO
street tiles, so geography is always visible even with no tile network; online, street tiles
cover it automatically.

## ⚠️ Demo data — and how to swap in the real thing

The dashboard currently runs on a **synthetic, seeded dataset** (8,800 buildings across
realistic district geography), calibrated so every aggregate lands in defensible real-world
ranges — see `npm run calibrate` and the Methodology tab. No individual building on the map is
real; the "Demo data" badge in the header says so.

**The model is real.** `src/model/energyModel.js` implements the full physical calculation with
documented coefficients. To run on real data:

1. Produce building records from your pipeline (FortyGuard API + Microsoft footprints + Landsat
   NDVI, per the hackathon plan) with this schema per building:

```jsonc
{
  "id": "DAL-00001",
  "metro": "dallas",            // dallas | houston | austin | sanantonio
  "district": "Downtown",       // any label you aggregate by
  "lat": 32.78, "lng": -96.80,
  "type": "commercial",         // residential | commercial | industrial
  "footprintM2": 1250,
  "stories": 4,
  "floorAreaM2": 5000,
  "yearBuilt": 1992,
  "roofAlbedo": 0.31,           // Landsat proxy, 0–1
  "ndvi": 0.22,                 // mean NDVI within ~100 m
  "uhiDeltaF": 5.2,             // FortyGuard anomaly vs metro baseline
  "cdd": 3630, "hdd": 1730      // hyperlocal degree days (FortyGuard)
}
```

2. In `src/data/dataService.js → loadDataset()`, replace the generator call with a fetch of
   your GeoJSON/JSON, run each record through `calculateBuildingCarbon()` exactly as
   `generateBuildings.js` does, and set every expansion `weight` to 1 (full stock) or to your
   sampling weights.
3. Nothing else changes — map, charts, scenarios and policy numbers all read from the same
   service.

## Energy model (summary)

```
Cooling(kWh)  = FloorArea × CoolingEUI[type] × (CDD_local / 2900) × Age × Roof × Veg
Heating(kWhth)= FloorArea × HeatingEUI[type] × (HDD_local / 2100) × Age
Baseline(kWh) = FloorArea × BaselineEUI[type]
CO2e(kg)      = Electricity × 0.40 (ERCOT) + Gas_heating × 0.181 (5.31 kg/therm)

CDD_local = CDD_metro + ΔT_UHI × 150      ← where hyperlocal temperature plugs in
Roof      = 1 + (0.45 − albedo) × 0.875   ← cool-roof lever
Veg       = 1 − NDVI × 0.5                ← urban-greening lever
```

All coefficients live in `MODEL_PARAMS` (`src/model/energyModel.js`) and are printed on the
Methodology tab. Validation anchors (residential ≈ 8 t/home/yr, commercial ≈ 60 kg/m²/yr,
4-metro total ≈ 107 Mt/yr ≈ metro share of ERCOT load, UHI ≈ 12% of cooling carbon) are checked
by `npm run calibrate`.

## Tech

React 18 + Vite · Leaflet / react-leaflet (canvas renderer) · Recharts · no backend — the whole
analysis runs client-side, which is what makes the live metro filtering and scenario sliders
instant.

Design follows a validated data-viz system: CVD-safe categorical palette (checked in both
themes), one-hue ordinal ramps, a semantic heat scale for carbon with an always-visible legend,
and a table view on every chart for accessibility.

## Project structure

```
src/
├── model/energyModel.js      # the physics — all coefficients documented
├── data/
│   ├── metros.js             # metro + district geography, stock counts
│   ├── generateBuildings.js  # seeded synthetic sample (swap point for real data)
│   └── dataService.js        # aggregations: summaries, hotspots, curves, buckets
├── theme/palette.js          # validated chart palettes (dark + light)
├── context/AppContext.jsx    # theme, metro filter, dataset
├── components/               # shell, chart kit, map
└── sections/                 # Overview · Map · Metros · HeatIsland · Scenarios · Policy · Methodology
scripts/calibrate.mjs         # real-world sanity anchors
.github/workflows/deploy.yml  # GitHub Pages CI
```

## Team

Built by a 3-person geography / remote-sensing / GIS team for the FortyGuard Hackathon 2026.
Temperature data: [FortyGuard](https://www.fortyguard.com). Basemap © OpenStreetMap © CARTO.

## License

MIT — see `LICENSE`.
