import { useState, useRef, useEffect, useCallback } from 'react'
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { SidebarLeftIcon } from '@sidekickicons/react/24/outline'

const COLLAPSED_W = 48
const EXPANDED_W = 260

export default function Sidebar({
  isOpen,
  onToggle,
  chats,
  activeChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  isMobile,
}) {
  // Floating toggle button when mobile sidebar is closed
  if (isMobile && !isOpen) {
    return (
      <button
        onClick={onToggle}
        aria-label="Open sidebar"
        style={{
          position: 'fixed',
          top: 8,
          left: 6,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          border: 'none',
          background: 'rgba(255,255,255,0.8)',
          cursor: 'pointer',
          borderRadius: 8,
          color: '#666',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#e8e8e3')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.8)')}
      >
        <SidebarLeftIcon style={{ width: 20, height: 20 }} />
      </button>
    )
  }

  const sidebarStyle = isMobile
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        width: EXPANDED_W,
        height: '100dvh',
        zIndex: 40,
      }
    : { width: isOpen ? EXPANDED_W : COLLAPSED_W }

  return (
    <div className="sidebar" style={sidebarStyle}>
      {/* Top bar — title + toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 36,
          margin: '8px 6px',
          flexShrink: 0,
        }}
      >
        {isOpen && (
          <span
            style={{
              fontWeight: 600,
              fontSize: 15,
              color: '#000',
              marginLeft: 6,
              whiteSpace: 'nowrap',
            }}
          >
            CassetteAI
          </span>
        )}
        <button
          onClick={onToggle}
          aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            borderRadius: 8,
            color: '#666',
            marginLeft: 'auto',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#e8e8e3')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <SidebarLeftIcon style={{ width: 20, height: 20 }} />
        </button>
      </div>

      {/* Expanded content */}
      <div
        className="sidebar-content"
        style={{ opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none' }}
      >
        {/* New chat button */}
        <button
          onClick={onNewChat}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: 'calc(100% - 16px)',
            margin: '0 8px 8px',
            padding: '8px 12px',
            border: '1px solid #e0e0db',
            background: 'transparent',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            color: '#333',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#e8e8e3')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <PlusIcon style={{ width: 16, height: 16 }} />
          New chat
        </button>

        {/* Chat list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
          {chats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              isActive={chat.id === activeChatId}
              onSelect={() => onSelectChat(chat.id)}
              onDelete={() => onDeleteChat(chat.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ChatItem({ chat, isActive, onSelect, onDelete }) {
  const [hovered, setHovered] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const nameRef = useRef(null)
  const timerRef = useRef(null)

  const isTruncated = useCallback(() => {
    const el = nameRef.current
    return el && el.scrollWidth > el.clientWidth
  }, [])

  const handleMouseEnter = () => {
    setHovered(true)
    timerRef.current = setTimeout(() => {
      if (isTruncated()) setShowTooltip(true)
    }, 1500)
  }

  const handleMouseLeave = () => {
    setHovered(false)
    setShowTooltip(false)
    clearTimeout(timerRef.current)
  }

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return (
    <div
      className={`sidebar-chat-item ${isActive ? 'active' : ''}`}
      onClick={onSelect}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 14,
        color: '#333',
        background: isActive ? '#e8e8e3' : 'transparent',
        marginBottom: 2,
        position: 'relative',
      }}
    >
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 4,
            padding: '4px 8px',
            background: '#333',
            color: '#fff',
            fontSize: 12,
            borderRadius: 6,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {chat.name ?? 'New chat'}
        </div>
      )}

      <span
        ref={nameRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          paddingRight: hovered ? 24 : 0,
        }}
      >
        {chat.name ?? 'New chat'}
      </span>

      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          aria-label="Delete chat"
          style={{
            position: 'absolute',
            right: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: '#999',
            borderRadius: 4,
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#666')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#999')}
        >
          <XMarkIcon style={{ width: 14, height: 14 }} />
        </button>
      )}
    </div>
  )
}
