package com.viture.glasses.demo

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

// Brenai: a short log of what the glasses connection is doing (each setup step, every USB device that comes and goes, the glasses'
// screen appearing, errors), sent to brenai.fly.dev/api/clientlog every few seconds so a device we cannot see can be worked out.
// Nothing personal is sent: the device model, the steps, and USB vendor and product numbers.
object Diag {
    private val buf = JSONArray(); private var sent = 0; private var t0 = System.currentTimeMillis()
    @Volatile private var started = false
    fun log(ev: String, extra: Map<String, Any?> = emptyMap()) {
        val o = JSONObject().put("t", (System.currentTimeMillis() - t0) / 100 / 10.0).put("ev", ev)
        for ((k, v) in extra) o.put(k, v)
        synchronized(buf) { if (buf.length() < 30) buf.put(o) }
    }
    fun dev(d: UsbDevice) = "${d.vendorId.toString(16)}:${d.productId.toString(16)} ${d.productName ?: ""}".trim()
    fun start(ctx: Context) {
        if (started) return; started = true; t0 = System.currentTimeMillis()
        log("start", mapOf("model" to Build.MODEL, "android" to Build.VERSION.RELEASE))
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) {
                val d = i.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE)
                log(if (i.action == UsbManager.ACTION_USB_DEVICE_ATTACHED) "usb-on" else "usb-off", mapOf("dev" to (d?.let { dev(it) } ?: "?")))
            }
        }
        val f = IntentFilter().apply { addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED); addAction(UsbManager.ACTION_USB_DEVICE_DETACHED) }
        try { if (Build.VERSION.SDK_INT >= 33) ctx.applicationContext.registerReceiver(r, f, Context.RECEIVER_EXPORTED) else ctx.applicationContext.registerReceiver(r, f) } catch (_: Exception) {}
        Thread({
            while (sent < 40) {
                try { Thread.sleep(3000) } catch (_: Exception) {}
                val body: String = synchronized(buf) { if (buf.length() == 0) "" else { val s = JSONObject().put("glassesLog", JSONArray(buf.toString())).put("ua", "BrenaiApp " + Build.MODEL).toString(); while (buf.length() > 0) buf.remove(0); s } }
                if (body.isEmpty()) continue
                try {
                    val c = java.net.URL("https://brenai.fly.dev/api/clientlog").openConnection() as java.net.HttpURLConnection
                    c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 8000; c.readTimeout = 8000; c.setRequestProperty("content-type", "text/plain")
                    c.outputStream.use { it.write(body.toByteArray()) }; c.responseCode; c.disconnect(); sent++
                } catch (_: Exception) {}
            }
        }, "brenai-diag").apply { isDaemon = true }.start()
    }
}
