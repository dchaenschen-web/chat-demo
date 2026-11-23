import type { MessageUsage } from '../../services/api/types.js'
import { isPeakTime } from '../../services/pricing/peak.js'

const number = (value: number | undefined) => (value ?? 0).toLocaleString('zh-CN')

const style = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  marginTop: 4,
  fontSize: 11,
  lineHeight: '16px',
  color: 'inherit',
  opacity: 0.55,
  userSelect: 'none',
} as const

const peakStyle = {
  padding: '0 5px',
  borderRadius: 4,
  border: '1px solid currentColor',
  fontSize: 10,
  lineHeight: '14px',
} as const

/** 单条回复的 token 消耗 + 该轮所处时段（高峰/空闲） */
export const UsageLine = ({
  usage,
  createdAt,
}: {
  usage: MessageUsage | undefined
  createdAt: number
}) => {
  if (!usage) {
    return null
  }
  const peak = isPeakTime(createdAt)
  return (
    <div style={style}>
      <span>输入 {number(usage.input_tokens)}</span>
      <span>缓存读 {number(usage.cache_read_input_tokens)}</span>
      {usage.cache_creation_input_tokens > 0 ? (
        <span>缓存写 {number(usage.cache_creation_input_tokens)}</span>
      ) : null}
      <span>输出 {number(usage.output_tokens)}</span>
      {usage.server_tool_use?.web_search_requests ? (
        <span>联网 {usage.server_tool_use.web_search_requests} 次</span>
      ) : null}
      <span style={peakStyle}>{peak ? '高峰时段' : '空闲时段'}</span>
    </div>
  )
}
