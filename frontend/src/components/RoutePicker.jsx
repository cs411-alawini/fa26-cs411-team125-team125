export default function RoutePicker({ airports, origin, destination, onChange, optional = false }) {
  const opts = airports.map((a) => (
    <option key={a.airport_code} value={a.airport_code}>{a.airport_code} · {a.city}</option>
  ))
  const swap = () => onChange({ origin: destination, destination: origin })
  const city = (code) => airports.find((a) => a.airport_code === code)?.city

  return (
    <div className="picker">
      <label className="end">
        <span className="code">{origin || '———'}</span>
        <span className="city">{city(origin) || 'Any origin'}</span>
        <select value={origin} onChange={(e) => onChange({ origin: e.target.value, destination })} aria-label="Origin airport">
          {optional && <option value="">Any origin</option>}
          {opts}
        </select>
      </label>
      <button className="swap" onClick={swap} aria-label="Swap origin and destination" title="Swap">⇄</button>
      <label className="end">
        <span className="code">{destination || '———'}</span>
        <span className="city">{city(destination) || 'Any destination'}</span>
        <select value={destination} onChange={(e) => onChange({ origin, destination: e.target.value })} aria-label="Destination airport">
          {optional && <option value="">Any destination</option>}
          {opts}
        </select>
      </label>
    </div>
  )
}
