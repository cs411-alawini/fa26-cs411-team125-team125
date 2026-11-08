import { useState } from 'react'
import { api } from '../api.js'

export default function AuthPanel({ airports, onDone, onClose }) {
  const [mode, setMode] = useState('login')
  const [f, setF] = useState({ username: '', email: '', password: '', airport_home: 'JFK' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const u = mode === 'login' ? await api.login(f) : await api.register(f)
      onDone(u)
    } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{mode === 'login' ? 'Sign in' : 'Create an account'}</h2>
        {mode === 'register' && (
          <label>Username<input required value={f.username} onChange={set('username')} autoComplete="username" /></label>
        )}
        <label>Email<input required type="email" value={f.email} onChange={set('email')} autoComplete="email" /></label>
        <label>Password<input required type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {mode === 'register' && (
          <label>Home airport
            <select value={f.airport_home} onChange={set('airport_home')}>
              {airports.map((a) => <option key={a.airport_code} value={a.airport_code}>{a.airport_code} · {a.city}</option>)}
            </select>
          </label>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row">
          <button className="solid" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
          <button type="button" className="ghost" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr('') }}>
            {mode === 'login' ? 'Need an account?' : 'Have an account?'}
          </button>
        </div>
      </form>
    </div>
  )
}
