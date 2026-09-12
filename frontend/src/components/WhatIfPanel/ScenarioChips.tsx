import React from 'react'
import { CloudRain, Fuel, Sun, BatteryCharging, AlertTriangle, RotateCcw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import type { WhatIfOverrides } from '../../types/api'
import type { StringKey } from '../../i18n/strings'

interface Scenario {
  id: string
  icon: LucideIcon
  labelKey: StringKey
  patch: WhatIfOverrides
}

const SCENARIOS: Scenario[] = [
  { id: 'cloudy', icon: CloudRain, labelKey: 'scenarioCloudy', patch: { cloud_cover_pct: 90 } },
  { id: 'dieselHigh', icon: Fuel, labelKey: 'scenarioDieselHigh', patch: { diesel_price_inr_per_l: 120 } },
  { id: 'extraSolar', icon: Sun, labelKey: 'scenarioExtraSolar', patch: { extra_solar_kw: 10 } },
  {
    id: 'biggerBattery',
    icon: BatteryCharging,
    labelKey: 'scenarioBiggerBattery',
    patch: { extra_battery_kwh: 50 },
  },
  {
    id: 'generatorFailure',
    icon: AlertTriangle,
    labelKey: 'scenarioGeneratorFailure',
    patch: { diesel_available: false },
  },
]

export const ScenarioChips: React.FC = () => {
  const { t } = useT()
  const overrides = useAppStore((s) => s.overrides)
  const activeScenarioId = useAppStore((s) => s.activeScenarioId)
  const applyScenario = useAppStore((s) => s.applyScenario)
  const resetOverrides = useAppStore((s) => s.resetOverrides)

  const isDefault = Object.keys(overrides).length === 0

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('scenarioChipsTitle')}>
      {SCENARIOS.map((scenario) => {
        const Icon = scenario.icon
        const isActive = activeScenarioId === scenario.id
        return (
          <button
            key={scenario.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => applyScenario(scenario.id, scenario.patch)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${
              isActive
                ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(scenario.labelKey)}
          </button>
        )
      })}
      <button
        type="button"
        aria-pressed={isDefault}
        onClick={() => resetOverrides()}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${
          isDefault
            ? 'border-slate-400 bg-slate-200 text-slate-800'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
        }`}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {t('scenarioReset')}
      </button>
    </div>
  )
}
