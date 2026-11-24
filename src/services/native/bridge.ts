/** 原生桥（MainActivity 注入 window.DaFeiYuNative）；浏览器里不存在时全部降级为空操作。 */
type NativeApi = {
  startKeepAlive?: () => void
  stopKeepAlive?: () => void
  fetchBalance?: (apiKey: string) => string
}

export const nativeApi = (): NativeApi | null => {
  const api = (window as unknown as { DaFeiYuNative?: NativeApi }).DaFeiYuNative
  return api ?? null
}

export const hasNativeBridge = (): boolean => nativeApi() !== null
