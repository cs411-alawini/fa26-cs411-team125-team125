import { useEffect, useState } from 'react'
import { api } from '../api.js'
import useQuery from '../components/useQuery.js'
import { Loading, Empty, ErrorBox, money } from '../components/State.jsx'

const DAYS = ['Any day', 'Weekdays', 'Weekends', 'Holiday season']
const STOPS = ['Any', 'Nonstop', 'Connecting', 'International']
const blank = { origin_airport: 'JFK', destination_airport: 'LAX', airline_id: '', departure_day_filter: 'Any day', stop_type: 'Any', target_price: '', note: '' }

// CRUD on Saved_Route for the signed-in user.
export default function SavedRoutes({ user, airports, airlines, draft, clearDraft, onNeedAuth }) {
  const [tick, setTick] = useState(0)
  const [form, setForm] = useState(blank)
  const [showArchived, setShowArchived] = useState(false)
  const [err, setErr] = useState('')
  const refresh = () => setTick((t) => t + 1)

  useEffect(() => {
    if (draft) { setForm({ ...blank, ...draft }); clearDraft() }
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, loading, error } = useQuery(() => (user ? api.listRoutes(user.user_id) : Promise.resolve([])), [user?.user_id, tick])

  if (!user) {
    return (
      <section className="panel">
        <h2>Saved routes</h2>
        <p className="sub">Sign in to keep a list of routes with target prices and notes.</p>
        <button className="solid" onClick={onNeedAuth}>Sign in</button>
      </section>
    )
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const add = async (e) => {
    e.preventDefault(); setErr('')
    if (form.origin_airport === form.destination_airport) return setErr('Origin and destination must differ.')
    try {
      await api.createRoute(user.user_id, {
        ...form,
        airline_id: form.airline_id ? Number(form.airline_id) : null,
        target_price: form.target_price === '' ? null : Number(form.target_price),
      })
      setForm(blank); refresh()
    } catch (x) { setErr(x.message) }
  }
  const act = (fn) => async () => { try { await fn(); refresh() } catch (x) { setErr(x.message) } }
  const shown = (data || []).filter((r) => showArchived || !r.is_archived)
  const airlineName = (id) => airlines.find((a) => a.airline_id === id)?.airline_name

  return (
    <section>
      <form className="panel form" onSubmit={add}>
        <h2>Track a route</h2>
        <div className="grid">
          <label>From<select value={form.origin_airport} onChange={set('origin_airport')}>{airports.map((a) => <option key={a.airport_code} value={a.airport_code}>{a.airport_code} · {a.city}</option>)}</select></label>
          <label>To<select value={form.destination_airport} onChange={set('destination_airport')}>{airports.map((a) => <option key={a.airport_code} value={a.airport_code}>{a.airport_code} · {a.city}</option>)}</select></label>
          <label>Airline<select value={form.airline_id} onChange={set('airline_id')}><option value="">Any airline</option>{airlines.map((a) => <option key={a.airline_id} value={a.airline_id}>{a.airline_name}</option>)}</select></label>
          <label>Departure<select value={form.departure_day_filter} onChange={set('departure_day_filter')}>{DAYS.map((d) => <option key={d}>{d}</option>)}</select></label>
          <label>Flight type<select value={form.stop_type} onChange={set('stop_type')}>{STOPS.map((d) => <option key={d}>{d}</option>)}</select></label>
          <label>Target price ($)<input type="number" min="0" step="1" value={form.target_price} onChange={set('target_price')} /></label>
          <label className="wide">Note<input maxLength={255} value={form.note} onChange={set('note')} placeholder="Spring break, flexible on dates" /></label>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="solid">Save route</button>
      </form>

      <div className="panel">
        <div className="panelhead">
          <h2>Your routes</h2>
          <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
        </div>
        {loading && <Loading />}
        {error && <ErrorBox error={error} />}
        {!loading && !error && shown.length === 0 && <Empty>Nothing saved yet.</Empty>}
        <ul className="saved">
          {shown.map((r) => (
            <li key={r.route_id} className={r.is_archived ? 'archived' : ''}>
              <div className="dealroute"><span>{r.origin_airport}</span><i>→</i><span>{r.destination_airport}</span></div>
              <div className="dealmeta">
                <b>{[airlineName(r.airline_id) || 'Any airline', r.departure_day_filter, r.stop_type].filter((x) => x && x !== 'Any' && x !== 'Any day').join(' · ') || 'Any airline'}</b>
                {r.note && <small>{r.note}</small>}
              </div>
              <div className="dealprice"><b>{r.target_price != null ? money(r.target_price) : '—'}</b><small>target</small></div>
              <div className="actions">
                <button className="ghost" onClick={act(() => api.updateRoute(r.route_id, { is_archived: r.is_archived ? 0 : 1 }))}>{r.is_archived ? 'Restore' : 'Archive'}</button>
                <button className="ghost danger" onClick={act(() => api.deleteRoute(r.route_id))}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
