import { useEffect, useState } from 'react'
import { api, isMock } from './api.js'
import RouteExplorer from './views/RouteExplorer.jsx'
import AirlineBoard from './views/AirlineBoard.jsx'
import Deals from './views/Deals.jsx'
import SavedRoutes from './views/SavedRoutes.jsx'
import AuthPanel from './components/AuthPanel.jsx'

const TABS = [
  ['explore', 'Route explorer'],
  ['airlines', 'Airline comparison'],
  ['deals', 'Deals'],
  ['saved', 'Saved routes'],
]

export default function App() {
  const [tab, setTab] = useState('explore')
  const [airports, setAirports] = useState([])
  const [airlines, setAirlines] = useState([])
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fw:session')) } catch { return null }
  })
  const [authOpen, setAuthOpen] = useState(false)
  // Lets "Save this route" on other tabs pre-fill the Saved routes form.
  const [draft, setDraft] = useState(null)

  useEffect(() => {
    api.airports().then(setAirports).catch(() => {})
    api.airlines().then(setAirlines).catch(() => {})
  }, [])

  const signIn = (u) => {
    setUser(u)
    localStorage.setItem('fw:session', JSON.stringify(u))
    setAuthOpen(false)
  }
  const signOut = () => {
    setUser(null)
    localStorage.removeItem('fw:session')
  }
  const saveDraft = (d) => {
    if (!user) { setAuthOpen(true); return }
    setDraft(d)
    setTab('saved')
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">FareWise</div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'tab on' : 'tab'} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        <div className="who">
          {user ? (
            <>
              <span>{user.username} <small>home {user.airport_home}</small></span>
              <button className="ghost" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <button className="solid" onClick={() => setAuthOpen(true)}>Sign in</button>
          )}
        </div>
      </header>

      {isMock && <div className="mockbar">Showing sample data. Set <code>VITE_USE_MOCK=false</code> to use the live database.</div>}

      <main>
        {tab === 'explore' && <RouteExplorer airports={airports} user={user} onSave={saveDraft} />}
        {tab === 'airlines' && <AirlineBoard airports={airports} />}
        {tab === 'deals' && <Deals airports={airports} onSave={saveDraft} />}
        {tab === 'saved' && (
          <SavedRoutes user={user} airports={airports} airlines={airlines} draft={draft} clearDraft={() => setDraft(null)} onNeedAuth={() => setAuthOpen(true)} />
        )}
      </main>

      {authOpen && <AuthPanel airports={airports} onDone={signIn} onClose={() => setAuthOpen(false)} />}
    </div>
  )
}
