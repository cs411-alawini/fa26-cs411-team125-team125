import { useState } from 'react'
import { api } from '../api.js'
import RoutePicker from '../components/RoutePicker.jsx'
import useQuery from '../components/useQuery.js'
import { Loading, Empty, ErrorBox } from '../components/State.jsx'
import { AirlineTable } from './RouteExplorer.jsx'

// Query 1: airline fare comparison, optionally narrowed to an origin and/or destination.
export default function AirlineBoard({ airports }) {
  const [route, setRoute] = useState({ origin: '', destination: '' })
  const { data, loading, error } = useQuery(() => api.airlineFares({ ...route, limit: 15 }), [route.origin, route.destination])

  return (
    <section>
      <RoutePicker airports={airports} {...route} onChange={setRoute} optional />
      <div className="panel">
        <h2>Cheapest airline and route pairs</h2>
        <p className="sub">Ranked by average fare. Only pairs with at least 5 fares are listed.</p>
        {loading && <Loading />}
        {error && <ErrorBox error={error} />}
        {!loading && !error && (data?.length ? <AirlineTable rows={data} /> : <Empty>No airline/route pair matches those airports.</Empty>)}
      </div>
    </section>
  )
}
