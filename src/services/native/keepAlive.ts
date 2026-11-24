import { useChatStore } from '../chat/store.js'
import { nativeApi } from './bridge.js'

/**
 * 流式回复期间开启前台服务 + 部分 WakeLock，避免息屏/切后台时连接被系统掐断。
 * 只在原生壳里生效；浏览器开发环境是空操作。
 */
export const setupKeepAlive = (): void => {
  const api = nativeApi()
  if (!api?.startKeepAlive) {
    return
  }
  let active = false
  const sync = (streaming: boolean) => {
    if (streaming === active) {
      return
    }
    active = streaming
    try {
      if (streaming) {
        api.startKeepAlive?.()
      } else {
        api.stopKeepAlive?.()
      }
    } catch {
      // 保活失败不影响聊天
    }
  }
  useChatStore.subscribe((state) => {
    sync(Object.keys(state.streaming ?? {}).length > 0)
  })
  sync(Object.keys(useChatStore.getState().streaming ?? {}).length > 0)
}
