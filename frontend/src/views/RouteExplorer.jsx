import { useState } from 'react'
import { api } from '../api.js'
import RoutePicker from '../components/RoutePicker.jsx'
import useQuery from '../components/useQuery.js'
import { Loading, Empty, ErrorBox, money } from '../components/State.jsx'

// Query 3 (booking window analysis) plus Query 1 filtered to the chosen route.
export default function RouteExplorer({ airports, onSave }) {
  const [route, setRoute] = useState({ origin: 'JFK', destination: 'LAX' })
  const { origin, destination } = route
  const same = origin === destination

  const win = useQuery(() => (same ? Promise.resolve([]) : api.windowAnalysis(route)), [origin, destination])
  const air = useQuery(() => (same ? Promise.resolve([]) : api.airlineFares({ ...route, limit: 10 })), [origin, destination])

  const rows = win.data || []
  const priced = rows.filter((r) => r.avg_fare != null)
  const best = priced.length ? priced.reduce((a, b) => (b.avg_fare < a.avg_fare ? b : a)) : null
  const worst = priced.length ? priced.reduce((a, b) => (b.avg_fare > a.avg_fare ? b : a)) : null
  const max = worst?.avg_fare || 1

  return (
    <section>
      <RoutePicker airports={airports} {...route} onChange={setRoute} />
      {same && <Empty>Pick two different airports.</Empty>}

      {!same && (
        <>
          <div className="panel">
            <div className="panelhead">
              <h2>When to book</h2>
              <button className="ghost" onClick={() => onSave({ origin_airport: origin, destination_airport: destination, window_label: best?.label })}>Save this route</button>
            </div>
            {win.loading && <Loading />}
            {win.error && <ErrorBox error={win.error} />}
            {!win.loading && !win.error && rows.length === 0 && <Empty>Not enough fare history for this route yet (a window needs at least 5 observations).</Empty>}
            {best && (
              <p className="lede">
                Fares on this route average <b>{money(best.avg_fare)}</b> when booked <b>{best.label.toLowerCase()}</b> ({best.min_days}–{best.max_days} days out),
                {' '}{money(worst.avg_fare - best.avg_fare)} less than the priciest window.
              </p>
            )}
            <ol className="bars">
              {rows.map((r) => (
                <li key={r.label} className={r === best ? 'bar best' : 'bar'}>
                  <span className="lbl">{r.label}<small>{r.min_days}–{r.max_days} days out</small></span>
                  <span className="track"><span className="fill" style={{ width: `${(r.avg_fare / max) * 100}%` }} /></span>
                  <span className="val">{money(r.avg_fare)}<small>{r.total_fares} fares</small></span>
                </li>
              ))}
            </ol>
          </div>

          <div className="panel">
            <h2>Airlines on this route</h2>
            {air.loading && <Loading />}
            {air.error && <ErrorBox error={air.error} />}
            {!air.loading && !air.error && (air.data?.length === 0
              ? <Empty>No airline has 5+ observations on this route.</Empty>
              : <AirlineTable rows={air.data || []} hideRoute />)}
          </div>
        </>
      )}
    </section>
  )
}

export function AirlineTable({ rows, hideRoute }) {
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>{!hideRoute && <th>Route</th>}<th>Airline</th><th className="n">Avg fare</th><th className="n">Lowest</th><th className="n">Fares seen</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {!hideRoute && <td className="route">{r.origin_airport} → {r.destination_airport}</td>}
              <td>{r.airline_name}</td>
              <td className="n">{money(r.avg_price)}</td>
              <td className="n">{money(r.min_price)}</td>
              <td className="n">{r.total_flights}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
