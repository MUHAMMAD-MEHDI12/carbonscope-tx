import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { loadDataset, getBuildings } from '../data/dataService.js'
import { PALETTES } from '../theme/palette.js'

const Ctx = createContext(null)

export function AppProvider({ children }) {
  const [theme, setTheme] = useState(() =>
    document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  )
  const [metro, setMetro] = useState('all') // 'all' | metro id
  const [section, setSection] = useState('overview')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('cstx-theme', theme)
    } catch (e) {
      /* storage unavailable — theme still applies for this visit */
    }
  }, [theme])

  const dataset = useMemo(() => loadDataset(), [])
  const buildings = useMemo(() => getBuildings(metro), [metro])
  const pal = PALETTES[theme]

  const value = {
    theme,
    setTheme,
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    metro,
    setMetro,
    section,
    setSection,
    dataset,
    buildings,
    pal,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  return useContext(Ctx)
}
