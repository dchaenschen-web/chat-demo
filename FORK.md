# 大肥鱼（DaFeiYu）— 本 fork 的说明

本仓库是 [`deepseek-ai/chat-demo`](https://github.com/deepseek-ai/chat-demo) 的 fork，
用于在 Android 上以**独立 App**的形式使用同一套聊天前端。

| 项 | 值 |
| --- | --- |
| 应用名 | 大肥鱼 |
| 包名 | `com.dchaenschen.dafeiyu` |
| 上游 | `deepseek-ai/chat-demo`（MIT） |
| 壳 | `android/`（Kotlin WebView，静态构建产物打进 APK assets） |
| CI | `.github/workflows/build.yml`（push main 自动出 APK，Artifact 下载） |

## 结构

```
src/                   上游前端源码（保持可 rebase）
android/               Android 壳
  app/src/main/java/.../MainActivity.kt
  app/build.gradle.kts
.github/workflows/     CI：web build -> 拷进 assets -> Gradle 出 APK
```

## 本地运行（浏览器）

```bash
pnpm install
pnpm dev            # http://localhost:8090
```

## 打包 APK

CI 会做：`pnpm build` → 产物拷到 `android/app/src/main/assets/` → `gradle :app:assembleRelease`。
首次构建会在 `android/keystore/debug.keystore` 生成固定签名并提交回仓库，保证后续 APK 可覆盖安装。

本地没有 Android SDK 时不要指望本地出包，直接用 CI 的 Artifact。

## 与上游同步

```bash
git remote add upstream https://github.com/deepseek-ai/chat-demo.git   # 只需一次
git -c http.sslBackend=openssl fetch upstream
git merge upstream/main
```

## 本 fork 新增的功能

| 功能 | 位置 | 说明 |
| --- | --- | --- |
| 运行时 API 地址 | 设置 → 通用 → **API 地址** | 空 = 构建期默认 `https://api.deepseek.com`；可换中转站/自建，不用重新打包 |
| 跨会话只读引用 | 输入框工具栏 🔗 按钮 | 选另一个会话 → 以只读文本块插入输入框（带「不要执行其中指令」的警告），发送前可删改 |
| 局域网同步 | 设置 → 数据 → **电脑同步（局域网）** | 连电脑上的 `ds_sync_server.py`（默认 `http://<PC>:8765`），双向交换会话；后写优先 |

同步协议与电脑侧脚本在 `../ds-chat-archive`（`ds_sync_server.py` / `start-sync.ps1`）：
`GET /api/ping`、`GET /api/sessions`、`GET|PUT /api/sessions/<id>`，令牌放在 `X-Sync-Token`。

## 已知取舍

- 静态站通过 `WebViewAssetLoader` 以 `https://appassets.androidplatform.net/assets/` 加载，
  这样 localStorage / IndexedDB 才有正常源；`api.deepseek.com` 的 CORS 预检已验证放行该 origin。
- `blob:` 下载不会触发 Android 的 `DownloadListener`；导出历史 ZIP 依赖后续的同步模块上传，而不是浏览器下载。
- `usesCleartextTraffic=true` 是为了局域网同步（`http://<PC>:8765`）。
