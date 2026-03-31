/**
 * useAsync — wraps an async function with loading/error state.
 *
 * Usage:
 *   const { run, loading, error, clear } = useAsync()
 *   try { await run(() => createEmployee(payload)) } catch {}
 */

import { useState, useCallback } from 'react'

export default function useAsync() {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const run = useCallback(async (fn) => {
    setLoading(true)
    setError(null)
    try {
      return await fn()
    } catch (err) {
      const msg = err?.message || 'An unexpected error occurred.'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => setError(null), [])

  return { run, loading, error, clear }
}
