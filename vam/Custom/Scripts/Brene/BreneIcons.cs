// Brene for Virt-a-Mate: simple flat icons, drawn in code (no picture files): white shapes on a clear background, tinted by the
// theme where they are used. Built from a few shapes (discs, rings, rounded boxes, thick lines), each smoothed at its edge.
//   phone, person, scene, glasses, book, tools, help, edit, ring, layout   the dock buttons and the panels' title bars
//   disc, halo, glow   round chips, the hand markers' ring and soft glow
//   box, check         the tutorial card's tick box
// Kept to C# 5 and plain Unity calls (Texture2D.SetPixels32, Sprite.Create), the same as Theme.Round.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Brene
{
    public static class BreneIcons
    {
        const int N = 64;
        static readonly Dictionary<string, Sprite> made = new Dictionary<string, Sprite>();

        // which icon goes with which button and which panel
        public static string ForAct(string id)
        {
            switch (id)
            {
                case "radial": return "ring";
                case "tools": return "tools";
                case "chat": return "phone";
                case "character": return "person";
                case "sceneflow": return "scene";
                case "glassflow": return "glasses";
                case "story": return "book";
                case "help": return "help";
                case "edit": return "edit";
                case "panels": return "layout";
                default: return null;
            }
        }
        public static string ForPanel(string id)
        {
            switch (id)
            {
                case "scene": case "sceneflow": case "pickscene": return "scene";
                case "glasses": case "glassflow": return "glasses";
                case "layout": case "vammenu": return "layout";
                case "people": case "character": return "person";
                case "chat": return "phone";
                case "story": case "laptop": return "book";
                case "help": case "choice": return "help";
                case "dock": return "ring";
                default: return "tools";
            }
        }

        public static Sprite Get(string name)
        {
            Sprite s; if (made.TryGetValue(name, out s) && s != null) return s;
            var a = new float[N * N];
            Draw(name, a);
            var tex = new Texture2D(N, N, TextureFormat.RGBA32, false); tex.wrapMode = TextureWrapMode.Clamp;
            var px = new Color32[N * N];
            for (int i = 0; i < a.Length; i++) px[i] = new Color32(255, 255, 255, (byte)(255 * Mathf.Clamp01(a[i])));
            tex.SetPixels32(px); tex.Apply();
            s = Sprite.Create(tex, new Rect(0, 0, N, N), new Vector2(0.5f, 0.5f), 100, 0, SpriteMeshType.FullRect, new Vector4(0, 0, 0, 0));
            made[name] = s; return s;
        }

        static void Draw(string name, float[] a)
        {
            switch (name)
            {
                case "phone":
                    RBoxLine(a, 19, 5, 45, 59, 7, 4.5f); Disc(a, 32, 12, 3.2f); Seg(a, 28, 52, 36, 52, 3f); break;
                case "person":
                    Disc(a, 32, 44, 11); RBox(a, 13, 5, 51, 31, 13); break;
                case "scene":   // a clapperboard
                    RBox(a, 7, 6, 57, 38, 4); Seg(a, 9, 46, 55, 56, 9);
                    Cut(a, 20, 41, 26, 58, 3.5f); Cut(a, 33, 44, 39, 61, 3.5f); Cut(a, 46, 47, 52, 63, 3.5f); break;
                case "glasses":
                    Ring(a, 19, 30, 10, 4.5f); Ring(a, 45, 30, 10, 4.5f); Seg(a, 28, 33, 36, 33, 3.5f); Seg(a, 9, 32, 3, 42, 3.5f); Seg(a, 55, 32, 61, 42, 3.5f); break;
                case "book":
                    RBoxLine(a, 5, 11, 32, 53, 3, 4); RBoxLine(a, 32, 11, 59, 53, 3, 4); Seg(a, 32, 9, 32, 55, 3.5f);
                    Seg(a, 12, 40, 25, 40, 2.5f); Seg(a, 12, 31, 25, 31, 2.5f); Seg(a, 12, 22, 25, 22, 2.5f); Seg(a, 39, 40, 52, 40, 2.5f); Seg(a, 39, 31, 52, 31, 2.5f); Seg(a, 39, 22, 52, 22, 2.5f); break;
                case "tools":   // a grid of four
                    RBox(a, 8, 8, 28, 28, 4); RBox(a, 36, 8, 56, 28, 4); RBox(a, 8, 36, 28, 56, 4); RBox(a, 36, 36, 56, 56, 4); break;
                case "help":   // a question mark
                    Arc(a, 32, 41, 12, 6.5f, -60, 200); Seg(a, 38, 30.6f, 32, 23, 6.5f); Disc(a, 32, 10, 4.5f); break;
                case "edit":   // a pencil
                    Seg(a, 16, 16, 47, 47, 11); Seg(a, 9, 9, 15, 15, 4.5f); Cut(a, 38, 52, 52, 38, 2.5f); break;
                case "ring":   // the radial menu
                    Ring(a, 32, 32, 21, 7); Disc(a, 32, 32, 5.5f); break;
                case "layout":
                    RBoxLine(a, 5, 8, 59, 56, 5, 4.5f); Seg(a, 24, 9, 24, 55, 4); Seg(a, 25, 32, 58, 32, 4); break;
                case "box":
                    RBoxLine(a, 9, 9, 55, 55, 7, 5); break;
                case "check":
                    RBoxLine(a, 9, 9, 55, 55, 7, 5); Seg(a, 18, 33, 28, 22, 6.5f); Seg(a, 28, 22, 46, 45, 6.5f); break;
                case "disc":
                    Disc(a, 32, 32, 31.5f); break;
                case "halo":
                    Ring(a, 32, 32, 26, 7); break;
                case "glow":   // soft, brightest in the middle
                    for (int y = 0; y < N; y++) for (int x = 0; x < N; x++) { float d = Len(x + 0.5f - 32, y + 0.5f - 32) / 32f; float v = Mathf.Clamp01(1 - d); a[y * N + x] = v * v; }
                    break;
                default:
                    Disc(a, 32, 32, 20); break;
            }
        }

        // ---- shapes: each adds its coverage (a smooth edge half a pixel wide); Cut takes it away ----
        static float Len(float x, float y) { return Mathf.Sqrt(x * x + y * y); }
        static void Put(float[] a, int x, int y, float cover) { int i = y * N + x; if (cover > a[i]) a[i] = cover; }
        static void Disc(float[] a, float cx, float cy, float r)
        {
            for (int y = 0; y < N; y++) for (int x = 0; x < N; x++) Put(a, x, y, Mathf.Clamp01(r - Len(x + 0.5f - cx, y + 0.5f - cy) + 0.5f));
        }
        static void Ring(float[] a, float cx, float cy, float r, float w)
        {
            for (int y = 0; y < N; y++) for (int x = 0; x < N; x++) Put(a, x, y, Mathf.Clamp01(w / 2 - Mathf.Abs(Len(x + 0.5f - cx, y + 0.5f - cy) - r) + 0.5f));
        }
        // a ring only between two angles (degrees, 0 = right, counter-clockwise)
        static void Arc(float[] a, float cx, float cy, float r, float w, float from, float to)
        {
            for (int y = 0; y < N; y++) for (int x = 0; x < N; x++)
            {
                float dx = x + 0.5f - cx, dy = y + 0.5f - cy; float ang = Mathf.Atan2(dy, dx) * 57.2958f;
                if (ang < from) ang += 360; if (ang > to) continue;
                Put(a, x, y, Mathf.Clamp01(w / 2 - Mathf.Abs(Len(dx, dy) - r) + 0.5f));
            }
        }
        static float SegDist(float px, float py, float x1, float y1, float x2, float y2)
        {
            float vx = x2 - x1, vy = y2 - y1, len2 = vx * vx + vy * vy;
            float t = len2 > 0 ? Mathf.Clamp01(((px - x1) * vx + (py - y1) * vy) / len2) : 0;
            return Len(px - (x1 + t * vx), py - (y1 + t * vy));
        }
        static void Seg(float[] a, float x1, float y1, float x2, float y2, float w)
        {
            for (int y = 0; y < N; y++) for (int x = 0; x < N; x++) Put(a, x, y, Mathf.Clamp01(w / 2 - SegDist(x + 0.5f, y + 0.5f, x1, y1, x2, y2) + 0.5f));
        }
        static void Cut(float[] a, float x1, float y1, float x2, float y2, float w)
        {
            for (int y = 0; y < N; y++) for (int x = 0; x < N; x++)
            {
                float c = Mathf.Clamp01(w / 2 - SegDist(x + 0.5f, y + 0.5f, x1, y1, x2, y2) + 0.5f); int i = y * N + x;
                a[i] = Mathf.Min(a[i], 1 - c);
            }
        }
        // signed distance to a rounded box (negative inside)
        static float BoxDist(float px, float py, float x0, float y0, float x1, float y1, float r)
        {
            float cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r;
            float qx = Mathf.Abs(px - cx) - hx, qy = Mathf.Abs(py - cy) - hy;
            return Len(Mathf.Max(qx, 0), Mathf.Max(qy, 0)) + Mathf.Min(Mathf.Max(qx, qy), 0) - r;
        }
        static void RBox(float[] a, float x0, float y0, float x1, float y1, float r)
        {
            for (int y = 0; y < N; y++) for (int x = 0; x < N; x++) Put(a, x, y, Mathf.Clamp01(0.5f - BoxDist(x + 0.5f, y + 0.5f, x0, y0, x1, y1, r)));
        }
        static void RBoxLine(float[] a, float x0, float y0, float x1, float y1, float r, float w)
        {
            for (int y = 0; y < N; y++) for (int x = 0; x < N; x++) Put(a, x, y, Mathf.Clamp01(w / 2 - Mathf.Abs(BoxDist(x + 0.5f, y + 0.5f, x0, y0, x1, y1, r)) + 0.5f));
        }
    }

    // a glowing marker floating in the room, always turned to face you: a soft glow, a bright ring (hands) and a dot.
    // Drawn as a tiny world-space canvas so it is unlit and bright against any scene; it takes no clicks.
    public class BreneGlow
    {
        readonly GameObject go; readonly Image glow, ring, dot;
        public BreneGlow(string name, bool withRing)
        {
            go = new GameObject(name);
            var c = go.AddComponent<Canvas>(); c.renderMode = RenderMode.WorldSpace; c.sortingOrder = 50;
            var rt = (RectTransform)go.transform; rt.sizeDelta = new Vector2(100, 100);
            glow = Img(rt, "glow", 100);
            ring = withRing ? Img(rt, "halo", 66) : null;
            dot = Img(rt, "disc", withRing ? 20 : 42);
            go.SetActive(false);
        }
        static Image Img(RectTransform parent, string sprite, float size)
        {
            var r = Ui.Rect(sprite, parent); r.anchorMin = r.anchorMax = new Vector2(0.5f, 0.5f); r.sizeDelta = new Vector2(size, size);
            var i = r.gameObject.AddComponent<Image>(); i.sprite = BreneIcons.Get(sprite); i.raycastTarget = false; return i;
        }
        public bool Shown { get { return go != null && go.activeSelf; } }
        public Vector3 Position { get { return go.transform.position; } }
        // at this point, facing the eye, this many metres across, in this colour
        public void Place(Vector3 at, Vector3 eye, float metres, Color c)
        {
            if (go == null) return;
            if (!go.activeSelf) go.SetActive(true);
            var t = go.transform; t.position = at;
            var d = at - eye; if (d.sqrMagnitude > 0.000001f) t.rotation = Quaternion.LookRotation(d);
            t.localScale = Vector3.one * (metres / 100f);
            glow.color = new Color(c.r, c.g, c.b, 0.5f);
            if (ring != null) ring.color = c;
            dot.color = new Color(0.5f + c.r * 0.5f, 0.5f + c.g * 0.5f, 0.5f + c.b * 0.5f, 1f);
        }
        public void Hide() { if (go != null && go.activeSelf) go.SetActive(false); }
        public void Destroy() { if (go != null) UnityEngine.Object.Destroy(go); }
    }
}
