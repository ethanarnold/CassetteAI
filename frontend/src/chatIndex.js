import { listChatIds } from './storage.js'

const INDEX_KEY = 'cassette-chat-index'

function readIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeIndex(index) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index))
  } catch {
    // localStorage may throw in private browsing or when full
  }
}

function sortNewestFirst(index) {
  return index.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Load the chat index from localStorage, sorted newest first.
 * On first load, backfills from existing cassette-chat-* keys.
 */
export function loadChatIndex() {
  let index = readIndex()
  if (index === null) {
    // First load — backfill from existing chat keys
    const ids = listChatIds()
    index = ids.map((id) => ({
      id,
      name: 'Untitled chat',
      createdAt: Date.now(),
    }))
    writeIndex(index)
  }
  return sortNewestFirst(index)
}

/**
 * Add a new chat entry with name: null.
 */
export function addChatToIndex(chatId) {
  const index = readIndex() ?? []
  index.push({ id: chatId, name: null, createdAt: Date.now() })
  writeIndex(index)
  return sortNewestFirst(index)
}

/**
 * Update the name for a chat.
 */
export function updateChatName(chatId, name) {
  const index = readIndex() ?? []
  const entry = index.find((e) => e.id === chatId)
  if (entry) {
    entry.name = name
    writeIndex(index)
  }
  return sortNewestFirst(index)
}

/**
 * Remove a chat from the index.
 */
export function removeChatFromIndex(chatId) {
  let index = readIndex() ?? []
  index = index.filter((e) => e.id !== chatId)
  writeIndex(index)
  return sortNewestFirst(index)
}
