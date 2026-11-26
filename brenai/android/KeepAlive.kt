// Brenai: keeps this app (and the head-pose link to Chrome) running while you use the game in Chrome. Android pauses or ends apps that
// are not in front; a foreground service with a small notification tells it this one is in use.
package com.viture.glasses.demo

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

class KeepAlive : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            val nm = getSystemService(NotificationManager::class.java)
            if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel("brenai", "Brenai head tracking", NotificationManager.IMPORTANCE_LOW))
            val n = (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "brenai") else Notification.Builder(this))
                .setContentTitle("Brenai Glasses").setContentText("Sending head tracking to the game in Chrome").setSmallIcon(android.R.drawable.ic_menu_view).setOngoing(true).build()
            if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE) else startForeground(1, n)
        } catch (_: Exception) {}
        return START_STICKY
    }
}
