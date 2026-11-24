package com.dchaenschen.dafeiyu

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/**
 * 流式回复期间的前台服务：避免息屏 / 切后台时被系统冻结，回复可以继续收完。
 * 由 web 侧通过 JS 桥在开始/结束流式时启动和停止。
 */
class KeepAliveService : Service() {

  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      releaseWakeLock()
      stopSelf()
      return START_NOT_STICKY
    }
    startForeground(NOTIFICATION_ID, buildNotification())
    acquireWakeLock()
    return START_NOT_STICKY
  }

  private fun buildNotification(): Notification {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        manager.createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "回复进行中", NotificationManager.IMPORTANCE_MIN)
        )
      }
    }
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
        .setContentTitle("正在接收回复")
        .setContentText("锁屏或切到后台也会继续，完成后自动消失")
        .setSmallIcon(android.R.drawable.stat_notify_sync)
        .setOngoing(true)
        .build()
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
        .setContentTitle("正在接收回复")
        .setContentText("锁屏或切到后台也会继续，完成后自动消失")
        .setSmallIcon(android.R.drawable.stat_notify_sync)
        .setOngoing(true)
        .build()
    }
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock =
      power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dafeiyu:reply").apply {
        setReferenceCounted(false)
        acquire(10 * 60 * 1000L)
      }
  }

  private fun releaseWakeLock() {
    try {
      if (wakeLock?.isHeld == true) wakeLock?.release()
    } catch (_: Exception) {
    }
    wakeLock = null
  }

  override fun onDestroy() {
    releaseWakeLock()
    super.onDestroy()
  }

  companion object {
    const val CHANNEL_ID = "dafeiyu-reply"
    const val NOTIFICATION_ID = 1001
    const val ACTION_START = "com.dchaenschen.dafeiyu.KEEP_ALIVE_START"
    const val ACTION_STOP = "com.dchaenschen.dafeiyu.KEEP_ALIVE_STOP"
  }
}
