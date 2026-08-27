import { useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { SectionHead } from '../components/Shell.jsx'
import CarbonMap from '../components/map/CarbonMap.jsx'
import { StatTile } from '../components/ChartKit.jsx'
import { computeSummary, hotspots, fmt, fmtInt } from '../data/dataService.js'
import { METROS } from '../data/metros.js'

export default function MapExplorer() {
  const { buildings, metro, dataset } = useApp()
  const s = useMemo(() => computeSummary(buildings), [buildings])
  const spotCount = useMemo(() => {
    if (metro === 'all') return '—'
    return hotspots(dataset.byMetro[metro]).length
  }, [metro, dataset])

  return (
    <>
      <SectionHead title="Building carbon map">
        {metro === 'all'
          ? 'Statewide view of the four metros. Pick a metro to drop to street level — every dot is a sampled building, colored by its modeled annual emissions, with hyperlocal heat-anomaly and hotspot overlays.'
          : `${METROS[metro].name}: each dot is one sampled building. Click any building for its full carbon profile and retrofit potential; toggle the FortyGuard temperature-anomaly surface to see how heat and carbon co-locate.`}
      </SectionHead>

      <div className="grid kpis" style={{ marginBottom: 14 }}>
        <StatTile label="Sampled buildings shown" value={fmtInt(s.count)} foot="Stratified sample across districts" />
        <StatTile label="Sample carbon" value={fmt(s.sampleTons)} unit="t / yr" foot="Sum over sampled buildings only" />
        <StatTile label="Median building" value={s.medianTons.toFixed(1)} unit="t / yr" foot={`Mean ${s.meanTons.toFixed(1)} t — long right tail`} />
        <StatTile label="Detected hotspots" value={spotCount} foot="Gi*-style high-carbon clusters (z > 1.6)" />
      </div>

      <CarbonMap />

      <p className="foot-note">
        Layers: <b>Top 10% emitters</b> isolates the precision-targeting opportunity ·{' '}
        <b>Temperature anomaly</b> overlays the simulated FortyGuard hyperlocal heat surface ·{' '}
        <b>Carbon hotspots</b> rings statistically significant clusters (simplified Getis-Ord Gi*).
        With production data the dot layer swaps to true Microsoft footprint polygons via the same
        GeoJSON pipeline.
      </p>
    </>
  )
}
