const PREFIX = 'cassette-chat-'

export function saveChat(chatId, data) {
  try {
    localStorage.setItem(PREFIX + chatId, JSON.stringify(data))
  } catch {
    // localStorage may throw in private browsing or when full
  }
}

export function loadChat(chatId) {
  try {
    const raw = localStorage.getItem(PREFIX + chatId)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function deleteChat(chatId) {
  try {
    localStorage.removeItem(PREFIX + chatId)
  } catch {
    // ignore
  }
}
