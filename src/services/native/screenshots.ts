import { create } from 'zustand'
import { nativeApi } from './bridge.js'

/** 待裁剪的截图（data URL）。原生桥不存在时永远为空。 */
type ScreenshotState = {
  candidates: string[]
  take: (url: string) => void
  shift: () => void
  clear: () => void
}

export const useScreenshots = create<ScreenshotState>((set) => ({
  candidates: [],
  take: (url) => set((state) => ({ candidates: [...state.candidates, url] })),
  shift: () => set((state) => ({ candidates: state.candidates.slice(1) })),
  clear: () => set({ candidates: [] }),
}))

type ScreenshotNative = {
  fetchNewScreenshots?: () => string
  readScreenshot?: (uri: string) => string
}

/** 回到前台时检查有没有新截图；有就推进裁剪队列。 */
export const setupScreenshotImport = (): void => {
  const native = nativeApi() as ScreenshotNative | null
  if (!native?.fetchNewScreenshots) {
    return
  }
  const check = () => {
    try {
      const raw = native.fetchNewScreenshots?.() ?? '[]'
      const uris = JSON.parse(raw) as unknown
      if (!Array.isArray(uris) || uris.length === 0) {
        return
      }
      for (const uri of uris.slice(0, 3)) {
        if (typeof uri !== 'string') continue
        const dataUrl = native.readScreenshot?.(uri) ?? ''
        if (dataUrl.startsWith('data:image/')) {
          useScreenshots.getState().take(dataUrl)
        }
      }
    } catch {
      // 读截图失败不打扰用户
    }
  }
  ;(window as unknown as { __dafeiyuOnResume?: () => void }).__dafeiyuOnResume = check
  // 首次进入也检查一次（可能是先截屏再打开 App）
  check()
}
