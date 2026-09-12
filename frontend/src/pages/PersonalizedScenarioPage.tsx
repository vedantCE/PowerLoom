import React, { useState } from 'react'
import {
  ArrowLeft, Sparkles, Sun, Wind, Zap, DollarSign, Fuel, Leaf, Clock, Lightbulb, Inbox,
} from 'lucide-react'

interface Props {
  onBack: () => void
}

const MOCK = {
  solar: '4.8 kW',
  wind: '3.2 kW',
  generator: '2.0 kW (backup)',
  cost: '₹ 312 / day',
  diesel: '1.4 L',
  co2: '3.7 kg CO₂',
  duration: '8 hours',
  why: 'Solar and wind are prioritized because they provide cleaner and lower-cost energy. The generator is used as backup when renewable generation is insufficient.',
}

const Metric: React.FC<{ icon: React.ReactNode; label: string; value: string; accent: string }> = ({
  icon, label, value, accent,
}) => (
  <div className={`flex items-center gap-2 rounded-lg border p-2 ${accent}`}>
    <div className="shrink-0">{icon}</div>
    <div className="min-w-0">
      <p className="text-[10px] text-slate-500 leading-none">{label}</p>
      <p className="text-xs font-semibold text-slate-800 truncate mt-0.5">{value}</p>
    </div>
  </div>
)

export const PersonalizedScenarioPage: React.FC<Props> = ({ onBack }) => {
  const [text, setText] = useState('')
  const [showResult, setShowResult] = useState(false)

  return (
    <div className="w-full space-y-3">

      {/* ── Page header ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <div>
          <h1 className="text-sm font-bold text-slate-900">Personalized Energy Scenario</h1>
          <p className="text-[11px] text-slate-500">Describe your requirement in simple words and get a personalized plan.</p>
        </div>
      </div>

      {/* ── Input card ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs space-y-2">
        <label htmlFor="scenario-input" className="block text-xs font-semibold text-slate-800">
          Describe your scenario
        </label>
        <textarea
          id="scenario-input"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Example: I need to supply electricity to my village for 8 hours. I have 5 kW solar, 5 kW wind and a 10 kW generator."
          className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 transition"
        />
        <button
          type="button"
          onClick={() => setShowResult(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Optimize Scenario
        </button>
      </div>

      {/* ── Result card ── */}
      {!showResult ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-6 text-center shadow-xs">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Inbox className="h-5 w-5" />
          </div>
          <h3 className="mt-2 text-xs font-bold text-slate-800">Your personalized energy plan will appear here</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Describe your scenario and click <span className="font-semibold">Optimize Scenario</span>.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-indigo-100 bg-white p-3 shadow-xs space-y-2.5">
          {/* Result header */}
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <Lightbulb className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
            <div>
              <h2 className="text-xs font-bold text-slate-900">Your Personalized Energy Plan</h2>
              <p className="text-[10px] text-slate-500">Recommended Strategy</p>
            </div>
          </div>

          {/* Metrics — 4 columns so all 7 tiles fit in 2 rows */}
          <div className="grid grid-cols-4 gap-2">
            <Metric icon={<Sun className="h-3.5 w-3.5 text-amber-500" />} label="Solar" value={MOCK.solar} accent="border-amber-100 bg-amber-50" />
            <Metric icon={<Wind className="h-3.5 w-3.5 text-sky-500" />} label="Wind" value={MOCK.wind} accent="border-sky-100 bg-sky-50" />
            <Metric icon={<Zap className="h-3.5 w-3.5 text-violet-500" />} label="Generator" value={MOCK.generator} accent="border-violet-100 bg-violet-50" />
            <Metric icon={<DollarSign className="h-3.5 w-3.5 text-emerald-600" />} label="Est. Cost" value={MOCK.cost} accent="border-emerald-100 bg-emerald-50" />
            <Metric icon={<Fuel className="h-3.5 w-3.5 text-rose-500" />} label="Diesel" value={MOCK.diesel} accent="border-rose-100 bg-rose-50" />
            <Metric icon={<Leaf className="h-3.5 w-3.5 text-green-600" />} label="CO₂" value={MOCK.co2} accent="border-green-100 bg-green-50" />
            <Metric icon={<Clock className="h-3.5 w-3.5 text-slate-500" />} label="Duration" value={MOCK.duration} accent="border-slate-100 bg-slate-50" />
          </div>

          {/* Why this plan */}
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
            <p className="text-[10px] font-semibold text-indigo-700">Why this plan?</p>
            <p className="text-[11px] text-indigo-800 leading-relaxed mt-0.5">{MOCK.why}</p>
          </div>

          <p className="text-[10px] text-slate-400 italic">
            Frontend prototype — mock result only. Real optimization will be connected in a future phase.
          </p>
        </div>
      )}
    </div>
  )
}
