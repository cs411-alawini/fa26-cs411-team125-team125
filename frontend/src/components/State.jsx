export function Loading() { return <p className="note">Loading…</p> }
export function Empty({ children }) { return <p className="note">{children}</p> }
export function ErrorBox({ error }) { return <p className="err" role="alert">{error}</p> }
export const money = (n) => (n == null ? '—' : `$${Number(n).toFixed(0)}`)
