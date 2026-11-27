// Brenai: the game, in this app. A full-screen web view of brenai.fly.dev (everything still comes from the server: the game, saves,
// chat, updates), with the glasses' head pose handed straight to the page: the page calls BrenaiNative.pose() every frame and gets
// {"yaw","pitch","roll"} in degrees and "pos":[x,y,z] in metres (6DOF), or "" when there is nothing. No sockets, no other app.
package com.viture.glasses.demo

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class GameActivity : AppCompatActivity() {
    private lateinit var web: WebView

    class Bridge {
        @JavascriptInterface fun pose(): String = PoseServer.json() ?: ""
        @JavascriptInterface fun recenter(): Int = try { GlassesBridge.resetOriginCarina() } catch (_: Throwable) { -1 }
        @JavascriptInterface fun version(): String = "brenai-app-1"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        web = WebView(this); setContentView(web)
        web.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        val s = web.settings
        s.javaScriptEnabled = true; s.domStorageEnabled = true; s.mediaPlaybackRequiresUserGesture = false; s.databaseEnabled = true
        s.cacheMode = WebSettings.LOAD_DEFAULT; s.userAgentString = s.userAgentString + " BrenaiApp/1"
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        WebView.setWebContentsDebuggingEnabled(true)
        web.addJavascriptInterface(Bridge(), "BrenaiNative")
        web.webViewClient = WebViewClient()
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {   // the camera, for hand control
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) request.grant(request.resources)
                else { pending = request; requestPermissions(arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO), 11) }
            }
        }
        if (savedInstanceState == null) web.loadUrl(intent?.getStringExtra("url") ?: "https://brenai.fly.dev/") else web.restoreState(savedInstanceState)
    }
    private var pending: PermissionRequest? = null
    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, perms, results)
        pending?.let { if (results.isNotEmpty() && results[0] == PackageManager.PERMISSION_GRANTED) it.grant(it.resources) else it.deny() }; pending = null
    }
    override fun onSaveInstanceState(out: Bundle) { super.onSaveInstanceState(out); web.saveState(out) }
    @Deprecated("back")
    override fun onBackPressed() { if (web.canGoBack()) web.goBack() else super.onBackPressed() }
    override fun onPause() { super.onPause(); CookieManager.getInstance().flush() }
}
