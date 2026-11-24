/**
 * 小鲸鱼挂件（dsh-whale-widget 0.3.16）的浏览器端适配层。
 *
 * 原插件是「Host 插件 + 前端挂件」：挂件通过 /dsh-whale/* 拿角色图、气泡图、音效和状态。
 * 这里在 App 内把宿主侧的读接口用本地资产 + localStorage 顶上（折中方案 A）：
 * - 角色/气泡图/音效：打包在 public/whale/（scripts/vendor_whale.py 生成）
 * - 气泡配置/尺寸：从本机 DSH 状态种子导入，之后改动存 localStorage
 * - 余额/用量账本/最近一轮消耗：宿主侧没有对应数据，返回空（这些面板显示占位）
 */

type Manifest = {
  roles: Record<string, string>
  defaultRole: string
  bubbles: Record<string, string>
  audio: Record<string, string>
  static: Record<string, string>
  seed?: Record<string, string>
}

const PREFIX = 'dafeiyu-whale:'
const store = {
  read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  },
  write(key: string, value: unknown) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      // 忽略
    }
  },
}

let assetBase = ''
// 页面在 /assets/index.html，资产随包放在 /assets/whale/
const toAsset = (rel: string) => assetBase + rel

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })

const assetResponse = async (rel: string | undefined) => {
  if (!rel) {
    return json({ ok: false, error: 'asset missing' }, 404)
  }
  const res = await fetch(toAsset(rel))
  if (!res.ok) {
    return json({ ok: false, error: 'asset 404' }, 404)
  }
  return new Response(await res.blob(), {
    status: 200,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream' },
  })
}

const queryId = (url: URL) => url.searchParams.get('id') ?? ''

export const installWhale = async (): Promise<void> => {
  const w = window as unknown as { __dafeiyuWhale?: boolean }
  if (w.__dafeiyuWhale) {
    return
  }
  w.__dafeiyuWhale = true
  try {
    assetBase = new URL('whale/', location.href).href
    const manifest = (await (await fetch(toAsset('index.json'))).json()) as Manifest

    const seeds = {
      bubble: await fetch(toAsset(seedsRel(manifest, 'bubble'))).then((r) => r.json()).catch(() => null),
      size: await fetch(toAsset(seedsRel(manifest, 'size'))).then((r) => r.json()).catch(() => null),
    }
    if (!store.read('bubble', null) && seeds.bubble) store.write('bubble', seeds.bubble)
    if (!store.read('size', null) && seeds.size) store.write('size', seeds.size)

    const rolesPayload = () => ({
      ok: true,
      roles: Object.keys(manifest.roles).map((id) => ({
        id,
        name: id === manifest.defaultRole ? '小鲸鱼' : id,
        url:
          id === manifest.defaultRole
            ? '/dsh-whale/image.png'
            : `/dsh-whale/role-image.png?id=${encodeURIComponent(id)}`,
        pinned: false,
        pinnedAt: null,
        createdAt: null,
        format: manifest.roles[id].endsWith('.gif') ? 'gif' : 'png',
      })),
    })

    const bubbleImgsPayload = () => ({
      ok: true,
      images: Object.keys(manifest.bubbles).map((id) => ({
        id,
        name: id,
        format: manifest.bubbles[id].endsWith('.gif') ? 'gif' : 'png',
        url: `/dsh-whale/bubble-img.png?id=${encodeURIComponent(id)}`,
        createdAt: null,
      })),
    })

    const sizePayload = () => {
      const size = store.read<Record<string, unknown>>('size', {})
      return { scale: 1.3, sound: true, vol: 0.9, ...size }
    }

    const handle = async (url: URL, init?: RequestInit): Promise<Response | null> => {
      const path = url.pathname
      if (!path.startsWith('/dsh-whale/')) {
        return null
      }
      const method = (init?.method ?? 'GET').toUpperCase()
      switch (path) {
        case '/dsh-whale/roles.json':
          if (method !== 'GET') return json({ ok: true })
          return json(rolesPayload())
        case '/dsh-whale/image.png':
          return assetResponse(manifest.roles[manifest.defaultRole])
        case '/dsh-whale/role-image.png':
          return assetResponse(manifest.roles[queryId(url)])
        case '/dsh-whale/bubble-img.png':
          return assetResponse(manifest.bubbles[queryId(url)])
        case '/dsh-whale/bubble-imgs.json':
          if (method !== 'GET') return json({ ok: true })
          return json(bubbleImgsPayload())
        case '/dsh-whale/rua.gif':
          return assetResponse(manifest.static.rua)
        case '/dsh-whale/audio-fragment.wav':
          return assetResponse(manifest.audio[queryId(url)])
        case '/dsh-whale/audio.json':
          if (method !== 'GET') return json({ ok: true })
          return json({ ok: true, fragments: [], groups: [] })
        case '/dsh-whale/bubble.json':
          if (method === 'GET') return json({ ok: true, config: store.read('bubble', null) })
          return json({ ok: true })
        case '/dsh-whale/size.json':
          if (method === 'GET') return json(sizePayload())
          return json({ ok: true })
        case '/dsh-whale/usage-settings.json':
          return json({ ok: true, settings: store.read('usage', {}) })
        case '/dsh-whale/usage-records.json':
          return json({ ok: true, days: [], today: null, month: null })
        case '/dsh-whale/last-turn.json':
          return json({ ok: true, seq: 0, turn: null, amount: null, tokens: null, ts: null })
        case '/dsh-whale/wait.json':
          return json({ ok: true, pending: false, sessionName: '' })
        case '/dsh-whale/api-models.json':
          return json({ ok: true, models: [], templates: [] })
        case '/dsh-whale/balance':
        case '/dsh-whale/balance.json': {
          const native = (
            window as unknown as { DaFeiYuNative?: { fetchBalance?: (key: string) => string } }
          ).DaFeiYuNative
          if (!native?.fetchBalance) {
            return json({ ok: false, error: '余额需要原生壳（浏览器预览不支持）' })
          }
          try {
            const apiKey =
              (await import('../settings.js')).useSettings.getState().apiKey ?? ''
            const parsed = JSON.parse(native.fetchBalance(apiKey)) as Record<string, unknown>
            return json({ ok: parsed.ok !== false, ...parsed })
          } catch (error) {
            return json({ ok: false, error: String(error) })
          }
        }
        default:
          return json({ ok: false, error: 'not supported' })
      }
    }

    const originalFetch = window.fetch.bind(window)
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      let url: URL | null = null
      try {
        url = new URL(href, location.href)
      } catch {
        url = null
      }
      if (url && url.origin === location.origin && url.pathname.startsWith('/dsh-whale/')) {
        return handle(url, init).then((res) => res ?? originalFetch(input, init))
      }
      return originalFetch(input, init)
    }) as typeof window.fetch

    // 挂件用 img.src / audio.src 直接引用 /dsh-whale/*，这两个属性也要改写到本地资产
    const rewrite = (value: string): string => {
      if (!value.startsWith('/dsh-whale/')) {
        return value
      }
      try {
        const url = new URL(value, location.href)
        const path = url.pathname
        const id = queryId(url)
        if (path === '/dsh-whale/image.png') return toAsset(manifest.roles[manifest.defaultRole] ?? '')
        if (path === '/dsh-whale/role-image.png') return toAsset(manifest.roles[id] ?? '')
        if (path === '/dsh-whale/bubble-img.png') return toAsset(manifest.bubbles[id] ?? '')
        if (path === '/dsh-whale/audio-fragment.wav') return toAsset(manifest.audio[id] ?? '')
        if (path === '/dsh-whale/rua.gif') return toAsset(manifest.static.rua ?? '')
      } catch {
        return value
      }
      return value
    }

    const patchSrc = (proto: object) => {
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'src')
      if (!descriptor || !descriptor.set || !descriptor.get) {
        return
      }
      Object.defineProperty(proto, 'src', {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(value: string) {
          descriptor.set?.call(this, rewrite(String(value)))
        },
      })
    }
    patchSrc(HTMLImageElement.prototype)
    patchSrc(HTMLMediaElement.prototype)

    // 等 App 渲染出 composer（textarea）再注入挂件：挂件只在主聊天界面启动
    await new Promise<void>((resolve) => {
      let tries = 0
      const timer = window.setInterval(() => {
        tries += 1
        if (document.querySelector('textarea') || tries > 100) {
          window.clearInterval(timer)
          resolve()
        }
      }, 100)
    })

    await new Promise<void>((resolve) => {
      const script = document.createElement('script')
      script.src = toAsset('whale-widget.js')
      script.onload = () => resolve()
      script.onerror = () => resolve()
      document.head.appendChild(script)
    })
  } catch (error) {
    console.warn('[whale] 挂件加载失败', error)
  }
}

const seedsRel = (manifest: Manifest, name: string): string => {
  const rel = manifest.seed?.[name]
  return rel ?? `seed/${name}.json`
}
