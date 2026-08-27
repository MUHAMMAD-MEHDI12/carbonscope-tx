import { AppProvider, useApp } from './context/AppContext.jsx'
import { Sidebar, Header } from './components/Shell.jsx'
import Overview from './sections/Overview.jsx'
import MapExplorer from './sections/MapExplorer.jsx'
import Metros from './sections/Metros.jsx'
import HeatIsland from './sections/HeatIsland.jsx'
import Scenarios from './sections/Scenarios.jsx'
import Policy from './sections/Policy.jsx'
import Methodology from './sections/Methodology.jsx'

function Body() {
  const { section } = useApp()
  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <Header />
        <div className="content">
          {section === 'overview' && <Overview />}
          {section === 'map' && <MapExplorer />}
          {section === 'metros' && <Metros />}
          {section === 'uhi' && <HeatIsland />}
          {section === 'scenarios' && <Scenarios />}
          {section === 'policy' && <Policy />}
          {section === 'methods' && <Methodology />}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Body />
    </AppProvider>
  )
}
