import { useState, useRef, useEffect, useCallback } from 'react'
import { sendChatMessage } from './api.js'

function StatusLine({ message, isActive }) {
  return (
    <div className="flex justify-start">
      <div
        className="flex items-center text-xs rounded-lg px-3 py-1.5"
        style={{ color: '#6b7280', background: '#f3f4f6' }}
      >
        <span>{message}</span>
        {isActive && <span className="inline-spinner" />}
      </div>
    </div>
  )
}

function ThoughtBubble({ message, isActive }) {
  return (
    <div className="flex justify-start">
      <div
        className="text-sm whitespace-pre-wrap flex items-start"
        style={{
          color: '#374151',
          maxWidth: '90%',
          lineHeight: 1.6,
        }}
      >
        <span>{message}</span>
        {isActive && <span className="inline-spinner" style={{ marginTop: 5 }} />}
      </div>
    </div>
  )
}

function UserBubble({ content }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-4/5 rounded-2xl px-4 py-2 text-sm"
        style={{
          background: '#ffffff',
          color: '#1a1a1a',
          border: '1px solid #e5e7eb',
          maxWidth: '80%',
        }}
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
        className="text-sm whitespace-pre-wrap"
        style={{
          color: isError ? '#dc2626' : '#1a1a1a',
          maxWidth: '90%',
          lineHeight: 1.6,
        }}
      >
        {content}
      </div>
    </div>
  )
}

export default function Chat({ onResults, hasStarted, onStart, messages, setMessages }) {
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

      // Trigger transition on first submit
      if (!hasStarted && onStart) onStart()

      setInput('')
      setLoading(true)

      setMessages((prev) => [...prev, { type: 'user', content: prompt }])

      try {
        for await (const event of sendChatMessage(prompt)) {
          if (event.type === 'status') {
            setMessages((prev) => [
              ...prev,
              { type: 'status', stage: event.stage, message: event.message },
            ])
          } else if (event.type === 'thought') {
            setMessages((prev) => [
              ...prev,
              { type: 'thought', stage: event.stage, message: event.message },
            ])
          } else if (event.type === 'results') {
            onResults(event.data)

            const summary =
              event.data?.interpretation?.summary ||
              event.data?.interpretation?.recommendation?.rationale ||
              'Analysis complete — see the heatmap and cassette diagram for results.'

            setMessages((prev) => [
              ...prev,
              { type: 'assistant', content: summary },
            ])
          } else if (event.type === 'error') {
            setMessages((prev) => [
              ...prev,
              { type: 'assistant', content: event.message, isError: true },
            ])
          }
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { type: 'assistant', content: err.message, isError: true },
        ])
      } finally {
        setLoading(false)
        inputRef.current?.focus()
      }
    },
    [input, loading, onResults, hasStarted, onStart]
  )

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e)
    }
  }

  /* ── Landing mode: centered input with title ── */
  if (!hasStarted) {
    return (
      <div style={{ width: '100%', maxWidth: 696 }}>
        <h1
          style={{
            fontSize: 60,
            fontWeight: 900,
            color: '#000000',
            letterSpacing: '0.04em',
            marginBottom: 8,
            textAlign: 'center',
          }}
        >
          CassetteAI
        </h1>
        <div style={{ marginBottom: 32 }} />

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              padding: '10px 10px 10px 24px',
              alignItems: 'center',
              background: '#f0f0f0',
              borderRadius: 9999,
              border: 'none',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="Design a liver-specific enhancer for AAV delivery…"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 18,
                color: '#1a1a1a',
                padding: '10px 0',
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                background: loading || !input.trim() ? '#d4d4d4' : '#333333',
                color: loading || !input.trim() ? '#9ca3af' : '#ffffff',
                border: 'none',
                borderRadius: 9999,
                padding: '12px 24px',
                fontSize: 17,
                fontWeight: 600,
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 200ms ease',
              }}
            >
              {loading ? '…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  /* ── Active mode: full chat panel ── */
  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => {
          const isLastOfType = loading && !messages.slice(i + 1).some(
            (m) => m.type === 'status' || m.type === 'thought' || m.type === 'assistant'
          )
          if (msg.type === 'user') return <UserBubble key={i} content={msg.content} />
          if (msg.type === 'status') return <StatusLine key={i} message={msg.message} isActive={isLastOfType && msg.type === 'status'} />
          if (msg.type === 'thought') return <ThoughtBubble key={i} message={msg.message} isActive={isLastOfType && msg.type === 'thought'} />
          if (msg.type === 'assistant') return <AssistantBubble key={i} content={msg.content} isError={msg.isError} />
          return null
        })}

        {loading && (
          <div className="flex items-center gap-2 text-xs" style={{ color: '#9ca3af' }}>
            <span className="loading-dots" aria-label="Processing">
              <span /><span /><span />
            </span>
            <span>Processing…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        style={{ padding: 16 }}
      >
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '6px 6px 6px 20px',
            alignItems: 'center',
            background: '#f0f0f0',
            borderRadius: 9999,
            border: 'none',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder="Ask a follow-up or start a new design…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 14,
              color: '#1a1a1a',
              padding: '8px 0',
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{
              background: loading || !input.trim() ? '#d4d4d4' : '#333333',
              color: loading || !input.trim() ? '#9ca3af' : '#ffffff',
              border: 'none',
              borderRadius: 9999,
              padding: '8px 18px',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 200ms ease',
            }}
          >
            {loading ? '…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  )
}
