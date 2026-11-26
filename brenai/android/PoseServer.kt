// Brenai: hands the glasses' head pose to the game page in Chrome on this device, over ws://127.0.0.1:8766 (only this device can
// connect). Messages: {"yaw":..,"pitch":..,"roll":..} in degrees, plus "pos":[x,y,z] in metres while tracking in 6DOF. The page's
// stereo.js listens there while 3D glasses mode is on. Same format as tools/viture-bridge.py on the PC.
package com.viture.glasses.demo

import android.util.Base64
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.math.asin
import kotlin.math.atan2

object PoseServer {
    private val clients = CopyOnWriteArrayList<OutputStream>()
    @Volatile private var running = false
    @Volatile var connected = 0; private set

    private var onConnect: ((Int) -> Unit)? = null
    @Volatile var lastError = ""; private set

    fun start(cb: ((Int) -> Unit)? = null) {
        onConnect = cb
        if (running) return; running = true
        Thread({
            try {
                val server = ServerSocket(8766, 8, InetAddress.getLoopbackAddress())
                while (running) { val s = server.accept(); Thread({ handshake(s) }, "brenai-ws-hs").start() }
            } catch (e: Exception) { lastError = e.toString(); running = false }
        }, "brenai-ws").start()
        Thread({
            while (running) {
                try { tick() } catch (_: Exception) {}
                Thread.sleep(16)
            }
        }, "brenai-pose").start()
    }

    private fun handshake(s: Socket) {
        try {
            val inp = s.getInputStream(); val sb = StringBuilder(); val buf = ByteArray(2048)
            while (!sb.contains("\r\n\r\n")) { val n = inp.read(buf); if (n <= 0) { s.close(); return }; sb.append(String(buf, 0, n, Charsets.ISO_8859_1)) }
            val key = sb.lines().firstOrNull { it.lowercase().startsWith("sec-websocket-key:") }?.substringAfter(':')?.trim() ?: run { s.close(); return }
            val acc = Base64.encodeToString(MessageDigest.getInstance("SHA-1").digest((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").toByteArray()), Base64.NO_WRAP)
            val out = s.getOutputStream()
            out.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: $acc\r\n\r\n".toByteArray()); out.flush()
            s.tcpNoDelay = true; clients.add(out); connected = clients.size; onConnect?.invoke(connected)
        } catch (_: Exception) { try { s.close() } catch (_: Exception) {} }
    }

    /** The pose as the page wants it, or null when there is none (not tracking yet, or not a Luma Ultra). */
    fun json(): String? {
        if (GlassesBridge.getDeviceType() != GlassesBridge.DEVICE_TYPE_CARINA) return null
        val p = GlassesBridge.getPose(); if (p.size < 7) return null
        val px = p[0]; val py = p[1]; val pz = p[2]; val w = p[3]; val x = p[4]; val y = p[5]; val z = p[6]
        if (w == 0f && x == 0f && y == 0f && z == 0f) return null
        val k = 180.0 / Math.PI
        val pitch = asin((2 * (w * x - y * z)).toDouble().coerceIn(-1.0, 1.0)) * k
        val yaw = atan2((2 * (x * z + w * y)).toDouble(), (1 - 2 * (x * x + y * y)).toDouble()) * k
        val roll = atan2((2 * (x * y + w * z)).toDouble(), (1 - 2 * (x * x + z * z)).toDouble()) * k
        return String.format(java.util.Locale.US, "{\"yaw\":%.3f,\"pitch\":%.3f,\"roll\":%.3f,\"pos\":[%.4f,%.4f,%.4f]}", yaw, pitch, roll, px, py, pz)
    }

    private fun tick() {
        if (clients.isEmpty()) return
        if (GlassesBridge.getDeviceType() != GlassesBridge.DEVICE_TYPE_CARINA) return
        val p = GlassesBridge.getPose(); if (p.size < 7) return
        val px = p[0]; val py = p[1]; val pz = p[2]; val w = p[3]; val x = p[4]; val y = p[5]; val z = p[6]
        if (w == 0f && x == 0f && y == 0f && z == 0f) return
        val k = 180.0 / Math.PI   // the same sums as the page and the PC helper: OpenGL axes, x right, y up, z toward the wearer
        val pitch = asin((2 * (w * x - y * z)).toDouble().coerceIn(-1.0, 1.0)) * k
        val yaw = atan2((2 * (x * z + w * y)).toDouble(), (1 - 2 * (x * x + y * y)).toDouble()) * k
        val roll = atan2((2 * (x * y + w * z)).toDouble(), (1 - 2 * (x * x + z * z)).toDouble()) * k
        val msg = String.format(java.util.Locale.US, "{\"yaw\":%.3f,\"pitch\":%.3f,\"roll\":%.3f,\"pos\":[%.4f,%.4f,%.4f]}", yaw, pitch, roll, px, py, pz)
        val b = msg.toByteArray(); val frame = ByteArray(2 + b.size); frame[0] = 0x81.toByte(); frame[1] = b.size.toByte(); System.arraycopy(b, 0, frame, 2, b.size)
        for (o in clients) { try { o.write(frame); o.flush() } catch (_: Exception) { clients.remove(o); connected = clients.size } }
    }
}
