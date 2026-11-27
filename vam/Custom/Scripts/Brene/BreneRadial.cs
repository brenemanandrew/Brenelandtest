// Brene for Virt-a-Mate: radial menus.
// Hold the menu key (default: the ` key under Esc) and a ring of choices opens around the mouse. Move toward one and let go to
// pick it; a choice with more inside opens its own ring in the same spot. Tapping the key (or the dock's Menu button) opens
// the ring and leaves it open: then click a choice. Right-click or Esc goes back one ring, or closes.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Brene
{
    public class RItem
    {
        public string Label; public Action Run; public List<RItem> Kids; public Func<bool> On;
        public RItem(string label, Action run) { Label = label; Run = run; }
        public RItem(string label, List<RItem> kids) { Label = label; Kids = kids; }
    }

    public class Radial
    {
        const float R = 150f, PETAL = 116f, CORE = 92f, DEAD = 46f;
        readonly Transform canvas; readonly Func<List<RItem>> rootItems;
        RectTransform root; readonly List<Image> petals = new List<Image>(); readonly List<RItem> shown = new List<RItem>();
        readonly Stack<List<RItem>> trail = new Stack<List<RItem>>(); readonly Stack<string> titles = new Stack<string>();
        Text coreText; Vector2 center; int hot = -1; float openedAt; bool sticky;
        public bool Open { get { return root != null; } }
        public bool World; public Vector2 WorldSize;
        public Action BeforeRun;   // the plugin makes sure its panels are showing before a choice opens one   // VR: the ring opens on the board and is clicked with VaM's pointer

        public Radial(Transform canvas, Func<List<RItem>> items) { this.canvas = canvas; rootItems = items; }

        // key: the hold-to-pick key, checked every frame by the plugin
        public void Tick(KeyCode key)
        {
            if (Input.GetKeyDown(key)) { if (Open && sticky) Close(); else if (World) OpenAtCentre(); else { Show(Input.mousePosition, rootItems(), "Brene"); sticky = false; openedAt = Time.realtimeSinceStartup; } }
            if (!Open) return;
            if (!World) Track();
            if (Input.GetKeyUp(key) && !sticky)
            {
                if (Time.realtimeSinceStartup - openedAt < 0.25f && hot < 0) sticky = true;   // a tap: leave it open for clicking
                else Pick();
            }
            if (sticky && !World && Input.GetMouseButtonDown(0)) Pick();
            if (Input.GetMouseButtonDown(1) || Input.GetKeyDown(KeyCode.Escape)) Back();
        }

        public void OpenAtCentre() { Show(World ? WorldSize / 2f : new Vector2(Screen.width / 2f, Screen.height / 2f), rootItems(), "Brene"); sticky = true; }

        void Show(Vector2 screenPos, List<RItem> items, string title)
        {
            Close(false);
            center = screenPos; shown.Clear(); shown.AddRange(items); petals.Clear(); hot = -1;
            float k = World ? 1f : BreneEdit.Scale; float SW = World ? WorldSize.x : Screen.width, SH = World ? WorldSize.y : Screen.height;
            root = Ui.Rect("Radial", canvas); root.anchorMin = root.anchorMax = Vector2.zero; root.pivot = new Vector2(0.5f, 0.5f);
            // keep the whole ring on screen
            float m = (R + PETAL / 2 + 8) * k;
            center = new Vector2(Mathf.Clamp(center.x, m, SW - m), Mathf.Clamp(center.y, m, SH - m));
            root.anchoredPosition = center / k; root.sizeDelta = Vector2.one * (R * 2 + PETAL);
            root.SetAsLastSibling();

            var shade = Ui.Rect("Shade", root); shade.anchorMin = shade.anchorMax = new Vector2(0.5f, 0.5f); shade.sizeDelta = Vector2.one * (R * 2 + PETAL + 30);
            var si = Ui.Box(shade, Role.Panel); si.sprite = Circle; si.type = Image.Type.Simple; si.raycastTarget = false;

            for (int i = 0; i < items.Count; i++)
            {
                float a = Mathf.PI / 2 - i * Mathf.PI * 2 / items.Count;   // first choice at the top, then clockwise
                var p = Ui.Rect("Petal " + items[i].Label, root); p.anchorMin = p.anchorMax = new Vector2(0.5f, 0.5f);
                p.sizeDelta = Vector2.one * PETAL; p.anchoredPosition = new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * R;
                var img = Ui.Box(p, items[i].On != null && items[i].On() ? Role.ButtonOn : Role.Button); img.sprite = Circle; img.type = Image.Type.Simple;
                var label = items[i].Label + (items[i].Kids != null ? "  >" : "");
                var t = Ui.Label(p, label, 19, Role.Text, TextAnchor.MiddleCenter); t.fontStyle = FontStyle.Bold;
                petals.Add(img);
                // a petal is also a button: clicked with the mouse on a monitor, or with VaM's pointer in VR
                int idx = i; var pb = p.gameObject.AddComponent<Button>(); pb.targetGraphic = img; pb.onClick.AddListener(() => { hot = idx; Pick(); });
            }
            var core = Ui.Rect("Core", root); core.anchorMin = core.anchorMax = new Vector2(0.5f, 0.5f); core.sizeDelta = Vector2.one * CORE;
            var ci = Ui.Box(core, Role.Title); ci.sprite = Circle; ci.type = Image.Type.Simple;
            coreText = Ui.Label(core, title, 17, Role.Dim, TextAnchor.MiddleCenter);
        }

        void Track()
        {
            Vector2 d = (Vector2)Input.mousePosition - center; int was = hot;
            if (d.magnitude < DEAD * BreneEdit.Scale || shown.Count == 0) hot = -1;
            else
            {
                float ang = Mathf.Atan2(d.y, d.x), step = Mathf.PI * 2 / shown.Count;
                float fromTop = Mathf.PI / 2 - ang; while (fromTop < 0) fromTop += Mathf.PI * 2; while (fromTop >= Mathf.PI * 2) fromTop -= Mathf.PI * 2;
                hot = Mathf.RoundToInt(fromTop / step) % shown.Count;
            }
            if (hot == was) return;
            for (int i = 0; i < petals.Count; i++)
            {
                var on = shown[i].On != null && shown[i].On();
                petals[i].color = i == hot ? Theme.Get(Role.Accent) : Theme.Get(on ? Role.ButtonOn : Role.Button);
                petals[i].rectTransform.localScale = Vector3.one * (i == hot ? 1.12f : 1f);
            }
            coreText.text = hot >= 0 ? shown[hot].Label : (titles.Count > 0 ? titles.Peek() : "Brene");
        }

        void Pick()
        {
            if (hot < 0) { if (!sticky) Close(); return; }
            var it = shown[hot];
            if (it.Kids != null)
            {
                trail.Push(new List<RItem>(shown)); titles.Push(coreTitle());
                var c = center; Show(c, it.Kids, it.Label); sticky = true; return;
            }
            Close();
            try { if (BeforeRun != null) BeforeRun(); if (it.Run != null) it.Run(); } catch (Exception e) { SuperController.LogError("Brene menu " + it.Label + ": " + e.Message); }
        }
        string coreTitle() { return titles.Count > 0 ? titles.Peek() : "Brene"; }

        void Back()
        {
            if (trail.Count == 0) { Close(); return; }
            var items = trail.Pop(); var title = titles.Pop(); var c = center; Show(c, items, title); sticky = true;
        }

        public void Close() { Close(true); }
        void Close(bool all)
        {
            if (root != null) UnityEngine.Object.Destroy(root.gameObject);
            root = null; petals.Clear(); shown.Clear();
            if (all) { trail.Clear(); titles.Clear(); sticky = false; }
        }

        static Sprite circle;
        static Sprite Circle
        {
            get
            {
                if (circle != null) return circle;
                int n = 128; float r = n / 2f; var tex = new Texture2D(n, n, TextureFormat.RGBA32, false); tex.wrapMode = TextureWrapMode.Clamp;
                var px = new Color32[n * n];
                for (int y = 0; y < n; y++) for (int x = 0; x < n; x++)
                {
                    float d = Mathf.Sqrt((x + 0.5f - r) * (x + 0.5f - r) + (y + 0.5f - r) * (y + 0.5f - r));
                    px[y * n + x] = new Color32(255, 255, 255, (byte)(255 * Mathf.Clamp01(r - d)));
                }
                tex.SetPixels32(px); tex.Apply();
                circle = Sprite.Create(tex, new Rect(0, 0, n, n), new Vector2(0.5f, 0.5f), 100, 0, SpriteMeshType.FullRect, new Vector4(0, 0, 0, 0));
                return circle;
            }
        }
    }
}
