import { useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { SectionHead } from '../components/Shell.jsx'
import CarbonMap from '../components/map/CarbonMap.jsx'
import { StatTile } from '../components/ChartKit.jsx'
import { computeSummary, concentrationCurve, fmt, fmtInt } from '../data/dataService.js'
import { METROS } from '../data/metros.js'

export default function MapExplorer() {
  const { buildings, metro, dataset } = useApp()
  const s = useMemo(() => computeSummary(buildings), [buildings])
  const conc = useMemo(() => concentrationCurve(buildings), [buildings])

  return (
    <>
      <SectionHead title="Building carbon map">
        {metro === 'all'
          ? 'Statewide view of the four metros. Pick a metro to drop to street level — every dot is a sampled building, colored by its modeled annual emissions, with the hyperlocal heat-anomaly overlay.'
          : `${METROS[metro].name}: each dot is one sampled building. Click any building for its full carbon profile and retrofit potential; toggle the FortyGuard temperature-anomaly surface to see how heat and carbon co-locate.`}
      </SectionHead>

      <div className="grid kpis" style={{ marginBottom: 14 }}>
        <StatTile label="Sampled buildings shown" value={fmtInt(s.count)} foot="Stratified sample across districts" />
        <StatTile label="Sample carbon" value={fmt(s.sampleTons)} unit="t / yr" foot="Sum over sampled buildings only" />
        <StatTile label="Median building" value={s.medianTons.toFixed(1)} unit="t / yr" foot={`Mean ${s.meanTons.toFixed(1)} t — long right tail`} />
        <StatTile label="Top 10% emitters" value={conc.top10Pct.toFixed(0) + '%'} foot="Share of sample carbon — the precision-targeting case" />
      </div>

      <CarbonMap />

      <p className="foot-note">
        Layers: <b>Top 10% emitters</b> isolates the precision-targeting opportunity ·{' '}
        <b>Temperature anomaly</b> overlays the simulated FortyGuard hyperlocal heat surface. Zoom in with
        <b> Satellite</b> on to see true footprint outlines over aerial imagery.
      </p>
    </>
  )
}
