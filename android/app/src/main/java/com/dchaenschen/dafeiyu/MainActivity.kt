package com.dchaenschen.dafeiyu

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

/**
 * 大肥鱼：把 chat-demo 的静态构建打进 assets，用 WebViewAssetLoader 以
 * https://appassets.androidplatform.net 作为源加载（localStorage / IndexedDB 才能正常工作）。
 */
class MainActivity : AppCompatActivity() {

  private lateinit var webView: WebView
  private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
  private var pendingPermissionRequest: PermissionRequest? = null

  private val fileChooserLauncher =
    registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
      val callback = fileChooserCallback
      fileChooserCallback = null
      if (callback == null) return@registerForActivityResult
      val data = result.data
      if (result.resultCode != RESULT_OK || data == null) {
        callback.onReceiveValue(null)
        return@registerForActivityResult
      }
      val clip = data.clipData
      val uris: Array<Uri> =
        if (clip != null) Array(clip.itemCount) { clip.getItemAt(it).uri }
        else listOfNotNull(data.data).toTypedArray()
      callback.onReceiveValue(uris)
    }

  private val micPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      val request = pendingPermissionRequest
      pendingPermissionRequest = null
      if (granted) request?.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
      else {
        request?.deny()
        Toast.makeText(this, "没有麦克风权限，语音输入不可用", Toast.LENGTH_SHORT).show()
      }
    }

  private val notifyPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    webView = WebView(this)
    setContentView(webView)

    val settings: WebSettings = webView.settings
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true
    settings.databaseEnabled = true
    settings.mediaPlaybackRequiresUserGesture = false
    settings.allowFileAccess = false
    settings.allowContentAccess = false
    settings.setSupportZoom(false)
    settings.userAgentString = settings.userAgentString + " DaFeiYu/1.0"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      settings.safeBrowsingEnabled = true
    }
    CookieManager.getInstance().setAcceptCookie(true)
    webView.addJavascriptInterface(NativeBridge(this), "DaFeiYuNative")

    // 页面源是 https://appassets.androidplatform.net，而局域网同步走 http://<PC>:8765。
    // Android WebView 默认把「HTTPS 页面发 HTTP 请求」当混合内容直接拦掉，必须显式放开。
    settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW

    val assetLoader =
      WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
        .build()

    webView.webViewClient =
      object : WebViewClientCompat() {
        override fun shouldInterceptRequest(
          view: WebView,
          request: WebResourceRequest
        ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

        override fun shouldOverrideUrlLoading(
          view: WebView,
          request: WebResourceRequest
        ): Boolean {
          val url = request.url
          // 本地静态资源留在 WebView；外部链接交给系统浏览器/对应 App
          if (url.host == "appassets.androidplatform.net") return false
          return try {
            startActivity(Intent(Intent.ACTION_VIEW, url))
            true
          } catch (_: ActivityNotFoundException) {
            Toast.makeText(this@MainActivity, "没有能打开这个链接的应用", Toast.LENGTH_SHORT).show()
            true
          }
        }
      }

    webView.webChromeClient =
      object : WebChromeClient() {
        override fun onShowFileChooser(
          view: WebView,
          callback: ValueCallback<Array<Uri>>,
          params: FileChooserParams
        ): Boolean {
          fileChooserCallback?.onReceiveValue(null)
          fileChooserCallback = callback
          return try {
            fileChooserLauncher.launch(params.createIntent())
            true
          } catch (_: ActivityNotFoundException) {
            fileChooserCallback = null
            false
          }
        }

        override fun onPermissionRequest(request: PermissionRequest) {
          val audio = request.resources.any { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }
          if (!audio) {
            request.deny()
            return
          }
          if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO) ==
              PackageManager.PERMISSION_GRANTED) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
          } else {
            pendingPermissionRequest = request
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
          }
        }
      }

    // 普通链接下载（blob: 导出由前端 sync 模块直接上传，不依赖下载器）
    webView.setDownloadListener { url, _, contentDisposition, mimeType, _ ->
      try {
        val request = DownloadManager.Request(Uri.parse(url))
        request.setMimeType(mimeType)
        val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        Toast.makeText(this, "开始下载：$name", Toast.LENGTH_SHORT).show()
      } catch (e: Exception) {
        Toast.makeText(this, "下载失败：${e.message}", Toast.LENGTH_SHORT).show()
      }
    }

    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          if (webView.canGoBack()) webView.goBack() else finish()
        }
      }
    )

    if (Build.VERSION.SDK_INT >= 33 &&
        ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
          PackageManager.PERMISSION_GRANTED) {
      notifyPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    if (savedInstanceState != null) {
      webView.restoreState(savedInstanceState)
    } else {
      webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
    }
  }

  override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    webView.saveState(outState)
  }

  override fun onDestroy() {
    fileChooserCallback?.onReceiveValue(null)
    fileChooserCallback = null
    pendingPermissionRequest = null
    webView.destroy()
    super.onDestroy()
  }
}
