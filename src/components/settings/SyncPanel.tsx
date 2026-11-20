import { useState, type CSSProperties } from 'react'
import { Button } from '../base/Button.js'
import { initChat } from '../../services/chat/store.js'
import { pingSync, syncOnce } from '../../services/sync/sync.js'
import {
  setApiOrigin,
  setSyncEndpoint,
  setSyncToken,
  useSettings,
} from '../../services/settings.js'
import styles from './Settings.module.css'

const input: CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border, #d0d5dd)',
  background: 'transparent',
  font: 'inherit',
  color: 'inherit',
}

const field: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  flex: '1 1 260px',
}

const actions: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }

/** 自定义 API 基址（换 provider / 中转站，不用重新打包） */
export const ApiOriginSetting = () => {
  const stored = useSettings((state) => state.apiOrigin)
  const [value, setValue] = useState(stored ?? '')
  const [status, setStatus] = useState<string | null>(null)

  const save = (next: string) => {
    setValue(next)
    setApiOrigin(next)
    setStatus(next.trim() ? `已保存，下一个请求生效：${next.trim()}` : '已恢复默认地址')
  }

  return (
    <div className={styles.cell} style={{ ...field, gap: 10 }}>
      <div className={styles.label} style={{ flexBasis: '100%' }}>
        API 地址
      </div>
      <div style={actions}>
        <input
          style={input}
          value={value}
          spellCheck={false}
          placeholder="默认 https://api.deepseek.com"
          onChange={(event) => save(event.target.value)}
        />
        <Button variant="outlined" size="m" onClick={() => save('')}>
          恢复默认
        </Button>
      </div>
      <div className={styles.description}>
        {status ??
          '留空使用构建期默认值。只改基址，不校验连通性；填了中转站地址后请自己发一条消息验证。'}
      </div>
    </div>
  )
}

/** 局域网同步：连电脑上的 ds_sync_server.py，双向交换会话 */
export const SyncSetting = () => {
  const endpoint = useSettings((state) => state.syncEndpoint)
  const token = useSettings((state) => state.syncToken)
  const [busy, setBusy] = useState<'ping' | 'sync' | null>(null)
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null)

  const run = async (kind: 'ping' | 'sync') => {
    if (!endpoint || !token) {
      setStatus({ text: '先填地址和令牌', error: true })
      return
    }
    setBusy(kind)
    setStatus(null)
    try {
      if (kind === 'ping') {
        const result = await pingSync(endpoint, token)
        setStatus({ text: `已连接 ${result.host}（工作区 ${result.workspace}）`, error: false })
      } else {
        const result = await syncOnce(endpoint, token, (text) => setStatus({ text, error: false }))
        const summary = `拉取 ${result.pulled} · 上传 ${result.pushed} · 跳过 ${result.skipped}`
        if (result.errors.length > 0) {
          setStatus({ text: `${summary}；失败 ${result.errors.length}：${result.errors[0]}`, error: true })
        } else {
          setStatus({ text: summary, error: false })
          if (result.pulled > 0) {
            void initChat()
          }
        }
      }
    } catch (error) {
      setStatus({
        text: `失败：${error instanceof Error ? error.message : String(error)}`,
        error: true,
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={styles.cell} style={{ ...field, gap: 10 }}>
      <div className={styles.label} style={{ flexBasis: '100%' }}>
        电脑同步（局域网）
      </div>
      <div style={actions}>
        <input
          style={input}
          value={endpoint ?? ''}
          spellCheck={false}
          placeholder="http://192.168.178.22:8765"
          onChange={(event) => setSyncEndpoint(event.target.value)}
        />
      </div>
      <div style={actions}>
        <input
          style={input}
          value={token ?? ''}
          spellCheck={false}
          placeholder="同步令牌（电脑上 ~/.dsh/lan-sync/token）"
          onChange={(event) => setSyncToken(event.target.value)}
        />
      </div>
      <div style={actions}>
        <Button
          variant="outlined"
          size="m"
          disabled={busy !== null}
          onClick={() => void run('ping')}
        >
          测试连接
        </Button>
        <Button variant="primary" size="m" disabled={busy !== null} onClick={() => void run('sync')}>
          {busy === 'sync' ? '同步中…' : '立即同步'}
        </Button>
      </div>
      <div
        className={styles.description}
        style={status?.error ? { color: 'var(--danger, #d92d20)' } : undefined}
      >
        {status?.text ??
          '手机与电脑在同一 WiFi、电脑上已双击「启动同步服务.cmd」时可用。后写优先：同一会话两边都改会以较新一侧为准。'}
      </div>
    </div>
  )
}
