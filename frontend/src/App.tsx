import { useEffect, useState } from 'react'
import { apiClient } from './api/client'
import type { HealthResponse } from './types/health'

type ConnectionState = 'checking' | 'online' | 'offline'

function App() {
  const [connection, setConnection] = useState<ConnectionState>('checking')
  const [health, setHealth] = useState<HealthResponse | null>(null)

  useEffect(() => {
    let cancelled = false

    apiClient
      .get<HealthResponse>('/health')
      .then((response) => {
        if (cancelled) return
        setHealth(response.data)
        setConnection('online')
      })
      .catch(() => {
        if (cancelled) return
        setConnection('offline')
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 px-4 text-center text-slate-100">
      <div className="space-y-2">
        <h1 className="text-5xl font-semibold tracking-tight">Powerloom</h1>
        <p className="text-lg text-slate-400">
          Forecast-driven energy mix optimizer for off-grid microgrids
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium ${
            connection === 'online'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
              : connection === 'offline'
                ? 'border-red-500/40 bg-red-500/10 text-red-400'
                : 'border-slate-600/40 bg-slate-600/10 text-slate-400'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              connection === 'online'
                ? 'bg-emerald-400'
                : connection === 'offline'
                  ? 'bg-red-400'
                  : 'bg-slate-400'
            }`}
          />
          {connection === 'online' && 'Backend connected'}
          {connection === 'offline' && 'Backend offline'}
          {connection === 'checking' && 'Checking backend...'}
        </span>

        {connection === 'online' && health && (
          <span className="text-xs text-slate-500">
            solver: {health.solver_available ? 'available' : 'unavailable'}
          </span>
        )}
      </div>
    </div>
  )
}

export default App
