import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Tooltip as LTooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useApp } from '../../context/AppContext.jsx'
import { METROS, METRO_LIST, TYPE_LABELS } from '../../data/metros.js'
import { hotspots as computeHotspots, fmt, fmtInt } from '../../data/dataService.js'
import { HEAT_BINS, UHI_BINS, heatColorFor, uhiColorFor, PALETTES } from '../../theme/palette.js'
import VectorBasemap from './VectorBasemap.jsx'
import { MEASURED } from '../../data/measuredTiles.js'
import { REAL_BUILDINGS } from '../../data/realBuildings.js'

const TX_BOUNDS = [
  [28.9, -99.6],
  [33.5, -94.6],
]

// Esri Canvas basemaps — free, no API key, dark + light variants
const TILE_URLS = {
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
}
// Matching label/reference overlay (place names, roads labels)
const REF_URLS = {
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
}

// Satellite view (Esri World Imagery — free, no key) + place-name labels
const SAT_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const SAT_REF =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'

const ATTRIB =
  'Basemap &copy; Esri &amp; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors · Temp: FortyGuard'

/** Reports the current zoom so the building layer can switch dots ⇄ true footprints. */
function ZoomWatcher({ onZoom }) {
  useMapEvents({ zoomend: (e) => onZoom(e.target.getZoom()) })
  return null
}

/** Bounds covering all of a metro's districts (plus margin) — and, when real
 * footprints exist for the metro, their actual extent too, so the user's own
 * building data is always in view. */
function metroBounds(m, metroId) {
  let minLat = 90
  let maxLat = -90
  let minLng = 180
  let maxLng = -180
  for (const d of m.districts) {
    const dLat = (d.spreadKm * 1.35) / 111.32
    const dLng = (d.spreadKm * 1.35) / (111.32 * Math.cos((d.center[0] * Math.PI) / 180))
    minLat = Math.min(minLat, d.center[0] - dLat)
    maxLat = Math.max(maxLat, d.center[0] + dLat)
    minLng = Math.min(minLng, d.center[1] - dLng)
    maxLng = Math.max(maxLng, d.center[1] + dLng)
  }
  const rb = REAL_BUILDINGS[metroId]
  if (rb?.meta?.extent) {
    const [w, s, e, n] = rb.meta.extent
    minLat = Math.min(minLat, s - 0.01)
    maxLat = Math.max(maxLat, n + 0.01)
    minLng = Math.min(minLng, w - 0.01)
    maxLng = Math.max(maxLng, e + 0.01)
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ]
}

/** Repositions the view when the metro filter changes. */
function ViewController({ metro }) {
  const map = useMap()
  useEffect(() => {
    if (metro === 'all') {
      map.fitBounds(TX_BOUNDS, { padding: [20, 20] })
    } else {
      map.flyToBounds(metroBounds(METROS[metro], metro), { padding: [24, 24], duration: 0.8 })
    }
  }, [metro, map])
  return null
}

function dotRadius(footprintM2) {
  // sqrt-ish scaling clamped for legibility at metro zoom
  return Math.min(9, Math.max(2.2, Math.sqrt(footprintM2) / 9))
}

function popupHtml(b, theme) {
  const tons = b.carbonTons
  const save = b.coolRoofSavingsKg / 1000
  const rows = [
    ['Annual carbon', `<b>${tons >= 100 ? tons.toFixed(0) : tons.toFixed(1)} t CO2e</b>`],
    ['Intensity', `${b.intensityKgM2.toFixed(0)} kg/m²`],
    ['Type', TYPE_LABELS[b.type]],
    ['Built', String(b.yearBuilt)],
    ['Footprint', `${fmtInt(b.footprintM2)} m² × ${b.stories} fl`],
    ['Roof albedo', b.roofAlbedo.toFixed(2)],
    ['Nearby NDVI', b.ndvi.toFixed(2)],
    [
      'Local heat anomaly',
      `+${b.uhiDeltaF.toFixed(1)}°F${b.measured ? ' ✓' : ''}`,
    ],
    ...(b.measured
      ? [['Tile day max (measured)', `${b.tileMaxC.toFixed(1)} °C`]]
      : []),
    ['Cooling degree days', fmtInt(b.cdd)],
    ['Metro rank', `#${fmtInt(b.rank)} (top ${(100 - b.pctile).toFixed(1)}%)`],
  ]
  return `
    <div class="pop-title">Building ${b.id}</div>
    <div class="pop-sub">${b.district}</div>
    <div class="pop-grid">
      ${rows.map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`).join('')}
    </div>
    ${
      save > 0.5
        ? `<div class="pop-flag">Cool-roof retrofit would save ≈ ${save >= 10 ? save.toFixed(0) : save.toFixed(1)} t CO2e/yr</div>`
        : ''
    }
  `
}

export default function CarbonMap() {
  const { metro, setMetro, theme, dataset } = useApp()
  const pal = PALETTES[theme]
  const [layers, setLayers] = useState({ top10: false, temp: false, hotspots: true })
  const [basemap, setBasemap] = useState('streets') // 'streets' | 'satellite'
  const [zoom, setZoom] = useState(11)
  const [tilesOk, setTilesOk] = useState(true)
  const tileFailCount = useRef(0)

  const metroBuildings = metro === 'all' ? null : dataset.byMetro[metro]

  const shown = useMemo(() => {
    if (!metroBuildings) return []
    return layers.top10 ? metroBuildings.filter((b) => b.pctile >= 90) : metroBuildings
  }, [metroBuildings, layers.top10])

  // Buildings layer: dots at metro zoom; TRUE footprint outlines (where the
  // prepare script stored them) once zoomed in — perfect for checking the
  // overlay against satellite imagery.
  const footprintMode = zoom >= 15
  const buildingsGeo = useMemo(() => {
    if (!shown.length) return null
    return {
      type: 'FeatureCollection',
      features: shown.map((b) => {
        if (footprintMode && b.realRing && b.realRing.length >= 3) {
          const ring = b.realRing.map(([la, ln]) => [ln, la])
          ring.push(ring[0])
          return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: b }
        }
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [b.lng, b.lat] }, properties: b }
      }),
    }
  }, [shown, footprintMode])

  // Metros with a REAL FortyGuard capture: temperature layer renders the measured tiles
  const measuredReg = metro !== 'all' ? MEASURED[metro] : null

  const measuredTempGeo = useMemo(() => {
    if (!measuredReg || !layers.temp) return null
    const { p05_max, p95_max } = measuredReg.meta
    const span = p95_max - p05_max || 1
    return {
      type: 'FeatureCollection',
      features: measuredReg.tiles.map((t) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [t[1], t[0]] },
        properties: { i: Math.min(4, Math.max(0, Math.floor(((t[3] - p05_max) / span) * 5))) },
      })),
    }
  }, [measuredReg, layers.temp])

  const measuredTempBins = useMemo(() => {
    if (!measuredReg) return []
    const { p05_max, p95_max } = measuredReg.meta
    const step = (p95_max - p05_max) / 5
    return Array.from({ length: 5 }, (_, i) => `${(p05_max + i * step).toFixed(1)} – ${(p05_max + (i + 1) * step).toFixed(1)} °C`)
  }, [measuredReg])

  const tempGeo = useMemo(() => {
    if (metro === 'all' || MEASURED[metro] || !layers.temp) return null
    const cells = dataset.tempGrids[metro] || []
    return {
      type: 'FeatureCollection',
      features: cells
        .map((c) => {
          const color = uhiColorFor(c.uhiF, theme)
          if (!color) return null
          return {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [c.lng, c.lat],
                  [c.lng + c.step, c.lat],
                  [c.lng + c.step, c.lat + c.step],
                  [c.lng, c.lat + c.step],
                  [c.lng, c.lat],
                ],
              ],
            },
            properties: { uhiF: c.uhiF, color },
          }
        })
        .filter(Boolean),
    }
  }, [metro, layers.temp, dataset, theme])

  const spots = useMemo(() => {
    if (metro === 'all' || !layers.hotspots || !metroBuildings) return []
    return computeHotspots(metroBuildings)
  }, [metro, layers.hotspots, metroBuildings])

  const metroRows = useMemo(
    () =>
      METRO_LIST.map((m) => {
        const bs = dataset.byMetro[m.id]
        let kg = 0
        for (const b of bs) kg += b.carbonKg * (b.weight || 1)
        return { ...m, mtons: kg / 1e9 }
      }),
    [dataset]
  )

  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }))

  return (
    <div className="card map-card">
      <div className="map-toolbar">
        {metro === 'all' ? (
          <span className="small" style={{ color: 'var(--text-2)' }}>
            Metro totals — click a circle (or use the filter above) to open building-level detail
          </span>
        ) : (
          <>
            <span className="small" style={{ color: 'var(--text-2)', marginRight: 4 }}>
              {fmtInt(shown.length)} sampled buildings · each dot = one building
            </span>
            <button className={'mini-btn' + (layers.top10 ? ' on' : '')} onClick={() => toggle('top10')}>
              Top 10% emitters
            </button>
            <button className={'mini-btn' + (layers.temp ? ' on' : '')} onClick={() => toggle('temp')}>
              Temperature anomaly
            </button>
            <button className={'mini-btn' + (layers.hotspots ? ' on' : '')} onClick={() => toggle('hotspots')}>
              Carbon hotspots
            </button>
          </>
        )}
        <span style={{ flex: 1 }} />
        <div className="seg" role="tablist" aria-label="Basemap style">
          <button className={basemap === 'streets' ? 'on' : ''} onClick={() => setBasemap('streets')}>
            Streets
          </button>
          <button className={basemap === 'satellite' ? 'on' : ''} onClick={() => setBasemap('satellite')}>
            Satellite
          </button>
        </div>
      </div>

      <div className="map-holder">
        <MapContainer
          bounds={TX_BOUNDS}
          preferCanvas
          zoomSnap={0.5}
          minZoom={5}
          attributionControl={true}
          style={{ background: 'var(--map-bg)' }}
        >
          <ViewController metro={metro} />
          <ZoomWatcher onZoom={setZoom} />
          <VectorBasemap theme={theme} />
          {basemap === 'streets' ? (
            <>
              <TileLayer
                key={theme}
                url={TILE_URLS[theme]}
                attribution={ATTRIB}
                maxNativeZoom={16}
                maxZoom={19}
                eventHandlers={{
                  tileerror: () => {
                    tileFailCount.current += 1
                    if (tileFailCount.current > 3) setTilesOk(false)
                  },
                  tileload: () => {
                    tileFailCount.current = 0
                    setTilesOk(true)
                  },
                }}
              />
              <TileLayer key={'ref' + theme} url={REF_URLS[theme]} maxNativeZoom={16} maxZoom={19} />
            </>
          ) : (
            <>
              <TileLayer
                key="sat"
                url={SAT_URL}
                attribution={'Imagery &copy; Esri · ' + ATTRIB}
                maxNativeZoom={19}
                maxZoom={19}
                eventHandlers={{
                  tileerror: () => {
                    tileFailCount.current += 1
                    if (tileFailCount.current > 3) setTilesOk(false)
                  },
                  tileload: () => {
                    tileFailCount.current = 0
                    setTilesOk(true)
                  },
                }}
              />
              <TileLayer key="satref" url={SAT_REF} maxNativeZoom={18} maxZoom={19} />
            </>
          )}

          {tempGeo ? (
            <GeoJSON
              key={'temp-' + metro + theme}
              data={tempGeo}
              style={(f) => ({
                fillColor: f.properties.color,
                fillOpacity: 0.26,
                stroke: false,
                interactive: false,
              })}
            />
          ) : null}

          {measuredTempGeo ? (
            <GeoJSON
              key={'mtemp' + metro + theme}
              data={measuredTempGeo}
              pointToLayer={(f, latlng) =>
                L.circleMarker(latlng, {
                  radius: 3,
                  stroke: false,
                  fillColor: pal.heat[f.properties.i],
                  fillOpacity: 0.4,
                  interactive: false,
                })
              }
            />
          ) : null}

          {buildingsGeo ? (
            <GeoJSON
              key={'b-' + metro + theme + basemap + (layers.top10 ? '-t' : '') + (footprintMode ? '-f' : '')}
              data={buildingsGeo}
              pointToLayer={(f, latlng) => {
                const b = f.properties
                return L.circleMarker(latlng, {
                  radius: dotRadius(b.footprintM2),
                  fillColor: heatColorFor(b.carbonTons, theme),
                  fillOpacity: basemap === 'satellite' ? 0.7 : 0.85,
                  color:
                    basemap === 'satellite'
                      ? 'rgba(255,255,255,0.9)'
                      : theme === 'dark'
                        ? 'rgba(0,0,0,0.45)'
                        : 'rgba(255,255,255,0.8)',
                  weight: 0.7,
                })
              }}
              style={(f) =>
                f.geometry.type === 'Polygon'
                  ? {
                      fillColor: heatColorFor(f.properties.carbonTons, theme),
                      fillOpacity: basemap === 'satellite' ? 0.45 : 0.75,
                      color: basemap === 'satellite' ? '#ffffff' : theme === 'dark' ? '#0d0d0d' : '#ffffff',
                      weight: 1.2,
                    }
                  : undefined
              }
              onEachFeature={(f, layer) => {
                layer.bindPopup(popupHtml(f.properties, theme), { maxWidth: 300 })
              }}
            />
          ) : null}

          {spots.map((h, i) => (
            <CircleMarker
              key={'h' + i}
              center={[h.lat, h.lng]}
              radius={16 + Math.min(14, h.z * 4)}
              pathOptions={{
                color: pal.heat[3],
                weight: 2,
                dashArray: null,
                fill: true,
                fillColor: pal.heat[3],
                fillOpacity: 0.08,
              }}
            >
              <LTooltip direction="top" opacity={0.96}>
                <span style={{ fontWeight: 700 }}>Carbon hotspot #{i + 1}</span>
                <br />
                {fmt(h.kg / 1000, 0)} t/yr across {h.n} sampled buildings
                <br />
                Gi*-style z-score: {h.z.toFixed(1)}
              </LTooltip>
            </CircleMarker>
          ))}

          {metro === 'all'
            ? metroRows.map((m) => {
                const r = 14 + Math.sqrt(m.mtons) * 4.6
                return (
                  <CircleMarker
                    key={m.id}
                    center={m.center}
                    radius={r}
                    pathOptions={{
                      fillColor: pal.heat[2],
                      fillOpacity: 0.55,
                      color: pal.heat[3],
                      weight: 2,
                    }}
                    eventHandlers={{ click: () => setMetro(m.id) }}
                  >
                    <LTooltip direction="top" offset={[0, -r]} opacity={1} permanent>
                      <span style={{ fontWeight: 700 }}>{m.short}</span> · {m.mtons.toFixed(0)} Mt/yr
                    </LTooltip>
                  </CircleMarker>
                )
              })
            : null}

          {metro !== 'all'
            ? METROS[metro].districts.map((d) => (
                <CircleMarker
                  key={d.id}
                  center={d.center}
                  radius={0.1}
                  pathOptions={{ opacity: 0, fillOpacity: 0 }}
                  interactive={false}
                >
                  <LTooltip
                    direction="center"
                    permanent
                    interactive={false}
                    className="district-label"
                    opacity={1}
                  >
                    {d.name}
                  </LTooltip>
                </CircleMarker>
              ))
            : null}
        </MapContainer>

        <div className="map-legend">
          <div className="t">Annual carbon / building</div>
          {HEAT_BINS.map((b, i) => (
            <div className="legend-row" key={b.label}>
              <span className="legend-swatch" style={{ background: pal.heat[i] }} />
              {b.label} CO2e
            </div>
          ))}
          {layers.temp && measuredReg ? (
            <>
              <div className="t" style={{ marginTop: 8 }}>
                Tile day-max °C — measured
              </div>
              {measuredTempBins.map((label, i) => (
                <div className="legend-row" key={label}>
                  <span className="legend-swatch" style={{ background: pal.heat[i], opacity: 0.6 }} />
                  {label}
                </div>
              ))}
              <div className="legend-row" style={{ color: 'var(--muted)' }}>
                FortyGuard capture · {measuredReg.meta.date || '2024-07-15'}
              </div>
            </>
          ) : layers.temp && metro !== 'all' ? (
            <>
              <div className="t" style={{ marginTop: 8 }}>
                Heat anomaly (modeled)
              </div>
              {UHI_BINS.map((b, i) => (
                <div className="legend-row" key={b.label}>
                  <span className="legend-swatch" style={{ background: pal.heat[i], opacity: 0.5 }} />
                  {b.label}
                </div>
              ))}
            </>
          ) : null}
        </div>

        {!tilesOk ? (
          <div className="map-note">
            Offline mode: showing the bundled Texas reference basemap (highways, urban areas,
            water — Natural Earth). Full street tiles load automatically on the deployed site.
          </div>
        ) : null}
      </div>
    </div>
  )
}
