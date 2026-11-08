import { useState } from 'react'
import { api } from '../api.js'
import RoutePicker from '../components/RoutePicker.jsx'
import useQuery from '../components/useQuery.js'
import { Loading, Empty, ErrorBox, money } from '../components/State.jsx'

// Query 2: fares that undercut every competing airline's average on the same route.
export default function Deals({ airports, onSave }) {
  const [route, setRoute] = useState({ origin: '', destination: '' })
  const { data, loading, error } = useQuery(() => api.deals({ ...route, limit: 15 }), [route.origin, route.destination])

  return (
    <section>
      <RoutePicker airports={airports} {...route} onChange={setRoute} optional />
      <div className="panel">
        <h2>Fares beating every competitor</h2>
        <p className="sub">Each fare below is lower than the average fare of every other airline on the same route.</p>
        {loading && <Loading />}
        {error && <ErrorBox error={error} />}
        {!loading && !error && !data?.length && <Empty>No standout fares for those airports.</Empty>}
        <ul className="deals">
          {(data || []).map((d, i) => (
            <li key={i}>
              <div className="dealroute">
                <span>{d.origin_airport}</span><i>→</i><span>{d.destination_airport}</span>
              </div>
              <div className="dealmeta">
                <b>{d.airline_name}</b>
                <small>departs {String(d.departure_date).slice(0, 10)} · route average {money(d.avg_price)}</small>
              </div>
              <div className="dealprice">
                <b>{money(d.fare)}</b>
                <small className="save">save {money(d.savings)}</small>
              </div>
              <button className="ghost" onClick={() => onSave({ origin_airport: d.origin_airport, destination_airport: d.destination_airport, target_price: Math.round(d.fare) })}>Track</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
