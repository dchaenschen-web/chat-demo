/**
 * 待同步的本地删除。
 *
 * 手机上删掉的会话必须在下次同步时告诉电脑，否则电脑会把它当成「本机新会话」再推回来。
 * 队列只存 chat-demo 的会话 id（uuid，对应 DSH 的 session-<uuid>）。
 */

const KEY = 'chat-demo:sync-pending-deletions'

const read = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY)
    const value = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

const write = (ids: string[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    // 存储不可用时只在内存中丢失，不影响当前会话
  }
}

export const listPendingDeletions = (): string[] => read()

export const queueDeletion = (id: string) => {
  const ids = read()
  if (!ids.includes(id)) {
    ids.push(id)
    write(ids)
  }
}

export const clearPendingDeletion = (id: string) => {
  const ids = read()
  const next = ids.filter((item) => item !== id)
  if (next.length !== ids.length) {
    write(next)
  }
}
