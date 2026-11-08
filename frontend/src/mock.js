// Seeded synthetic data shaped like the FareWise schema, so the UI runs with no database.
// Every function mirrors one of the SQL queries in /sql.

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const AIRPORTS = [
  ['JFK', 'John F. Kennedy International', 'New York', 'USA'],
  ['LAX', 'Los Angeles International', 'Los Angeles', 'USA'],
  ['ORD', "O'Hare International", 'Chicago', 'USA'],
  ['ATL', 'Hartsfield-Jackson Atlanta International', 'Atlanta', 'USA'],
  ['SFO', 'San Francisco International', 'San Francisco', 'USA'],
  ['MIA', 'Miami International', 'Miami', 'USA'],
  ['DEN', 'Denver International', 'Denver', 'USA'],
  ['SEA', 'Seattle-Tacoma International', 'Seattle', 'USA'],
  ['BOS', 'Logan International', 'Boston', 'USA'],
  ['DFW', 'Dallas/Fort Worth International', 'Dallas', 'USA'],
  ['CMI', 'University of Illinois Willard', 'Champaign', 'USA'],
  ['LHR', 'Heathrow', 'London', 'UK'],
].map(([airport_code, airport_name, city, country]) => ({ airport_code, airport_name, city, country }))

export const AIRLINES = [
  [1, 'DL', 'Delta Air Lines', 1.05],
  [2, 'AA', 'American Airlines', 1.0],
  [3, 'UA', 'United Airlines', 1.02],
  [4, 'B6', 'JetBlue', 0.9],
  [5, 'WN', 'Southwest', 0.85],
  [6, 'AS', 'Alaska Airlines', 0.95],
].map(([airline_id, airline_code, airline_name, mult]) => ({ airline_id, airline_code, airline_name, mult }))

export const WINDOWS = [
  { window_id: 1, label: 'Last minute', min_days: 0, max_days: 6, bump: 1.38 },
  { window_id: 2, label: 'Short term', min_days: 7, max_days: 20, bump: 1.14 },
  { window_id: 3, label: 'Medium', min_days: 21, max_days: 44, bump: 0.97 },
  { window_id: 4, label: 'Early', min_days: 45, max_days: 89, bump: 0.9 },
  { window_id: 5, label: 'Long term', min_days: 90, max_days: 365, bump: 1.04 },
]

const EMPTY = import.meta.env.VITE_EMPTY === 'true' // no fares: shows empty states
const rand = rng(125)
const BASE = {}
for (const a of AIRPORTS) for (const b of AIRPORTS) if (a !== b) BASE[a.airport_code + b.airport_code] = 90 + rand() * 420

// A subset of routes carries data, so the picker can show a realistic "no data" state.
export const FARES = []
let id = 1
for (let n = 0; n < (EMPTY ? 0 : 6000); n++) {
  const o = AIRPORTS[Math.floor(rand() * 10)]
  let d = AIRPORTS[Math.floor(rand() * 10)]
  if (o === d) d = AIRPORTS[(AIRPORTS.indexOf(d) + 1) % 10]
  const al = AIRLINES[Math.floor(rand() * AIRLINES.length)]
  const lead = Math.floor(rand() ** 1.6 * 200)
  const w = WINDOWS.find((x) => lead >= x.min_days && lead <= x.max_days)
  const stops = rand() < 0.6 ? 0 : rand() < 0.8 ? 1 : 2
  const fare = BASE[o.airport_code + d.airport_code] * al.mult * w.bump * (1 - stops * 0.07) * (0.85 + rand() * 0.3)
  const dep = new Date(Date.UTC(2026, 0, 1) + Math.floor(rand() * 330) * 864e5)
  FARES.push({
    fare_id: id++,
    origin_airport: o.airport_code,
    destination_airport: d.airport_code,
    airline_id: al.airline_id,
    departure_date: dep.toISOString().slice(0, 10),
    lead,
    fare: Math.round(fare * 100) / 100,
    num_stops: stops,
    duration_min: 120 + Math.floor(rand() * 300),
  })
}

const airlineName = (id) => AIRLINES.find((a) => a.airline_id === id).airline_name
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length
const match = (f, o, d) => (!o || f.origin_airport === o) && (!d || f.destination_airport === d)
const r2 = (x) => Math.round(x * 100) / 100

// Query 1: airline fare comparison
export function airlineFares({ origin, destination, limit = 15 } = {}) {
  const groups = new Map()
  for (const f of FARES) {
    if (!match(f, origin, destination)) continue
    const k = `${f.origin_airport}|${f.destination_airport}|${f.airline_id}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(f.fare)
  }
  return [...groups]
    .filter(([, v]) => v.length >= 5)
    .map(([k, v]) => {
      const [o, d, a] = k.split('|')
      return { origin_airport: o, destination_airport: d, airline_name: airlineName(+a), avg_price: r2(avg(v)), min_price: Math.min(...v), total_flights: v.length }
    })
    .sort((a, b) => a.avg_price - b.avg_price)
    .slice(0, limit)
}

// Query 2: fares cheaper than every competitor's average on the same route
export function deals({ origin, destination, limit = 15 } = {}) {
  const byRoute = new Map()
  for (const f of FARES) {
    const k = f.origin_airport + f.destination_airport
    if (!byRoute.has(k)) byRoute.set(k, [])
    byRoute.get(k).push(f)
  }
  const out = []
  for (const rows of byRoute.values()) {
    if (!match(rows[0], origin, destination)) continue
    const routeAvg = avg(rows.map((r) => r.fare))
    const perAirline = new Map()
    for (const r of rows) {
      if (!perAirline.has(r.airline_id)) perAirline.set(r.airline_id, [])
      perAirline.get(r.airline_id).push(r.fare)
    }
    const avgs = [...perAirline].map(([id, v]) => [id, avg(v)])
    for (const r of rows) {
      const rivals = avgs.filter(([id]) => id !== r.airline_id).map(([, a]) => a)
      if (rivals.every((a) => r.fare < a)) {
        out.push({
          origin_airport: r.origin_airport, destination_airport: r.destination_airport,
          airline_name: airlineName(r.airline_id), fare: r.fare, departure_date: r.departure_date,
          avg_price: r2(routeAvg), savings: r2(routeAvg - r.fare),
        })
      }
    }
  }
  return out.sort((a, b) => a.fare - b.fare).slice(0, limit)
}

// Query 3: booking window analysis for one route
export function windowAnalysis({ origin, destination }) {
  const rows = FARES.filter((f) => f.origin_airport === origin && f.destination_airport === destination)
  return WINDOWS.map((w) => {
    const v = rows.filter((f) => f.lead >= w.min_days && f.lead <= w.max_days).map((f) => f.fare)
    return { label: w.label, min_days: w.min_days, max_days: w.max_days, avg_fare: v.length ? r2(avg(v)) : null, total_fares: v.length }
  }).filter((w) => w.total_fares >= 5)
}
