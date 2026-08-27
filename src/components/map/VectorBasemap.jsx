/**
 * Offline vector basemap — real Texas geography bundled into the app
 * (Natural Earth 10m: major highways, urban footprints, lakes, city labels),
 * so the map reads correctly even where street tiles can't load (offline
 * preview, restricted networks). Rendered in a low z-index pane: when the
 * CARTO street tiles DO load, they cover it seamlessly.
 */
import { useMemo, useState } from 'react'
import { Pane, GeoJSON, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet'
import BM from '../../data/tx_basemap.json'

const STYLES = {
  dark: {
    urban: { fillColor: '#242423', fillOpacity: 1, stroke: false },
    lakes: { fillColor: '#1c2a33', fillOpacity: 1, stroke: false },
    roadMH: { color: '#4d4d48', weight: 2 },
    roadSH: { color: '#38383400', weight: 1, color2: '#383834' },
  },
  light: {
    urban: { fillColor: '#dedcd5', fillOpacity: 1, stroke: false },
    lakes: { fillColor: '#c3d6dd', fillOpacity: 1, stroke: false },
    roadMH: { color: '#b3b1a8', weight: 2 },
    roadSH: { color: '#c9c7be', weight: 1 },
  },
}

function toGeo(items, isLine) {
  return {
    type: 'FeatureCollection',
    features: items.map((it) => ({
      type: 'Feature',
      properties: { t: it.t || '' },
      geometry: {
        type:
          it.g === 'ML' ? 'MultiLineString' : it.g === 'L' ? 'LineString' : it.g === 'MP' ? 'MultiPolygon' : 'Polygon',
        coordinates: it.c,
      },
    })),
  }
}

export default function VectorBasemap({ theme }) {
  const S = STYLES[theme]
  const [zoom, setZoom] = useState(7)
  useMapEvents({ zoomend: (e) => setZoom(e.target.getZoom()) })

  const urban = useMemo(() => toGeo(BM.urban), [])
  const lakes = useMemo(() => toGeo(BM.lakes), [])
  const roadsMH = useMemo(() => toGeo(BM.roads.filter((r) => r.t === 'MH'), true), [])
  const roadsSH = useMemo(() => toGeo(BM.roads.filter((r) => r.t !== 'MH'), true), [])

  const labels = useMemo(() => {
    const major = BM.places.filter((p) => p.pop >= 600000)
    if (zoom >= 9.5) return BM.places.filter((p) => p.pop >= 25000)
    if (zoom >= 8) return BM.places.filter((p) => p.pop >= 150000)
    return major
  }, [zoom])

  return (
    <Pane name="txbase" style={{ zIndex: 150 }}>
      <GeoJSON key={'u' + theme} data={urban} style={S.urban} interactive={false} />
      <GeoJSON key={'l' + theme} data={lakes} style={S.lakes} interactive={false} />
      <GeoJSON key={'rs' + theme} data={roadsSH} style={{ color: S.roadSH.color2 || S.roadSH.color, weight: S.roadSH.weight }} interactive={false} />
      <GeoJSON key={'rm' + theme} data={roadsMH} style={S.roadMH} interactive={false} />
      {labels.map((p) => (
        <CircleMarker
          key={p.n + p.x}
          center={[p.y, p.x]}
          radius={0.1}
          pathOptions={{ opacity: 0, fillOpacity: 0 }}
          interactive={false}
        >
          <Tooltip direction="center" permanent interactive={false} className="district-label" opacity={0.9}>
            {p.n}
          </Tooltip>
        </CircleMarker>
      ))}
    </Pane>
  )
}
