import React, { useState } from 'react'
import {
  ArrowLeft, Sparkles, Sun, Wind, Zap, DollarSign, Fuel, Leaf, Clock, Lightbulb, Inbox,
} from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, Mic, MicOff, Send, Square, Volume2, VolumeX, Inbox, Sparkles,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n/strings'
import { speak, voiceQuery } from '../api/client'
import { streamVoiceQuery } from '../utils/voiceStream'
import type { Language } from '../types/api'
import type { VoiceQueryRequest } from '../types/voice'

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
interface VoiceExchange {
  id: string
  query: string
  answer: string
  intent: string
  confidence: 'high' | 'low'
  validated: boolean
}

const MAX_HISTORY = 5
const MUTE_STORAGE_KEY = 'powerloom.voiceMuted'

const LANG_LOCALE: Record<Language, string> = {
  en: 'en-IN',
  gu: 'gu-IN',
  hi: 'hi-IN',
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function saveMuted(value: boolean): void {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, String(value))
  } catch {
    // Private browsing / storage disabled — preference just won't persist.
  }
}

// Fallback voice — used whenever Sarvam TTS (playAnswer, below) is
// unavailable: no SARVAM_API_KEY configured, network failure, etc. Answer
// text is always shown regardless of which voice (or neither) succeeds.
function speakWithBrowserTTS(text: string, language: Language): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  try {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const locale = LANG_LOCALE[language]
    utterance.lang = locale
    const voices = window.speechSynthesis.getVoices()
    const match =
      voices.find((v) => v.lang === locale) ?? voices.find((v) => v.lang.startsWith(language))
    if (match) utterance.voice = match
    window.speechSynthesis.speak(utterance)
  } catch {
    // Speech synthesis unavailable — the answer is always shown as text too.
  }
}

function getSpeechRecognitionCtor(): (new () => any) | null {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const PersonalizedScenarioPage: React.FC<Props> = ({ onBack }) => {
  const { t } = useT()
  const result = useAppStore((s) => s.result)
  const language = useAppStore((s) => s.language)
  const selectedHour = useAppStore((s) => s.selectedHour)
  const selectHour = useAppStore((s) => s.selectHour)

  const [text, setText] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamingIntent, setStreamingIntent] = useState<{ intent: string; confidence: 'high' | 'low' } | null>(null)
  const [correctedNote, setCorrectedNote] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<VoiceExchange[]>([])

  const [micSupported] = useState(() => !!getSpeechRecognitionCtor())
  const [micDenied, setMicDenied] = useState(false)
  const [listening, setListening] = useState(false)
  const [autoSubmit, setAutoSubmit] = useState(true)
  const [muted, setMuted] = useState(loadMuted)

  const abortControllerRef = useRef<AbortController | null>(null)
  const recognitionRef = useRef<any>(null)
  const autoSubmitRef = useRef(autoSubmit)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    autoSubmitRef.current = autoSubmit
  }, [autoSubmit])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
      recognitionRef.current?.stop()
      audioRef.current?.pause()
    }
  }, [])

  function stopSpeaking() {
    audioRef.current?.pause()
    try {
      window.speechSynthesis?.cancel()
    } catch {
      // ignore
    }
  }

  // Sarvam AI Bulbul TTS first (better Indian-language voice quality, see
  // CLAUDE.md "Voice and streaming"); falls back to the browser's own
  // speechSynthesis whenever Sarvam is unavailable (no API key, network
  // error, etc). Either way the answer is already shown as text.
  async function playAnswer(text: string, language: Language) {
    try {
      const blob = await speak({ text, language })
      const url = URL.createObjectURL(blob)
      audioRef.current?.pause()
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => URL.revokeObjectURL(url)
      audio.onerror = () => URL.revokeObjectURL(url)
      await audio.play()
    } catch {
      speakWithBrowserTTS(text, language)
    }
  }

  async function handleAsk(queryOverride?: string) {
    const query = (queryOverride ?? text).trim()
    if (!query || !result || isBusy) return

    setError(null)
    setCorrectedNote(false)
    setStreamingText('')
    setStreamingIntent(null)
    setIsBusy(true)
    setIsStreaming(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    const payload: VoiceQueryRequest = {
      run_id: result.run_id,
      query,
      language,
      current_hour_index: selectedHour ?? undefined,
    }

    let finalAnswer = ''
    let finalIntent = 'UNKNOWN'
    let finalConfidence: 'high' | 'low' = 'low'
    let finalValidated = true
    let streamOk = false
    let aborted = false

    try {
      streamOk = await streamVoiceQuery(payload, controller.signal, {
        onIntent: (e) => {
          finalIntent = e.intent
          finalConfidence = e.confidence
          setStreamingIntent({ intent: e.intent, confidence: e.confidence })
          if (e.hour_index !== null && e.hour_index !== undefined) {
            selectHour(e.hour_index)
          }
        },
        onToken: (e) => {
          finalAnswer += e.text
          setStreamingText((prev) => prev + e.text)
        },
        onDone: (e) => {
          finalAnswer = e.answer
          finalValidated = e.validated
        },
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        aborted = true
      } else {
        streamOk = false
      }
    }

    if (aborted) {
      setIsBusy(false)
      setIsStreaming(false)
      return
    }

    if (!streamOk) {
      try {
        const res = await voiceQuery(payload)
        finalAnswer = res.answer
        finalIntent = res.intent
        finalConfidence = res.confidence
        finalValidated = true
        setStreamingIntent({ intent: res.intent, confidence: res.confidence })
        if (res.hour_index !== null && res.hour_index !== undefined) {
          selectHour(res.hour_index)
        }
      } catch (err) {
        setIsBusy(false)
        setIsStreaming(false)
        setError(err instanceof Error ? err.message : 'Could not get an answer. Please try again.')
        return
      }
    }

    if (!finalValidated) {
      setCorrectedNote(true)
    }
    setStreamingText(finalAnswer)
    setIsStreaming(false)
    setIsBusy(false)
    setText('')

    setHistory((prev) => [
      { id: newId(), query, answer: finalAnswer, intent: finalIntent, confidence: finalConfidence, validated: finalValidated },
      ...prev,
    ].slice(0, MAX_HISTORY))

    if (!muted) {
      void playAnswer(finalAnswer, language)
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort()
    stopSpeaking()
    setIsStreaming(false)
    setIsBusy(false)
  }

  function startListening() {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return

    const recognition = new Ctor()
    recognition.lang = LANG_LOCALE[language]
    recognition.interimResults = true
    recognition.continuous = false

    recognition.onresult = (event: any) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += transcript
        } else {
          interim += transcript
        }
      }
      if (final) {
        setText(final)
        setListening(false)
        if (autoSubmitRef.current) {
          void handleAsk(final)
        }
      } else if (interim) {
        setText(interim)
      }
    }

    recognition.onerror = (event: any) => {
      setListening(false)
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setMicDenied(true)
      }
    }

    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    setMicDenied(false)
    setListening(true)
    try {
      recognition.start()
    } catch {
      setListening(false)
    }
  }

  function stopListening() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  function toggleMuted() {
    setMuted((prev) => {
      const next = !prev
      saveMuted(next)
      if (next) {
        stopSpeaking()
      }
      return next
    })
  }

  const examples = [t('voiceExample1'), t('voiceExample2'), t('voiceExample3')]
  const displayedAnswer = streamingText

  return (
    <div className="w-full space-y-2">

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
          <p className="text-[11px] text-slate-500">{t('voiceScenarioSubtitle')}</p>
        </div>
      </div>

      {!result ? (
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
          <p className="mt-2 text-[11px] text-slate-500 px-4">{t('voiceNoRunYet')}</p>
        </div>
      ) : (
        <>
          {/* ── Input card ── */}
          <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="scenario-input" className="block text-xs font-semibold text-slate-800">
                {listening ? (
                  <span className="inline-flex items-center gap-1.5 text-indigo-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    {t('voiceListening')}
                  </span>
                ) : (
                  'Describe your scenario'
                )}
              </label>
              <label className="inline-flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSubmit}
                  onChange={(e) => setAutoSubmit(e.target.checked)}
                  className="h-3 w-3 accent-indigo-600"
                />
                {t('voiceAutoSubmitLabel')}
              </label>
            </div>

            <div className="flex items-start gap-2">
              <textarea
                id="scenario-input"
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleAsk()
                  }
                }}
                placeholder={t('voiceInputPlaceholder')}
                className="flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 transition"
              />
              {micSupported && !micDenied && (
                <button
                  type="button"
                  onClick={listening ? stopListening : startListening}
                  title={listening ? t('voiceMicStop') : t('voiceMicStart')}
                  className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                    listening
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-600 animate-pulse'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
            </div>

            {!micSupported && (
              <p className="text-[10px] text-slate-400">{t('voiceMicUnsupported')}</p>
            )}
            {micSupported && micDenied && (
              <p className="text-[10px] text-slate-400">{t('voiceMicDenied')}</p>
            )}

            <div className="flex items-center gap-2">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-700 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 active:scale-[0.98] transition"
                >
                  <Square className="h-3.5 w-3.5" />
                  {t('voiceStopButton')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleAsk()}
                  disabled={!text.trim() || isBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="h-3.5 w-3.5" />
                  {t('voiceAskButton')}
                </button>
              )}

              <button
                type="button"
                onClick={toggleMuted}
                title={muted ? t('voiceUnmuteLabel') : t('voiceMuteLabel')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition"
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Example chips — fixed grid so the card's height stays predictable
                instead of the chips reflowing to a wide single line. */}
            <div className="pt-0.5">
              <p className="text-[10px] text-slate-400 mb-1">{t('voiceExamplesTitle')}:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {examples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => void handleAsk(ex)}
                    className="w-full truncate rounded-full border border-indigo-100 bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100 transition"
                    title={ex}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              {error}
            </div>
          )}

          {/* ── Answer card ── */}
          {(isBusy || displayedAnswer) && (
            <div className="rounded-xl border border-indigo-100 bg-white p-3 shadow-xs space-y-2">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xs font-bold text-slate-900">Answer</h2>
                  {streamingIntent && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600">
                      {streamingIntent.intent}
                      {streamingIntent.confidence === 'low' && (
                        <span className="text-slate-400">· {t('voiceConfidenceLow')}</span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-[12px] text-slate-800 leading-relaxed">
                {displayedAnswer || (isBusy ? t('voiceThinking') : '')}
                {isStreaming && <span className="inline-block w-1 h-3 ml-0.5 bg-indigo-500 animate-pulse align-middle" />}
              </p>

              {correctedNote && (
                <p className="text-[10px] text-amber-600 italic">{t('voiceCorrectedNote')}</p>
              )}
            </div>
          )}

          {/* ── History ── */}
          {history.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs space-y-2">
              <p className="text-[10px] font-semibold text-slate-600">{t('voiceHistoryTitle')}</p>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5">
                    <p className="text-[10.5px] font-semibold text-slate-700">{h.query}</p>
                    <p className="text-[10.5px] text-slate-600 mt-0.5">{h.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
