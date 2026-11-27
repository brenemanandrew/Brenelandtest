package com.viture.glasses.demo

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.res.ResourcesCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

// Brenai's welcome screen. It sits on top of VITURE's setup screen (which still does the connecting underneath):
// Wizra, "Welcome to BrenAI", a big Play button, and one friendly glasses button that does whatever the next connect step is
// (look for the glasses, connect them, pick look-around or look-and-move, recenter). "Advanced setup" shows VITURE's screen.
class Welcome(private val act: Activity, private val onPlay: () -> Unit) {
    private fun dp(v: Int) = (v * act.resources.displayMetrics.density).toInt()
    private val bangers = font(R.font.bangers)
    private val fredoka = font(R.font.fredoka_medium)
    private val fredokaBold = font(R.font.fredoka_bold)
    private fun font(id: Int): Typeface = try { ResourcesCompat.getFont(act, id) ?: Typeface.DEFAULT_BOLD } catch (_: Exception) { Typeface.DEFAULT_BOLD }

    val root = FrameLayout(act)
    private val statusDot = View(act)
    private val statusText = TextView(act)
    private val actions = LinearLayout(act)
    private val backPill = Button(act)

    private fun pill(fill: Int, stroke: Int = 0, radius: Int = 30) = GradientDrawable().apply {
        cornerRadius = dp(radius).toFloat(); setColor(fill); if (stroke != 0) setStroke(dp(2), stroke)
    }
    private fun text(s: String, size: Float, face: Typeface, color: Int = Color.WHITE) = TextView(act).apply {
        text = s; textSize = size; typeface = face; setTextColor(color); gravity = Gravity.CENTER
    }
    private fun button(label: String, primary: Boolean, onClick: (() -> Unit)?) = Button(act).apply {
        text = label; isAllCaps = false; typeface = fredokaBold; textSize = if (primary) 22f else 17f
        setTextColor(if (primary) Color.WHITE else Color.parseColor("#3b1d5c"))
        background = if (primary) GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(Color.parseColor("#f472b6"), Color.parseColor("#a855f7"))).apply { cornerRadius = dp(32).toFloat() }
                     else pill(Color.parseColor(if (onClick == null) "#B3FFFFFF" else "#F2FFFFFF"))
        stateListAnimator = null; elevation = if (primary) dp(6).toFloat() else 0f
        isEnabled = onClick != null; alpha = if (onClick == null) 0.75f else 1f
        setOnClickListener { onClick?.invoke() }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(if (primary) 64 else 54)).apply { topMargin = dp(10) }
    }

    init {
        root.background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(Color.parseColor("#1f0f3a"), Color.parseColor("#4c1d7a"), Color.parseColor("#c2548f")))
        root.isClickable = true   // the setup screen underneath never gets taps while this is up

        val col = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
        val face = ImageView(act).apply {
            setImageResource(R.drawable.wizra_fg); scaleType = ImageView.ScaleType.CENTER_CROP
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#E9DDF7")); setStroke(dp(4), Color.parseColor("#f9a8d4")) }
            clipToOutline = true; outlineProvider = android.view.ViewOutlineProvider.BACKGROUND; elevation = dp(10).toFloat()
            layoutParams = LinearLayout.LayoutParams(dp(196), dp(196))
        }
        val hello = text("Welcome to", 22f, fredoka, Color.parseColor("#E9DDF7")).apply { layoutParams = LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(22) } }
        val title = text("BrenAI", 76f, bangers).apply { letterSpacing = 0.06f; setShadowLayer(dp(8).toFloat(), 0f, dp(3).toFloat(), Color.parseColor("#80000000")); setPadding(0, 0, 0, 0) }
        val sub = text("Wizra is waiting for you", 18f, fredoka, Color.parseColor("#f5d0fe"))

        val status = LinearLayout(act).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(14), dp(8), dp(16), dp(8)); background = pill(Color.parseColor("#33000000"), radius = 20)
            layoutParams = LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(28); bottomMargin = dp(6) }
        }
        statusDot.background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#fbbf24")) }
        status.addView(statusDot, LinearLayout.LayoutParams(dp(10), dp(10)).apply { marginEnd = dp(10) })
        statusText.apply { textSize = 15f; typeface = fredoka; setTextColor(Color.WHITE) }
        status.addView(statusText)

        val play = button("▶   Play", true) { onPlay() }
        actions.orientation = LinearLayout.VERTICAL
        val advanced = text("Advanced setup", 14f, fredoka, Color.parseColor("#B3FFFFFF")).apply {
            paint.isUnderlineText = true; setPadding(dp(12), dp(14), dp(12), dp(6)); setOnClickListener { showAdvanced(true) }
        }

        val top = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; addView(face); addView(hello); addView(title); addView(sub) }
        val bottom = LinearLayout(act).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
            addView(status); addView(play, LinearLayout.LayoutParams(-1, dp(64)).apply { topMargin = dp(10) }); addView(actions, LinearLayout.LayoutParams(-1, -2)); addView(advanced)
        }
        col.addView(View(act), LinearLayout.LayoutParams(1, 0, 1f))
        col.addView(top)
        col.addView(View(act), LinearLayout.LayoutParams(1, 0, 1.2f))
        col.addView(bottom, LinearLayout.LayoutParams(-1, -2))
        val frame = FrameLayout(act)
        frame.addView(col, FrameLayout.LayoutParams(dp(420).coerceAtMost(act.resources.displayMetrics.widthPixels), -1, Gravity.CENTER_HORIZONTAL))
        root.addView(frame, FrameLayout.LayoutParams(-1, -1))
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, ins ->   // keep clear of the status bar and the navigation buttons
            val b = ins.getInsets(WindowInsetsCompat.Type.systemBars()); v.setPadding(dp(24), b.top + dp(12), dp(24), b.bottom + dp(16)); ins
        }

        backPill.apply {
            text = "← BrenAI"; isAllCaps = false; typeface = fredokaBold; textSize = 15f; setTextColor(Color.WHITE)
            background = pill(Color.parseColor("#a855f7"), radius = 22); stateListAnimator = null; visibility = View.GONE
            setOnClickListener { showAdvanced(false) }
        }
    }

    /** Puts the welcome screen over the activity's own screen. */
    fun attach() {
        act.addContentView(root, ViewGroup.LayoutParams(-1, -1))
        act.addContentView(backPill, FrameLayout.LayoutParams(-2, dp(44), Gravity.TOP or Gravity.END).apply { setMargins(0, dp(40), dp(16), 0) })
    }
    fun showAdvanced(on: Boolean) { root.visibility = if (on) View.GONE else View.VISIBLE; backPill.visibility = if (on) View.VISIBLE else View.GONE }

    /** The glasses line: what is going on, whether it is good news, and the buttons for the next step (null action = greyed out). */
    fun set(status: String, ok: Boolean, buttons: List<Pair<String, (() -> Unit)?>>) {
        statusText.text = status
        (statusDot.background as GradientDrawable).setColor(Color.parseColor(if (ok) "#4ade80" else "#fbbf24"))
        actions.removeAllViews()
        if (buttons.size == 2 && buttons.all { it.first.length <= 22 }) {   // two short choices side by side
            val row = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL }
            buttons.forEachIndexed { i, (l, a) -> row.addView(button(l, false, a), LinearLayout.LayoutParams(0, dp(54), 1f).apply { topMargin = dp(10); if (i == 0) marginEnd = dp(10) }) }
            actions.addView(row)
        } else buttons.forEach { (l, a) -> actions.addView(button(l, false, a)) }
    }
}
