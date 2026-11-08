import { useEffect, useState } from 'react'

// Tiny fetch hook: re-runs when deps change, ignores stale responses.
export default function useQuery(fn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: '' })
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: '' }))
    fn().then(
      (data) => live && setState({ data, loading: false, error: '' }),
      (e) => live && setState({ data: null, loading: false, error: e.message }),
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}
