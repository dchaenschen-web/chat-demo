import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { setupTheme } from './app/theme.js'
import { ensureKatex } from './services/markdown/katex.js'
import './app/theme.css'
import './app/global.css'

ensureKatex()
setupTheme()

createRoot(document.getElementById('root') as HTMLElement).render(<App />)

// 小鲸鱼挂件（可选增强）：等首屏渲染完再装，失败不影响聊天
void import('./services/whale/install.js')
  .then((module) => module.installWhale())
  .catch((error: unknown) => {
    console.warn('[whale] 安装失败', error)
  })
