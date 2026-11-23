/**
 * DeepSeek 峰谷时段判定（与 dsh-whale-widget 宿主端同一套规则）：
 * - 高峰：北京时间 周一至周五（不含法定节假日）09:00–12:00、14:00–18:00
 * - 其余时段（夜间、午休、周末、节假日全天）一律按空闲时段
 * - 2026-08-23 00:00（北京时间）起周末全天谷价；2026-09-19 00:00 起法定节假日全天谷价
 *
 * 每年 11 月国务院发布次年安排后，需要补 HOLIDAY_VALLEY 的日期。
 */

export const PEAK_HOURS: [number, number][] = [
  [9, 12],
  [14, 18],
]

/** 北京时间 2026-08-23 00:00 = UTC 2026-08-22 16:00 */
const WEEKEND_VALLEY_FROM_MS = Date.UTC(2026, 7, 22, 16, 0, 0)
/** 北京时间 2026-09-19 00:00 = UTC 2026-09-18 16:00 */
const HOLIDAY_VALLEY_FROM_MS = Date.UTC(2026, 8, 18, 16, 0, 0)

/** 2026 年法定放假日期（调休上班日落在周末，按周末规则已是谷价，无需单列） */
const HOLIDAY_VALLEY = new Set([
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07',
])

const BJ_OFFSET_MS = 8 * 3600 * 1000

const beijing = (ms: number) => {
  const shifted = new Date(ms + BJ_OFFSET_MS)
  return {
    date: shifted.toISOString().slice(0, 10),
    dayOfWeek: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
  }
}

/** 给定时刻是否高峰时段（默认当前） */
export const isPeakTime = (ms: number = Date.now()): boolean => {
  const { date, dayOfWeek, hour } = beijing(ms)
  if (ms >= WEEKEND_VALLEY_FROM_MS && (dayOfWeek === 0 || dayOfWeek === 6)) {
    return false
  }
  if (ms >= HOLIDAY_VALLEY_FROM_MS && HOLIDAY_VALLEY.has(date)) {
    return false
  }
  return PEAK_HOURS.some(([start, end]) => hour >= start && hour < end)
}

/** 下一个峰谷切换时刻（毫秒）；扫北京时间 0/9/12/14/18 点边界，最多看 12 天 */
export const nextPeakChangeAt = (ms: number = Date.now()): number | null => {
  const current = isPeakTime(ms)
  const day0 = Math.floor((ms + BJ_OFFSET_MS) / 86400000) * 86400000
  for (let day = 0; day <= 12; day += 1) {
    for (const edge of [0, 9, 12, 14, 18]) {
      const candidate = day0 + day * 86400000 + edge * 3600000 - BJ_OFFSET_MS
      if (candidate <= ms + 1000) {
        continue
      }
      if (isPeakTime(candidate) !== current) {
        return candidate
      }
    }
  }
  return null
}

/** 当前时段文案：「高峰时段」「空闲时段」 */
export const peakLabel = (ms: number = Date.now()): string => (isPeakTime(ms) ? '高峰时段' : '空闲时段')

/** 距离下一次切换的短文案，如「42 分钟后转空闲」 */
export const peakSwitchText = (ms: number = Date.now()): string => {
  const next = nextPeakChangeAt(ms)
  if (next === null) {
    return ''
  }
  const minutes = Math.max(1, Math.round((next - ms) / 60000))
  const target = isPeakTime(next) ? '高峰' : '空闲'
  if (minutes < 60) {
    return `${minutes} 分钟后转${target}`
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} 小时后转${target}` : `${hours} 小时 ${rest} 分钟后转${target}`
}
