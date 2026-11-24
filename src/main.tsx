import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { setupTheme } from './app/theme.js'
import { ensureKatex } from './services/markdown/katex.js'
import { setupKeepAlive } from './services/native/keepAlive.js'
import { setupScreenshotImport } from './services/native/screenshots.js'
import './app/theme.css'
import './app/global.css'

ensureKatex()
setupTheme()

createRoot(document.getElementById('root') as HTMLElement).render(<App />)

// 原生壳：流式回复期间保活（息屏/切后台不中断）
setupKeepAlive()

// 原生壳：截屏自动导入（回到前台时检查新截图）
setupScreenshotImport()

// 小鲸鱼挂件（可选增强）：等首屏渲染完再装，失败不影响聊天
void import('./services/whale/install.js')
  .then((module) => module.installWhale())
  .catch((error: unknown) => {
    console.warn('[whale] 安装失败', error)
  })
