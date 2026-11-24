package com.dchaenschen.dafeiyu

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64

/**
 * 截屏自动导入：查 MediaStore 里「截屏」目录下新增的图片。
 * Android 14 用户若只给了部分照片权限，查询会返回空，前端回落到相册选择。
 */
object ScreenshotWatcher {

  private const val PREFS = "dafeiyu-screenshots"
  private const val KEY_LAST_ADDED = "last-added"

  private val projection = arrayOf(
    MediaStore.Images.Media._ID,
    MediaStore.Images.Media.DATE_ADDED,
    MediaStore.Images.Media.DISPLAY_NAME,
    MediaStore.Images.Media.RELATIVE_PATH,
    MediaStore.Images.Media.MIME_TYPE,
  )

  private fun isScreenshot(path: String?, name: String?): Boolean {
    val p = (path ?: "").lowercase()
    val n = (name ?: "").lowercase()
    return p.contains("screenshot") || p.contains("截屏") || p.contains("screen_shot") ||
      n.startsWith("screenshot") || n.contains("截屏")
  }

  /** 返回新增截图（content URI 列表），最多 5 张；同时把已读水位推进到最新。 */
  fun fetchNew(context: Context): List<Uri> {
    val last = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getLong(KEY_LAST_ADDED, 0L)
    val collection = if (android.os.Build.VERSION.SDK_INT >= 29) {
      MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
    } else {
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    }
    val found = mutableListOf<Pair<Long, Uri>>()
    var newest = last
    try {
      context.contentResolver.query(
        collection, projection, null, null,
        "${MediaStore.Images.Media.DATE_ADDED} DESC",
      )?.use { cursor ->
        val idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
        val addedCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
        val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
        val pathCol = cursor.getColumnIndex(MediaStore.Images.Media.RELATIVE_PATH)
        var scanned = 0
        while (cursor.moveToNext() && scanned < 60) {
          scanned++
          val added = cursor.getLong(addedCol)
          if (added <= last) break
          val name = cursor.getString(nameCol)
          val path = if (pathCol >= 0) cursor.getString(pathCol) else null
          if (!isScreenshot(path, name)) continue
          val uri = ContentUris.withAppendedId(collection, cursor.getLong(idCol))
          found.add(added to uri)
          if (added > newest) newest = added
        }
      }
    } catch (_: Exception) {
      return emptyList()
    }
    if (found.isEmpty()) return emptyList()
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putLong(KEY_LAST_ADDED, newest).apply()
    return found.sortedByDescending { it.first }.take(5).map { it.second }
  }

  /** 把 content URI 读成 data URL（一次截屏一般 1~5 MB，base64 可接受）。 */
  fun toDataUrl(context: Context, uri: Uri): String? {
    return try {
      val type = context.contentResolver.getType(uri) ?: "image/png"
      val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        ?: return null
      "data:$type;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
    } catch (_: Exception) {
      null
    }
  } catch (_: Exception) {
    null
  }
}
