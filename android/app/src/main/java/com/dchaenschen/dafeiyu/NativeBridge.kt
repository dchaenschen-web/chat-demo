package com.dchaenschen.dafeiyu

import android.content.Intent
import android.os.Build
import android.webkit.JavascriptInterface
import java.net.HttpURLConnection
import java.net.URL

/** WebView <-> 原生 的桥：保活开关 + 余额查询（DeepSeek 的 /user/balance 没有 CORS，必须原生代发）。 */
class NativeBridge(private val activity: MainActivity) {

  @JavascriptInterface
  fun startKeepAlive() {
    try {
      val intent = Intent(activity, KeepAliveService::class.java)
        .setAction(KeepAliveService.ACTION_START)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        activity.startForegroundService(intent)
      } else {
        activity.startService(intent)
      }
    } catch (_: Exception) {
      // 保活失败不影响聊天
    }
  }

  @JavascriptInterface
  fun stopKeepAlive() {
    try {
      activity.stopService(Intent(activity, KeepAliveService::class.java))
    } catch (_: Exception) {
    }
  }

  /** 返回新增截图的 JSON 数组（content:// URI 列表），前端逐个取 data URL 后裁剪。 */
  @JavascriptInterface
  fun fetchNewScreenshots(): String {
    return try {
      val list = ScreenshotWatcher.fetchNew(activity)
      list.joinToString(prefix = "[", postfix = "]", separator = ",") { quote(it.toString()) }
    } catch (_: Exception) {
      "[]"
    }
  }

  /** 读取截图内容为 data URL；失败返回空串。 */
  @JavascriptInterface
  fun readScreenshot(uri: String): String {
    return try {
      ScreenshotWatcher.toDataUrl(activity, android.net.Uri.parse(uri)) ?: ""
    } catch (_: Exception) {
      ""
    }
  }

  /** 返回 JSON 文本；失败时 ok=false。同步阻塞（JS 桥线程），超时 15s。 */
  @JavascriptInterface
  fun fetchBalance(apiKey: String): String {
    if (apiKey.isBlank()) {
      return """{"ok":false,"error":"no api key"}"""
    }
    var connection: HttpURLConnection? = null
    return try {
      connection = (URL("https://api.deepseek.com/user/balance").openConnection() as HttpURLConnection)
      connection.requestMethod = "GET"
      connection.connectTimeout = 8000
      connection.readTimeout = 15000
      connection.setRequestProperty("Authorization", "Bearer $apiKey")
      connection.setRequestProperty("Accept", "application/json")
      val code = connection.responseCode
      val stream = if (code in 200..299) connection.inputStream else connection.errorStream
      val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
      if (code in 200..299) text else """{"ok":false,"status":$code,"body":${quote(text)}}"""
    } catch (error: Exception) {
      """{"ok":false,"error":${quote(error.message ?: "network error")}}"""
    } finally {
      connection?.disconnect()
    }
  }

  private fun quote(text: String): String =
    '"' + text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "") + '"'
}
