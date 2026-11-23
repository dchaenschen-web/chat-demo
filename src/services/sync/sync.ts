import type { SessionFile } from '../chat/history/format.js'
import { toLocalSession } from '../chat/history/toLocal.js'
import { toSessionFile } from '../chat/history/toArchive.js'
import { deleteSession, loadSession, loadSessionSummaries, saveSession } from '../chat/db.js'
import { clearPendingDeletion, listPendingDeletions } from './deletions.js'

/** 远端会话列表项（与 ds_sync_server.py 的 /api/sessions 对齐） */
export type RemoteEntry = {
  id: string
  title: string | null
  updated_at: string
  messages: number
  hash: string
}

/** 远端墓碑：对方删掉的会话，本地也要删，且不能再推回去 */
export type RemoteTombstone = { id: string; deleted_at: number }

export type SyncResult = {
  pulled: number
  pushed: number
  skipped: number
  deleted: number
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

/** 兼容旧版服务端：v2 的 /api/sessions 没有 deleted 字段 */
const listRemote = async (endpoint: string, token: string) => {
  const data = await request<{
    sessions?: RemoteEntry[]
    deleted?: RemoteTombstone[]
  }>(endpoint, token, '/api/sessions')
  return { sessions: data.sessions ?? [], deleted: data.deleted ?? [] }
}

const pullSession = async (endpoint: string, token: string, id: string): Promise<void> => {
  const file = await request<SessionFile>(endpoint, token, `/api/sessions/${encodeURIComponent(id)}`)
  const local = toLocalSession(file)
  await saveSession(local.session)
}

const pushSession = async (endpoint: string, token: string, id: string): Promise<boolean> => {
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

/** 把本地删掉的会话推给电脑（推成功才清队列，失败下次再试） */
const pushDeletions = async (endpoint: string, token: string, result: SyncResult) => {
  for (const id of listPendingDeletions()) {
    try {
      await request(endpoint, token, `/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
      clearPendingDeletion(id)
    } catch (error) {
      result.errors.push(`删除 ${id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

/**
 * 双向同步：
 * - 先推本地删除，再应用远端墓碑（两边都不复活已删会话）；
 * - 其余会话按 updatedAt / updated_at 后写优先；
 * - 冲突（两边都改过）保留较新一侧，旧的一侧被覆盖。
 */
export const syncOnce = async (
  endpoint: string,
  token: string,
  onProgress?: (text: string) => void
): Promise<SyncResult> => {
  const result: SyncResult = { pulled: 0, pushed: 0, skipped: 0, deleted: 0, errors: [] }

  onProgress?.('推送本地删除…')
  await pushDeletions(endpoint, token, result)

  const [{ sessions: remote, deleted }, localSummaries] = await Promise.all([
    listRemote(endpoint, token),
    loadSessionSummaries(),
  ])
  const tombstoned = new Set(deleted.map((item) => item.id))

  for (const id of tombstoned) {
    if (localSummaries.some((summary) => summary.id === id)) {
      onProgress?.(`删除 ${id.slice(0, 8)}`)
      await deleteSession(id)
      result.deleted += 1
    }
  }

  const remoteById = new Map(
    remote.filter((item) => !tombstoned.has(item.id)).map((item) => [item.id, item])
  )
  const localById = new Map(
    localSummaries.filter((item) => !tombstoned.has(item.id)).map((item) => [item.id, item])
  )
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
