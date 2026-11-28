// Brene for Virt-a-Mate: the look and the drag-around editor.
// Everything here is plain Unity UI (uGUI) drawn on one screen-space overlay canvas, so it does not depend on VaM's own menus.
//   Theme      colours, a rounded sprite made in code, the font
//   Skin       marks an Image or Text with its role so a theme change can recolour it
//   Panel      a movable window: title bar (drag to move), body, resize corner and hide button (edit mode)
//   DragMove / DragResize / DragButton   the drag handlers; DragButton moves a button to another panel or another place in edit mode
// Kept to C# 5 features (no string interpolation, no ?.) because VaM compiles plugins itself.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace Brene
{
    // the colour roles (plain numbers: VaM 1.22's compiler crashed on this file, and an enum used as a MonoBehaviour field is a suspect)
    public static class Role { public const int Panel = 0, Title = 1, Button = 2, ButtonOn = 3, Accent = 4, Text = 5, Dim = 6, Field = 7; }

    public static class Theme
    {
        public static string Name = "Night";
        public static readonly string[] Names = new string[] { "Night", "Ocean", "Rose", "Forest", "Light" };
        static readonly Dictionary<string, Color[]> sets = new Dictionary<string, Color[]>
        {
            //                 Panel                         Title                          Button                         ButtonOn                       Accent                         Text                       Dim                        Field
            { "Night",  new[] { C(0.07f,0.08f,0.11f,0.90f), C(0.15f,0.16f,0.24f,0.97f), C(0.21f,0.23f,0.34f,1f), C(0.27f,0.60f,0.44f,1f), C(0.58f,0.47f,0.98f,1f), C(0.96f,0.96f,0.99f,1f), C(0.68f,0.70f,0.80f,1f), C(0.03f,0.04f,0.06f,0.95f) } },
            { "Ocean",  new[] { C(0.04f,0.10f,0.16f,0.90f), C(0.06f,0.22f,0.33f,0.97f), C(0.09f,0.31f,0.45f,1f), C(0.10f,0.62f,0.62f,1f), C(0.30f,0.80f,0.95f,1f), C(0.94f,0.98f,1.00f,1f), C(0.62f,0.78f,0.86f,1f), C(0.02f,0.06f,0.10f,0.95f) } },
            { "Rose",   new[] { C(0.13f,0.06f,0.10f,0.90f), C(0.30f,0.10f,0.20f,0.97f), C(0.42f,0.15f,0.28f,1f), C(0.80f,0.35f,0.50f,1f), C(1.00f,0.55f,0.70f,1f), C(1.00f,0.95f,0.97f,1f), C(0.85f,0.68f,0.76f,1f), C(0.08f,0.03f,0.06f,0.95f) } },
            { "Forest", new[] { C(0.06f,0.10f,0.07f,0.90f), C(0.12f,0.22f,0.14f,0.97f), C(0.18f,0.32f,0.20f,1f), C(0.45f,0.68f,0.30f,1f), C(0.75f,0.88f,0.40f,1f), C(0.95f,0.98f,0.92f,1f), C(0.70f,0.80f,0.68f,1f), C(0.03f,0.06f,0.04f,0.95f) } },
            { "Light",  new[] { C(0.95f,0.95f,0.97f,0.94f), C(0.82f,0.84f,0.92f,0.98f), C(1.00f,1.00f,1.00f,1f), C(0.55f,0.85f,0.65f,1f), C(0.40f,0.35f,0.90f,1f), C(0.10f,0.10f,0.14f,1f), C(0.38f,0.40f,0.48f,1f), C(1.00f,1.00f,1.00f,1f) } },
        };
        static Color C(float r, float g, float b, float a) { return new Color(r, g, b, a); }
        public static Color Get(int r)
        {
            Color[] s; if (!sets.TryGetValue(Name, out s)) s = sets["Night"];
            return s[Mathf.Clamp(r, 0, s.Length - 1)];
        }

        static Font font;
        public static Font Font { get { if (font == null) font = Resources.GetBuiltinResource<Font>("Arial.ttf"); return font; } }

        static Sprite round;
        // a white rounded square, nine-sliced, so every panel and button gets soft corners at any size
        public static Sprite Round
        {
            get
            {
                if (round != null) return round;
                int n = 64, r = 18; var tex = new Texture2D(n, n, TextureFormat.RGBA32, false); tex.wrapMode = TextureWrapMode.Clamp;
                var px = new Color32[n * n];
                for (int y = 0; y < n; y++) for (int x = 0; x < n; x++)
                {
                    float cx = Mathf.Clamp(x + 0.5f, r, n - r), cy = Mathf.Clamp(y + 0.5f, r, n - r);
                    float d = Mathf.Sqrt((x + 0.5f - cx) * (x + 0.5f - cx) + (y + 0.5f - cy) * (y + 0.5f - cy));
                    byte a = (byte)(255 * Mathf.Clamp01(r - d + 0.5f));
                    px[y * n + x] = new Color32(255, 255, 255, a);
                }
                tex.SetPixels32(px); tex.Apply();
                round = Sprite.Create(tex, new Rect(0, 0, n, n), new Vector2(0.5f, 0.5f), 100, 0, SpriteMeshType.FullRect, new Vector4(r, r, r, r));
                return round;
            }
        }

        public static void ApplyAll(Transform root)
        {
            foreach (var s in root.GetComponentsInChildren<Skin>(true)) s.Apply();
        }
    }

    public class Skin : MonoBehaviour
    {
        public int role;
        public void Apply()
        {
            var img = GetComponent<Image>(); if (img != null) { img.color = Theme.Get(role); return; }
            var txt = GetComponent<Text>(); if (txt != null) txt.color = Theme.Get(role);
        }
    }

    public static class Ui
    {
        public static RectTransform Rect(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform)); go.transform.SetParent(parent, false);
            return (RectTransform)go.transform;
        }
        public static void Fill(RectTransform rt, float l, float t, float r, float b)
        {
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.offsetMin = new Vector2(l, b); rt.offsetMax = new Vector2(-r, -t);
        }
        public static Image Box(RectTransform rt, int role)
        {
            var img = rt.gameObject.AddComponent<Image>(); img.sprite = Theme.Round; img.type = Image.Type.Sliced;
            rt.gameObject.AddComponent<Skin>().role = role; img.color = Theme.Get(role); return img;
        }
        public static Text Label(Transform parent, string text, int size, int role, TextAnchor align)
        {
            var rt = Rect("Text", parent); Fill(rt, 8, 0, 8, 0);
            var t = rt.gameObject.AddComponent<Text>(); t.font = Theme.Font; t.fontSize = size; t.text = text; t.alignment = align;
            t.horizontalOverflow = HorizontalWrapMode.Wrap; t.verticalOverflow = VerticalWrapMode.Truncate; t.raycastTarget = false;
            rt.gameObject.AddComponent<Skin>().role = role; t.color = Theme.Get(role);
            return t;
        }
        public static Button Button(Transform parent, string text, Action onClick)
        {
            var rt = Rect("Button " + text, parent);
            var img = Box(rt, Role.Button);
            var b = rt.gameObject.AddComponent<Button>(); b.targetGraphic = img;
            var cb = b.colors; cb.highlightedColor = new Color(1.15f, 1.15f, 1.15f, 1f); cb.pressedColor = new Color(0.8f, 0.8f, 0.8f, 1f); b.colors = cb;
            Label(rt, text, 22, Role.Text, TextAnchor.MiddleCenter);
            if (onClick != null) b.onClick.AddListener(() => onClick());
            return b;
        }
        // a thick, thumb-friendly slider: track, accent fill, round handle
        public static Slider Slider(RectTransform parent, float min, float max, float val, Action<float> onChange)
        {
            var track = Rect("Track", parent); track.anchorMin = new Vector2(0, 0.5f); track.anchorMax = new Vector2(1, 0.5f); track.sizeDelta = new Vector2(-20, 12);
            Box(track, Role.Field).raycastTarget = true;
            var fillArea = Rect("FillArea", parent); fillArea.anchorMin = new Vector2(0, 0.5f); fillArea.anchorMax = new Vector2(1, 0.5f); fillArea.sizeDelta = new Vector2(-20, 12);
            var fill = Rect("Fill", fillArea); fill.sizeDelta = Vector2.zero; Box(fill, Role.Accent).raycastTarget = false;
            var handleArea = Rect("HandleArea", parent); Fill(handleArea, 10, 0, 10, 0);
            var handle = Rect("Handle", handleArea); handle.sizeDelta = new Vector2(30, 30);
            var hi = Box(handle, Role.Text);
            var s = parent.gameObject.AddComponent<Slider>();
            s.fillRect = fill; s.handleRect = handle; s.targetGraphic = hi; s.direction = UnityEngine.UI.Slider.Direction.LeftToRight;
            s.minValue = min; s.maxValue = max; s.value = val;
            s.onValueChanged.AddListener(v => onChange(v));
            return s;
        }
        public static void SetOn(Button b, bool on)
        {
            var s = b.GetComponent<Skin>(); if (s == null) return;
            s.role = on ? Role.ButtonOn : Role.Button; s.Apply();
        }
        public static void SetText(Button b, string text)
        {
            var t = b.GetComponentInChildren<Text>(); if (t != null) t.text = text;
        }
    }

    // ---- the editor's state ----
    public static class BreneEdit
    {
        public static bool On;
        public static Action Changed = () => { };
        public static Canvas Canvas;
        public static float Scale { get { return Canvas != null ? Canvas.scaleFactor : 1f; } }
    }

    public class Panel
    {
        public string Id, Title;
        public RectTransform Root, Body, Bar;
        public GameObject Resize, Hide;
        public bool Droppable;   // other buttons can be dropped into it (button panels)
        public bool CanHide = true;   // the dock holds Edit layout, so it is never hidden
        public static readonly List<Panel> All = new List<Panel>();

        public Panel(Transform canvas, string id, string title, Vector2 pos, Vector2 size, bool grid)
        {
            Id = id; Title = title; Droppable = grid;
            Root = Ui.Rect("Panel " + id, canvas);
            Root.anchorMin = Root.anchorMax = new Vector2(0, 1); Root.pivot = new Vector2(0, 1);
            Root.anchoredPosition = pos; Root.sizeDelta = size;
            Ui.Box(Root, Role.Panel);
            Root.gameObject.AddComponent<PanelTag>().panel = this;

            Bar = Ui.Rect("Bar", Root); Bar.anchorMin = new Vector2(0, 1); Bar.anchorMax = new Vector2(1, 1); Bar.pivot = new Vector2(0.5f, 1);
            Bar.sizeDelta = new Vector2(0, 46); Bar.anchoredPosition = Vector2.zero;
            Ui.Box(Bar, Role.Title);
            Ui.Label(Bar, title, 22, Role.Text, TextAnchor.MiddleLeft).fontStyle = FontStyle.Bold;
            Bar.gameObject.AddComponent<DragMove>().target = Root;

            var hrt = Ui.Rect("Hide", Bar); hrt.anchorMin = hrt.anchorMax = new Vector2(1, 0.5f); hrt.pivot = new Vector2(1, 0.5f);
            hrt.sizeDelta = new Vector2(38, 34); hrt.anchoredPosition = new Vector2(-6, 0);
            var hb = Ui.Button(hrt, "x", () => { Root.gameObject.SetActive(false); BreneEdit.Changed(); });
            ((RectTransform)hb.transform).anchorMin = Vector2.zero; ((RectTransform)hb.transform).anchorMax = Vector2.one; ((RectTransform)hb.transform).sizeDelta = Vector2.zero;
            Hide = hrt.gameObject;

            Body = Ui.Rect("Body", Root); Ui.Fill(Body, 10, 54, 10, 10);
            if (grid)
            {
                var g = Body.gameObject.AddComponent<GridLayoutGroup>();
                g.cellSize = new Vector2(150, 56); g.spacing = new Vector2(8, 8); g.childAlignment = TextAnchor.UpperLeft;
                Body.gameObject.AddComponent<DropZone>().panel = this;
            }

            var rr = Ui.Rect("Resize", Root); rr.anchorMin = rr.anchorMax = new Vector2(1, 0); rr.pivot = new Vector2(1, 0);
            rr.sizeDelta = new Vector2(30, 30); rr.anchoredPosition = Vector2.zero;
            Ui.Box(rr, Role.Accent);
            rr.gameObject.AddComponent<DragResize>().target = Root;
            Resize = rr.gameObject;

            All.Add(this);
            ShowEdit(BreneEdit.On);
        }

        public void ShowEdit(bool on) { Resize.SetActive(on); Hide.SetActive(on && CanHide); }

        // fit the grid's cells to the panel's width so buttons grow with the panel
        public void Fit()
        {
            var g = Body.GetComponent<GridLayoutGroup>(); if (g == null) return;
            float w = Root.sizeDelta.x - 20; int cols = Mathf.Max(1, Mathf.FloorToInt((w + 8) / 158f));
            g.cellSize = new Vector2(Mathf.Floor((w - (cols - 1) * 8) / cols), 56);
        }
    }

    public class PanelTag : MonoBehaviour { public Panel panel; }
    public class DropZone : MonoBehaviour { public Panel panel; }

    public class DragMove : MonoBehaviour, IBeginDragHandler, IDragHandler, IEndDragHandler
    {
        public RectTransform target;
        public void OnBeginDrag(PointerEventData e) { target.SetAsLastSibling(); }
        public void OnDrag(PointerEventData e) { target.anchoredPosition += e.delta / BreneEdit.Scale; }
        public void OnEndDrag(PointerEventData e) { BreneEdit.Changed(); }
    }

    public class DragResize : MonoBehaviour, IDragHandler, IEndDragHandler
    {
        public RectTransform target;
        public void OnDrag(PointerEventData e)
        {
            var s = target.sizeDelta + new Vector2(e.delta.x, -e.delta.y) / BreneEdit.Scale;
            target.sizeDelta = new Vector2(Mathf.Max(180, s.x), Mathf.Max(110, s.y));
            var tag = target.GetComponent<PanelTag>(); if (tag != null) tag.panel.Fit();
        }
        public void OnEndDrag(PointerEventData e) { BreneEdit.Changed(); }
    }

    // edit mode: pick a button up, drop it on any button panel (before the button under the pointer, or at the end)
    public class DragButton : MonoBehaviour, IBeginDragHandler, IDragHandler, IEndDragHandler
    {
        public string actionId;
        Transform homeParent; int homeIndex; CanvasGroup cg; bool dragging; Vector2 size;
        public void OnBeginDrag(PointerEventData e)
        {
            if (!BreneEdit.On) { dragging = false; return; }
            dragging = true; homeParent = transform.parent; homeIndex = transform.GetSiblingIndex();
            size = ((RectTransform)transform).rect.size;
            transform.SetParent(BreneEdit.Canvas.transform, true); transform.SetAsLastSibling();
            ((RectTransform)transform).sizeDelta = size;
            cg = GetComponent<CanvasGroup>(); if (cg == null) cg = gameObject.AddComponent<CanvasGroup>();
            cg.blocksRaycasts = false; cg.alpha = 0.8f;
        }
        public void OnDrag(PointerEventData e)
        {
            if (!dragging) return;
            ((RectTransform)transform).anchoredPosition += e.delta / BreneEdit.Scale;
        }
        public void OnEndDrag(PointerEventData e)
        {
            if (!dragging) return; dragging = false; cg.blocksRaycasts = true; cg.alpha = 1f;
            var hits = new List<RaycastResult>(); EventSystem.current.RaycastAll(e, hits);
            Transform dropParent = null; int dropIndex = -1;
            foreach (var h in hits)
            {
                var other = h.gameObject.GetComponentInParent<DragButton>();
                if (other != null && other != this && other.transform.parent != null && other.transform.parent.GetComponent<DropZone>() != null)
                { dropParent = other.transform.parent; dropIndex = other.transform.GetSiblingIndex(); break; }
                var zone = h.gameObject.GetComponentInParent<PanelTag>();
                if (zone != null && zone.panel.Droppable) { dropParent = zone.panel.Body; dropIndex = -1; break; }
            }
            if (dropParent == null) { dropParent = homeParent; dropIndex = homeIndex; }
            transform.SetParent(dropParent, false);
            if (dropIndex >= 0) transform.SetSiblingIndex(dropIndex); else transform.SetAsLastSibling();
            BreneEdit.Changed();
        }
    }
}
