import { useState, useRef, useEffect, useCallback } from 'react'
import { sendChatMessage } from './api.js'

const STAGE_ICONS = {
  parsing: '⏳',
  parsed: '🎯',
  cache_hit: '⚡',
  generating: '🧬',
  scoring: '📊',
  interpreting: '🔬',
}

const WELCOME =
  'Welcome to CassetteAI!\n\n' +
  'Describe your gene therapy design goal and I will:\n' +
  '  🧬  Generate 200 candidate regulatory elements\n' +
  '  📊  Score tissue specificity with Sei\n' +
  '  🔬  Rank and interpret results with Claude\n' +
  '  🧬  Compose an AAV cassette diagram\n\n' +
  'Try: "Design a liver-specific enhancer for AAV delivery"'

function PipelineStatus({ stages, done, error }) {
  return (
    <div
      className="rounded-xl p-3 space-y-1.5"
      style={{ background: '#0d1929', border: '1px solid #1e2d40', fontSize: '15px' }}
    >
      {stages.map((s, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="shrink-0">{STAGE_ICONS[s.stage] || '•'}</span>
          <span style={{ color: '#94a3b8' }}>{s.message}</span>
        </div>
      ))}

      {!done && stages.length > 0 && (
        <div className="flex items-center gap-2 text-xs" style={{ color: '#475569' }}>
          <span className="loading-dots" aria-label="Processing">
            <span /><span /><span />
          </span>
          <span>Processing…</span>
        </div>
      )}

      {done && !error && stages.length > 0 && (
        <div className="text-xs" style={{ color: '#22c55e' }}>
          ✓ Pipeline complete
        </div>
      )}

      {error && (
        <div
          className="rounded-lg p-2 mt-1 text-xs"
          style={{ background: '#1c0808', color: '#f87171', border: '1px solid #7f1d1d' }}
        >
          ⚠️ {error}
        </div>
      )}
    </div>
  )
}

function UserBubble({ content }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-4/5 rounded-2xl rounded-tr-sm px-4 py-2 text-sm"
        style={{ background: '#0e7490', color: '#e0f7ff', maxWidth: '80%' }}
      >
        {content}
      </div>
    </div>
  )
}

function AssistantBubble({ content, isError }) {
  return (
    <div className="flex justify-start">
      <div
        className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm whitespace-pre-wrap"
        style={{
          background: isError ? '#1c0808' : '#0d1929',
          color: isError ? '#f87171' : '#cbd5e1',
          border: `1px solid ${isError ? '#7f1d1d' : '#1e2d40'}`,
          maxWidth: '90%',
        }}
      >
        {content}
      </div>
    </div>
  )
}

export default function Chat({ onResults }) {
  const [messages, setMessages] = useState([
    { type: 'assistant', content: WELCOME },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      const prompt = input.trim()
      if (!prompt || loading) return

      setInput('')
      setLoading(true)

      const pipelineId = `pipeline-${Date.now()}`

      setMessages((prev) => [
        ...prev,
        { type: 'user', content: prompt },
        { type: 'pipeline', id: pipelineId, stages: [], done: false, error: null },
      ])

      try {
        for await (const event of sendChatMessage(prompt)) {
          if (event.type === 'status') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === pipelineId
                  ? {
                      ...m,
                      stages: [
                        ...m.stages.filter((s) => s.stage !== event.stage),
                        { stage: event.stage, message: event.message },
                      ],
                    }
                  : m
              )
            )
          } else if (event.type === 'results') {
            onResults(event.data)

            const summary =
              event.data?.interpretation?.summary ||
              event.data?.interpretation?.recommendation?.rationale ||
              'Analysis complete — see the heatmap and cassette diagram for results.'

            setMessages((prev) => [
              ...prev.map((m) =>
                m.id === pipelineId ? { ...m, done: true } : m
              ),
              { type: 'assistant', content: summary },
            ])
          } else if (event.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === pipelineId
                  ? { ...m, done: true, error: event.message }
                  : m
              )
            )
          }
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pipelineId
              ? { ...m, done: true, error: err.message }
              : m
          )
        )
      } finally {
        setLoading(false)
        inputRef.current?.focus()
      }
    },
    [input, loading, onResults]
  )

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => {
          if (msg.type === 'user') return <UserBubble key={i} content={msg.content} />
          if (msg.type === 'pipeline') {
            return (
              <div key={i} className="flex justify-start">
                <div style={{ maxWidth: '90%', width: '100%' }}>
                  <PipelineStatus
                    stages={msg.stages}
                    done={msg.done}
                    error={msg.error}
                  />
                </div>
              </div>
            )
          }
          return (
            <AssistantBubble key={i} content={msg.content} isError={msg.isError} />
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-t"
        style={{ borderColor: '#1e2d40' }}
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder="e.g. Design a liver-specific enhancer for AAV delivery…"
            className="flex-1 rounded-lg px-4 py-2 text-sm outline-none"
            style={{
              background: '#0d1929',
              border: '1px solid #1e2d40',
              color: '#e2e8f0',
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-all"
            style={{
              background: loading || !input.trim() ? '#164e63' : '#0e7490',
              color: '#e0f7ff',
              opacity: loading || !input.trim() ? 0.55 : 1,
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  )
}
