import * as mock from './mock.js'

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

async function http(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

const qs = (o) => {
  const p = new URLSearchParams()
  Object.entries(o).forEach(([k, v]) => v && p.set(k, v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

// ---- mock-mode persistence (users + saved routes live in localStorage) ----
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('fw:' + k)) ?? d } catch { return d } },
  set(k, v) { try { localStorage.setItem('fw:' + k, JSON.stringify(v)) } catch { /* ignore */ } },
}

const mockApi = {
  airports: async () => mock.AIRPORTS,
  airlines: async () => mock.AIRLINES.map(({ mult, ...a }) => a),
  airlineFares: async (p) => mock.airlineFares(p),
  deals: async (p) => mock.deals(p),
  windowAnalysis: async (p) => mock.windowAnalysis(p),

  register: async ({ username, email, airport_home }) => {
    const users = store.get('users', [])
    if (users.some((u) => u.email === email)) throw new Error('That email is already registered')
    const user = { user_id: (users.at(-1)?.user_id ?? 0) + 1, username, email, airport_home }
    store.set('users', [...users, user])
    return user
  },
  login: async ({ email }) => {
    const user = store.get('users', []).find((u) => u.email === email)
    if (!user) throw new Error('No account with that email (mock mode: register first)')
    return user
  },
  listRoutes: async (userId) => store.get('routes', []).filter((r) => r.user_id === userId),
  createRoute: async (userId, body) => {
    const all = store.get('routes', [])
    const route = { ...body, route_id: (all.at(-1)?.route_id ?? 0) + 1, user_id: userId, created_at: new Date().toISOString(), is_archived: 0 }
    store.set('routes', [...all, route])
    return route
  },
  updateRoute: async (id, patch) => {
    const all = store.get('routes', []).map((r) => (r.route_id === id ? { ...r, ...patch } : r))
    store.set('routes', all)
    return all.find((r) => r.route_id === id)
  },
  deleteRoute: async (id) => { store.set('routes', store.get('routes', []).filter((r) => r.route_id !== id)); return {} },
}

const realApi = {
  airports: () => http('/airports'),
  airlines: () => http('/airlines'),
  airlineFares: (p) => http('/airline-fares' + qs(p)),
  deals: (p) => http('/deals' + qs(p)),
  windowAnalysis: (p) => http('/booking-windows/analysis' + qs(p)),
  register: (body) => http('/register', { method: 'POST', body }),
  login: (body) => http('/login', { method: 'POST', body }),
  listRoutes: (userId) => http(`/users/${userId}/routes`),
  createRoute: (userId, body) => http(`/users/${userId}/routes`, { method: 'POST', body }),
  updateRoute: (id, body) => http(`/routes/${id}`, { method: 'PATCH', body }),
  deleteRoute: (id) => http(`/routes/${id}`, { method: 'DELETE' }),
}

export const api = USE_MOCK ? mockApi : realApi
export const isMock = USE_MOCK
