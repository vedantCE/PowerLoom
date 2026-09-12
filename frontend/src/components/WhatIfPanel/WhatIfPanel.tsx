import React from 'react'
import { SlidersHorizontal, CloudRain, Sun, Fuel, BatteryCharging, Battery, FlaskConical, ArrowRight } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n/strings'
import { ScenarioChips } from './ScenarioChips'
import { SliderControl } from './SliderControl'
import { GeneratorToggle } from './GeneratorToggle'
import { ImpactSummary } from './ImpactSummary'
import { CardHeader } from '../CardHeader'

const IS_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

interface WhatIfPanelProps {
  onNavigateToScenario?: () => void
}

export const WhatIfPanel: React.FC<WhatIfPanelProps> = ({ onNavigateToScenario }) => {
  const { t } = useT()
  const overrides = useAppStore((s) => s.overrides)
  const currentPreset = useAppStore((s) => s.currentPreset)
  const setOverride = useAppStore((s) => s.setOverride)

  const defaultDieselPrice = currentPreset?.diesel.fuel_price_inr_per_l ?? 90
  const defaultInitialSocPct = Math.round((currentPreset?.battery.soc_initial ?? 0.5) * 100)

  const cloudValue = overrides.cloud_cover_pct ?? undefined
  const dieselPriceValue = overrides.diesel_price_inr_per_l ?? defaultDieselPrice
  const extraSolarValue = overrides.extra_solar_kw ?? 0
  const extraBatteryValue = overrides.extra_battery_kwh ?? 0
  const initialSocPctValue =
    overrides.initial_soc !== undefined && overrides.initial_soc !== null
      ? Math.round(overrides.initial_soc * 100)
      : defaultInitialSocPct
  const generatorAvailable = overrides.diesel_available !== false

  const CloudIcon = (cloudValue ?? 0) >= 50 ? CloudRain : Sun

  return (
    <aside className="w-full lg:w-80 shrink-0 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <CardHeader
          icon={SlidersHorizontal}
          title={t('whatIfTitle')}
          tooltip={t('whatIfTooltip')}
          right={
            onNavigateToScenario ? (
              <button
                type="button"
                onClick={onNavigateToScenario}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
              >
                More <ArrowRight className="h-3 w-3" />
              </button>
            ) : undefined
          }
        />

        <p className="mt-3 text-xs leading-relaxed text-slate-600">{t('whatIfDescription')}</p>

        {/* Quick scenario chips */}
        <div className="mt-4">
          <ScenarioChips />
        </div>

        {/* Controls */}
        <div className="mt-5 space-y-4">
          <SliderControl
            id="whatif-cloud-cover"
            icon={CloudIcon}
            iconClassName="text-sky-500"
            accentClassName="bg-sky-100 text-sky-500 focus-visible:ring-sky-500"
            label={t('cloudCoverParam')}
            value={cloudValue}
            defaultValue={undefined}
            min={0}
            max={100}
            step={10}
            specialLabel={t('whatIfForecastLabel')}
            formatValue={(v) => `${v}%`}
            changedLabel={t('whatIfChangedLabel')}
            onChange={(v) => setOverride('cloud_cover_pct', v)}
          />

          <SliderControl
            id="whatif-diesel-price"
            icon={Fuel}
            iconClassName="text-rose-500"
            accentClassName="bg-rose-100 text-rose-500 focus-visible:ring-rose-500"
            label={t('dieselPriceParam')}
            value={dieselPriceValue}
            defaultValue={defaultDieselPrice}
            min={70}
            max={140}
            step={5}
            formatValue={(v) => `₹${v}/L`}
            changedLabel={t('whatIfChangedLabel')}
            onChange={(v) =>
              setOverride('diesel_price_inr_per_l', v === defaultDieselPrice ? undefined : v)
            }
          />

          <SliderControl
            id="whatif-extra-solar"
            icon={Sun}
            iconClassName="text-amber-500"
            accentClassName="bg-amber-100 text-amber-500 focus-visible:ring-amber-500"
            label={t('extraSolarParam')}
            value={extraSolarValue}
            defaultValue={0}
            min={0}
            max={30}
            step={5}
            formatValue={(v) => `+${v} kW`}
            changedLabel={t('whatIfChangedLabel')}
            onChange={(v) => setOverride('extra_solar_kw', v === 0 ? undefined : v)}
          />

          <SliderControl
            id="whatif-extra-battery"
            icon={BatteryCharging}
            iconClassName="text-emerald-500"
            accentClassName="bg-emerald-100 text-emerald-500 focus-visible:ring-emerald-500"
            label={t('extraBatteryParam')}
            value={extraBatteryValue}
            defaultValue={0}
            min={0}
            max={100}
            step={10}
            formatValue={(v) => `+${v} kWh`}
            changedLabel={t('whatIfChangedLabel')}
            onChange={(v) => setOverride('extra_battery_kwh', v === 0 ? undefined : v)}
          />

          <SliderControl
            id="whatif-initial-soc"
            icon={Battery}
            iconClassName="text-emerald-600"
            accentClassName="bg-emerald-100 text-emerald-600 focus-visible:ring-emerald-600"
            label={t('initialBatteryParam')}
            value={initialSocPctValue}
            defaultValue={defaultInitialSocPct}
            min={20}
            max={100}
            step={5}
            formatValue={(v) => `${v}%`}
            changedLabel={t('whatIfChangedLabel')}
            onChange={(v) =>
              setOverride(
                'initial_soc',
                v === undefined || v === defaultInitialSocPct ? undefined : v / 100
              )
            }
          />

          <GeneratorToggle
            label={t('dieselAvailableParam')}
            onLabel={t('generatorOnLabel')}
            offLabel={t('generatorOffLabel')}
            changedLabel={t('whatIfChangedLabel')}
            checked={generatorAvailable}
            onChange={(checked) => setOverride('diesel_available', checked ? undefined : false)}
          />
        </div>
      </div>

      <ImpactSummary />

      {IS_MOCK && (
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
          <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t('mockSimulationNote')}</span>
        </div>
      )}
    </aside>
  )
}
