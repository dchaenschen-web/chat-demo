/**
 * 文献检索（App 内直连，方案 B）：OpenAlex 主检索（CORS 允许 *），Crossref 兜底补 DOI。
 * 不依赖电脑和任何 API Key；检索不到就按普通消息发送。
 */

import { useSettings } from '../settings.js'

export type Paper = {
  title: string
  authors: string[]
  year: number | null
  doi: string | null
  url: string | null
  abstract: string | null
  citedBy: number | null
  source: 'openalex' | 'crossref' | 'plugin'
}

const TIMEOUT_MS = 12_000

const fetchJson = async <T>(url: string): Promise<T> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return (await response.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

type OpenAlexWork = {
  title?: string
  display_name?: string
  publication_year?: number
  doi?: string
  cited_by_count?: number
  abstract_inverted_index?: Record<string, number[]> | null
  authorships?: { author?: { display_name?: string } }[]
  primary_location?: { landing_page_url?: string | null } | null
}

const abstractOf = (inverted: Record<string, number[]> | null | undefined): string | null => {
  if (!inverted) {
    return null
  }
  const words: [number, string][] = []
  for (const [word, positions] of Object.entries(inverted)) {
    for (const position of positions) {
      words.push([position, word])
    }
  }
  if (words.length === 0) {
    return null
  }
  const text = words
    .sort((a, b) => a[0] - b[0])
    .map(([, word]) => word)
    .join(' ')
  return text.length > 700 ? `${text.slice(0, 700)}…` : text
}

const fromOpenAlex = (work: OpenAlexWork): Paper => {
  const doi = work.doi ? work.doi.replace(/^https?:\/\/doi\.org\//i, '') : null
  return {
    title: (work.title || work.display_name || '').trim(),
    authors: (work.authorships ?? [])
      .map((item) => item.author?.display_name ?? '')
      .filter(Boolean)
      .slice(0, 6),
    year: work.publication_year ?? null,
    doi,
    url: work.primary_location?.landing_page_url ?? (doi ? `https://doi.org/${doi}` : null),
    abstract: abstractOf(work.abstract_inverted_index),
    citedBy: typeof work.cited_by_count === 'number' ? work.cited_by_count : null,
    source: 'openalex',
  }
}

type CrossrefWork = {
  title?: string[]
  author?: { given?: string; family?: string }[]
  issued?: { 'date-parts'?: number[][] }
  DOI?: string
  URL?: string
  'is-referenced-by-count'?: number
}

const fromCrossref = (work: CrossrefWork): Paper => {
  const parts = work.issued?.['date-parts']?.[0] ?? []
  return {
    title: (work.title?.[0] ?? '').trim(),
    authors: (work.author ?? [])
      .map((author) => [author.given, author.family].filter(Boolean).join(' '))
      .filter(Boolean)
      .slice(0, 6),
    year: typeof parts[0] === 'number' ? parts[0] : null,
    doi: work.DOI ?? null,
    url: work.URL ?? (work.DOI ? `https://doi.org/${work.DOI}` : null),
    abstract: null,
    citedBy: work['is-referenced-by-count'] ?? null,
    source: 'crossref',
  }
}

/** 关键词检索真实文献；失败返回空数组（调用方按普通消息继续）。 */
const searchPapersOnline = async (query: string, limit = 5): Promise<Paper[]> => {
  const text = query.trim().slice(0, 300)
  if (!text) {
    return []
  }
  try {
    const data = await fetchJson<{ results?: OpenAlexWork[] }>(
      `https://api.openalex.org/works?search=${encodeURIComponent(text)}&per-page=${limit}` +
        '&select=title,display_name,publication_year,doi,cited_by_count,abstract_inverted_index,authorships,primary_location'
    )
    const papers = (data.results ?? []).map(fromOpenAlex).filter((paper) => paper.title)
    if (papers.length > 0) {
      return papers
    }
  } catch {
    // 落到 Crossref
  }
  try {
    const data = await fetchJson<{ message?: { items?: CrossrefWork[] } }>(
      `https://api.crossref.org/works?query=${encodeURIComponent(text)}&rows=${limit}&select=title,author,issued,DOI,URL,is-referenced-by-count`
    )
    return (data.message?.items ?? []).map(fromCrossref).filter((paper) => paper.title)
  } catch {
    return []
  }
}

/** 把检索结果写成「只准引用池内文献」的提示块，插在用户消息前。 */
export const buildPaperPoolBlock = (papers: Paper[]): string => {
  const lines = papers.map((paper, index) => {
    const parts = [`[${index + 1}] ${paper.title}`]
    if (paper.authors.length > 0) parts.push(`作者: ${paper.authors.join(', ')}`)
    if (paper.year) parts.push(`年份: ${paper.year}`)
    if (paper.doi) parts.push(`DOI: ${paper.doi}`)
    if (paper.url) parts.push(`链接: ${paper.url}`)
    if (paper.abstract) parts.push(`摘要: ${paper.abstract}`)
    return parts.join('｜')
  })
  return [
    '【本次回答的文献池（检索自 OpenAlex/Crossref，都是真实存在的条目）】',
    ...lines,
    '',
    '规则：只允许引用上面文献池里的条目；需要引用时给出编号 + 标题 + DOI 链接。',
    '池子里没有的文献不要编造，也不要凭记忆补引用；不确定就明确说“文献池里没有相关条目”。',
  ].join('\n')
}


/** 把 harvester 的记录整成 Paper（字段名做了防御，兼容 records/relevant 两种） */
const fromPlugin = (item: Record<string, unknown>): Paper | null => {
  const title = String(item.title ?? item.paper_title ?? item.name ?? '').trim()
  if (!title) {
    return null
  }
  const authors = Array.isArray(item.authors)
    ? (item.authors as unknown[]).map((value) => String(value)).filter(Boolean).slice(0, 6)
    : item.author
      ? [String(item.author)]
      : []
  const rawYear = item.year ?? item.published_year ?? item.pub_year
  const year = Number.isFinite(Number(rawYear)) ? Number(rawYear) : null
  const doi = item.doi ? String(item.doi) : null
  const rawUrl = item.url ?? item.link ?? item.arxiv_url ?? item.abs_url ?? item.pdf_url
  const url = rawUrl ? String(rawUrl) : doi ? `https://doi.org/${doi}` : null
  return {
    title,
    authors,
    year,
    doi,
    url,
    abstract: item.abstract ? String(item.abstract).slice(0, 700) : null,
    citedBy: null,
    source: 'plugin',
  }
}

const pluginStatusDone = (status: string) =>
  ['done', 'completed', 'finished', 'success', 'ready'].includes(status)
const pluginStatusFailed = (status: string) =>
  ['error', 'failed', 'cancelled', 'canceled'].includes(status)

/** 走电脑上的 paper harvester（经局域网同步服务转发）；不可用时返回 null。 */
const searchPapersViaPlugin = async (
  query: string,
  limit: number
): Promise<Paper[] | null> => {
  const settings = useSettings.getState()
  const endpoint = settings.syncEndpoint?.trim().replace(/\/+$/, '')
  const token = settings.syncToken ?? ''
  if (!endpoint || !token) {
    return null
  }
  const headers = { 'Content-Type': 'application/json', 'X-Sync-Token': token }
  const started = await fetch(`${endpoint}/api/papers/start`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ topic: query, summary_backend: 'auto' }),
  })
  if (!started.ok) {
    return null
  }
  const taskId = ((await started.json()) as { task_id?: string; id?: string }).task_id
  if (!taskId) {
    return null
  }
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const response = await fetch(
      `${endpoint}/api/papers/status/${encodeURIComponent(taskId)}`,
      { headers: { 'X-Sync-Token': token } }
    )
    if (!response.ok) {
      continue
    }
    const task = (await response.json()) as {
      status?: string
      relevant?: Record<string, unknown>[]
      records?: Record<string, unknown>[]
    }
    const status = String(task.status ?? '')
    if (pluginStatusFailed(status)) {
      return null
    }
    if (pluginStatusDone(status)) {
      const pool = (task.relevant?.length ? task.relevant : task.records) ?? []
      return pool
        .map((item) => fromPlugin(item))
        .filter((paper): paper is Paper => paper !== null)
        .slice(0, limit)
    }
  }
  return null
}

/** 文献检索：优先电脑上的插件（按提示词现查 + 本地模型筛选），不可用时退回 OpenAlex。 */
export const searchPapers = async (query: string, limit = 8): Promise<Paper[]> => {
  const text = query.trim().slice(0, 300)
  if (!text) {
    return []
  }
  try {
    const viaPlugin = await searchPapersViaPlugin(text, limit)
    if (viaPlugin && viaPlugin.length > 0) {
      return viaPlugin
    }
  } catch {
    // 插件不可用，退回在线检索
  }
  return searchPapersOnline(text, limit)
}
