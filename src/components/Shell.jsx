import { useApp } from '../context/AppContext.jsx'
import { METRO_LIST, METROS } from '../data/metros.js'
import { REAL_BUILDINGS, REAL_BUILDING_METROS } from '../data/realBuildings.js'

function RealFootprintChip() {
  const metros = REAL_BUILDING_METROS()
  if (!metros.length) return null
  const names = metros.map((m) => METROS[m]?.short || m).join(', ')
  return (
    <span
      className="chip"
      title="These metros use REAL building footprints (positions + areas from the footprints file via scripts/prepare_buildings.mjs); type/vintage/roof remain model estimates"
    >
      ● Real footprints: {names}
    </span>
  )
}

function TeamCarbonChip() {
  const metros = REAL_BUILDING_METROS().filter((m) => REAL_BUILDINGS[m]?.meta?.carbon?.n_with_carbon > 0)
  if (!metros.length) return null
  const names = metros.map((m) => METROS[m]?.short || m).join(', ')
  return (
    <span
      className="chip"
      title="Per-building annual CO2e computed by the team from its own footprints file replaces the model estimate for these metros (scripts/prepare_buildings.mjs --carbon)"
    >
      ● Carbon: team data ({names})
    </span>
  )
}
import {
  IconGrid,
  IconMap,
  IconBars,
  IconThermo,
  IconSliders,
  IconGov,
  IconDoc,
  IconSun,
  IconMoon,
} from './Icons.jsx'

export const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: IconGrid, desc: 'Headline carbon picture across the four Texas metros' },
  { id: 'map', label: 'Carbon Map', icon: IconMap, desc: 'Every sampled building, colored by annual emissions' },
  { id: 'metros', label: 'Metro Analysis', icon: IconBars, desc: 'Compare metros, building types, vintages and top emitters' },
  { id: 'uhi', label: 'Heat Island', icon: IconThermo, desc: 'What hyperlocal temperature data reveals about hidden carbon' },
  { id: 'scenarios', label: 'Scenario Lab', icon: IconSliders, desc: 'Interactive retrofit and policy scenario modeling' },
  { id: 'policy', label: 'Policy Briefing', icon: IconGov, desc: 'Data-backed actions for Texas governments' },
  { id: 'methods', label: 'Methodology', icon: IconDoc, desc: 'Data sources, model formulas, assumptions and limitations' },
]

export function Sidebar() {
  const { section, setSection } = useApp()
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">C</div>
        <div>
          <div className="brand-name">CarbonScope TX</div>
          <div className="brand-sub">Building Carbon Intelligence</div>
        </div>
      </div>
      <div className="nav-label">Dashboard</div>
      {SECTIONS.map((s) => {
        const Ico = s.icon
        return (
          <button
            key={s.id}
            className={'nav-item' + (section === s.id ? ' active' : '')}
            onClick={() => setSection(s.id)}
          >
            <Ico className="ico" />
            {s.label}
          </button>
        )
      })}
      <div className="sidebar-foot">
        FortyGuard Hackathon 2026
        <br />
        Hyperlocal temperature × GIS × remote sensing
        <br />
        Team GeoHeat (FG-289)
      </div>
    </aside>
  )
}

export function Header() {
  const { metro, setMetro, theme, toggleTheme, section } = useApp()
  const current = SECTIONS.find((s) => s.id === section)
  return (
    <header className="header">
      <h1>{current?.label}</h1>
      <span className="chip demo" title="Building type, vintage and roof attributes are model estimates calibrated to EPA/ERCOT/CBECS benchmarks. Dallas uses the team's real footprints; all four metro cores use measured FortyGuard temperatures.">
        ● Attributes: modeled
      </span>
      <span
        className="chip"
        title="Measured 100 m thermal tiles (FortyGuard /v1/heatmap, 41,367 tiles across the four metro cores) drive hyperlocal temperatures for buildings inside every captured core, and the temperature map layers"
      >
        ● Temps: measured
      </span>
      <RealFootprintChip />
      <TeamCarbonChip />
      <div className="seg" role="tablist" aria-label="Metro filter">
        <button className={metro === 'all' ? 'on' : ''} onClick={() => setMetro('all')}>
          All metros
        </button>
        {METRO_LIST.map((m) => (
          <button
            key={m.id}
            className={metro === m.id ? 'on' : ''}
            onClick={() => setMetro(m.id)}
          >
            {m.short}
          </button>
        ))}
      </div>
      <button
        className="icon-btn"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label="Toggle color theme"
      >
        {theme === 'dark' ? <IconSun width={17} /> : <IconMoon width={16} />}
      </button>
    </header>
  )
}

export function SectionHead({ title, children }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
    </div>
  )
}
