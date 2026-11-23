import { useEffect, useState } from 'react'
import { isPeakTime, peakSwitchText } from '../../services/pricing/peak.js'

const base = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  borderRadius: 999,
  border: '1px solid currentColor',
  fontSize: 11,
  lineHeight: '16px',
  opacity: 0.75,
  whiteSpace: 'nowrap',
  userSelect: 'none',
} as const

/** 输入框旁的实时峰谷状态：高峰/空闲 + 距离下次切换多久 */
export const PeakBadge = () => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const peak = isPeakTime(now)
  const hint = peakSwitchText(now)

  return (
    <span style={{ ...base, gap: 6 }} title="DeepSeek 峰谷计费时段（北京时间：工作日 9-12、14-18 为高峰）">
      <span aria-hidden>{peak ? '🔴' : '🟢'}</span>
      <span>{peak ? '高峰' : '空闲'}</span>
      {hint ? <span style={{ opacity: 0.7 }}>{hint}</span> : null}
    </span>
  )
}
