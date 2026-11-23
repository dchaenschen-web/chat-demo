import type { SessionFile } from '../chat/history/format.js'
import { toLocalSession } from '../chat/history/toLocal.js'
import { toSessionFile } from '../chat/history/toArchive.js'
import { loadSession, loadSessionSummaries, saveSession } from '../chat/db.js'

/** 远端会话列表项（与 ds_sync_server.py 的 /api/sessions 对齐） */
export type RemoteEntry = {
  id: string
  title: string | null
  updated_at: string
  messages: number
  hash: string
}

export type SyncResult = {
  pulled: number
  pushed: number
  skipped: number
  errors: string[]
}

export type PingResult = { ok: boolean; host: string; workspace: string; version: number }

/**
 * 规范化同步地址：去掉尾部斜杠；没写协议时补 http://
 * （漏写协议会变成相对路径，在 https 页面下发请求直接 Failed to fetch）
 */
const normalize = (endpoint: string) => {
  const trimmed = endpoint.trim().replace(/\/+$/, '')
  if (!trimmed) {
    return ''
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
}

const headers = (token: string) => ({
  'Content-Type': 'application/json',
  'X-Sync-Token': token,
})

const request = async <T>(
  endpoint: string,
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> => {
  const response = await fetch(normalize(endpoint) + path, {
    ...init,
    headers: { ...headers(token), ...(init?.headers ?? {}) },
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${response.status} ${text.slice(0, 200)}`)
  }
  return (await response.json()) as T
}

export const pingSync = (endpoint: string, token: string): Promise<PingResult> =>
  request<PingResult>(endpoint, token, '/api/ping')

const pullSession = async (endpoint: string, token: string, id: string): Promise<boolean> => {
  const file = await request<SessionFile>(endpoint, token, `/api/sessions/${encodeURIComponent(id)}`)
  const local = toLocalSession(file)
  const existed = (await loadSessionSummaries()).some((summary) => summary.id === local.session.id)
  await saveSession(local.session)
  return !existed
}

const pushSession = async (
  endpoint: string,
  token: string,
  id: string
): Promise<boolean> => {
  const session = await loadSession(id)
  if (!session) {
    return false
  }
  const file = toSessionFile(session, () => null)
  await request(endpoint, token, `/api/sessions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(file),
  })
  return true
}

/**
 * 双向同步：按 updatedAt / updated_at 做后写优先。
 * 冲突（两边都改过）时本版策略是保留较新一侧，旧的一侧被覆盖；不会静默删除会话。
 */
export const syncOnce = async (
  endpoint: string,
  token: string,
  onProgress?: (text: string) => void
): Promise<SyncResult> => {
  const result: SyncResult = { pulled: 0, pushed: 0, skipped: 0, errors: [] }
  const [{ sessions: remote }, localSummaries] = await Promise.all([
    request<{ sessions: RemoteEntry[] }>(endpoint, token, '/api/sessions'),
    loadSessionSummaries(),
  ])
  const remoteById = new Map(remote.map((item) => [item.id, item]))
  const localById = new Map(localSummaries.map((item) => [item.id, item]))
  const ids = new Set<string>([...remoteById.keys(), ...localById.keys()])

  for (const id of ids) {
    const remoteItem = remoteById.get(id)
    const localItem = localById.get(id)
    try {
      if (remoteItem && !localItem) {
        onProgress?.(`拉取 ${remoteItem.title ?? id}`)
        await pullSession(endpoint, token, id)
        result.pulled += 1
        continue
      }
      if (!remoteItem && localItem) {
        onProgress?.(`上传 ${localItem.title || id}`)
        if (await pushSession(endpoint, token, id)) {
          result.pushed += 1
        }
        continue
      }
      if (!remoteItem || !localItem) {
        continue
      }
      const remoteMs = Date.parse(remoteItem.updated_at)
      const localMs = localItem.updatedAt
      if (Number.isFinite(remoteMs) && remoteMs > localMs + 1000) {
        onProgress?.(`拉取 ${remoteItem.title ?? id}`)
        await pullSession(endpoint, token, id)
        result.pulled += 1
      } else if (localMs > remoteMs + 1000) {
        onProgress?.(`上传 ${localItem.title || id}`)
        if (await pushSession(endpoint, token, id)) {
          result.pushed += 1
        }
      } else {
        result.skipped += 1
      }
    } catch (error) {
      result.errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return result
}
