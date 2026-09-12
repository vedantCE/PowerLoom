import React, { useState, useRef, useEffect } from 'react'
import { Bot, Sparkles, X, Send, Loader2, RefreshCw, MessageSquare } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { chat } from '../../api/client'
import type { ChatMessage } from '../../types/api'

const SUGGESTED_QUESTIONS = [
  'Why is diesel off right now?',
  'What is the current battery SOC?',
  'How much did we save?',
  'Explain the current optimization.',
]

export const Chatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const { selectedVillageId, result, horizon, overrides } = useAppStore()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (isOpen) {
      scrollToBottom()
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, messages, isLoading])

  const handleSend = async (questionText?: string) => {
    const text = (questionText || input).trim()
    if (!text || isLoading) return

    setInput('')
    setError(null)

    const userMessage: ChatMessage = { role: 'user', content: text }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setIsLoading(true)

    // Build conversation history (send last 10 turns max)
    const history = updatedMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-10)

    try {
      const response = await chat({
        message: text,
        village_id: selectedVillageId || 'dang_village',
        run_id: result?.run_id || null,
        horizon_hours: horizon,
        overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
        history,
      })

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.message,
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to Powerloom AI service.'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 font-sans select-none">
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white font-medium text-xs rounded-full shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/50 hover:scale-105 active:scale-95 transition-all duration-200 border border-indigo-400/30"
          aria-label="Open Powerloom AI Assistant"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <Bot className="w-4 h-4 text-indigo-100 group-hover:rotate-12 transition-transform" />
          <span className="tracking-wide">Powerloom AI</span>
        </button>
      )}

      {/* Compact Chat Panel */}
      {isOpen && (
        <div className="w-[350px] sm:w-[380px] h-[520px] max-h-[82vh] flex flex-col bg-slate-950/95 backdrop-blur-xl border border-indigo-500/30 rounded-2xl shadow-2xl shadow-indigo-950/80 overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 px-4 py-3 border-b border-indigo-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-600/30 border border-indigo-400/30 text-indigo-300">
                <Sparkles className="w-4 h-4 text-indigo-300" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                  Powerloom AI
                </h3>
                <p className="text-[10px] text-slate-400">Your energy optimization assistant</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
              aria-label="Close Assistant"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Message Body */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 text-xs text-slate-200 scrollbar-thin scrollbar-thumb-indigo-900/50 scrollbar-track-transparent">
            {/* Welcome Screen when Empty */}
            {messages.length === 0 && (
              <div className="space-y-4 py-2">
                <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-slate-300 leading-relaxed text-xs">
                  <p className="font-medium text-indigo-200 mb-1 flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-indigo-400" /> Hello!
                  </p>
                  Hi! I'm your Powerloom AI assistant. Ask me about your microgrid, optimization, battery, diesel, costs, emissions, or dispatch.
                </div>

                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider mb-2 px-1">
                    Suggested Questions
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {SUGGESTED_QUESTIONS.map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => void handleSend(q)}
                        className="w-full text-left px-3 py-2 rounded-xl bg-slate-900/80 hover:bg-indigo-950/80 border border-indigo-500/20 hover:border-indigo-400/40 text-slate-300 hover:text-indigo-200 transition-all text-xs flex items-center justify-between group"
                      >
                        <span>{q}</span>
                        <MessageSquare className="w-3 h-3 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Chat Message List */}
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`px-3.5 py-2.5 rounded-2xl max-w-[88%] text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-xs shadow-md shadow-indigo-950/50'
                      : 'bg-slate-900/90 border border-indigo-500/20 text-slate-200 rounded-tl-xs shadow-md shadow-slate-950/50'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Typing / Loading Indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 text-indigo-300 bg-slate-900/80 border border-indigo-500/20 px-3 py-2 rounded-2xl rounded-tl-xs max-w-[70%]">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span className="text-xs text-slate-400 animate-pulse">Thinking...</span>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2">
                <div className="flex-1">{error}</div>
                <button
                  onClick={() => setError(null)}
                  className="text-rose-400 hover:text-rose-200"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input Form */}
          <div className="p-2.5 border-t border-indigo-500/20 bg-slate-950/90">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Powerloom AI..."
                disabled={isLoading}
                className="flex-1 bg-slate-900 border border-indigo-500/25 focus:border-indigo-500 text-slate-100 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 placeholder:text-slate-500 disabled:opacity-50"
              />
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || isLoading}
                className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center"
                aria-label="Send Message"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
