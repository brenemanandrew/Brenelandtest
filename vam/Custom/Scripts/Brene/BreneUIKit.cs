// Brene for Virt-a-Mate: the look and the drag-around editor.
// Everything here is plain Unity UI (uGUI) drawn on one screen-space overlay canvas, so it does not depend on VaM's own menus.
//   Theme      colours, a rounded sprite made in code, the font
//   Skin       marks an Image or Text with its role so a theme change can recolour it
//   Panel      a movable window: title bar (icon, drag to move, - shrinks it to a round chip), body, resize corner and hide
//              button (edit mode)
//   BreneHover a strong highlight on the button under the pointer or a fingertip (in the headset)
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
            rt.gameObject.AddComponent<BreneHover>();
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
        // ---- placing: the few ways a part sits in its parent, written once ----
        // a strip along the top, full width, this high, this far down
        public static void Top(RectTransform rt, float height, float down)
        {
            rt.anchorMin = new Vector2(0, 1); rt.anchorMax = new Vector2(1, 1); rt.pivot = new Vector2(0.5f, 1); rt.sizeDelta = new Vector2(0, height); rt.anchoredPosition = new Vector2(0, -down);
        }
        // a strip along the bottom, full width, this high, this far up
        public static void Bottom(RectTransform rt, float height, float up)
        {
            rt.anchorMin = new Vector2(0, 0); rt.anchorMax = new Vector2(1, 0); rt.pivot = new Vector2(0.5f, 0); rt.sizeDelta = new Vector2(0, height); rt.anchoredPosition = new Vector2(0, up);
        }
        // full height, from this share of the width to that one (0 to 1)
        public static void Span(RectTransform rt, float from, float to)
        {
            rt.anchorMin = new Vector2(from, 0); rt.anchorMax = new Vector2(to, 1); rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
        }
        // a button made inside its own holder fills that holder
        public static void Stretch(Button bt)
        {
            var r = (RectTransform)bt.transform; r.anchorMin = Vector2.zero; r.anchorMax = Vector2.one; r.sizeDelta = Vector2.zero;
        }
        // a list that scrolls up and down inside an area: the content grows with what is put in it (sr.content)
        public static ScrollRect Scroll(RectTransform area)
        {
            var vp = Rect("Viewport", area); Fill(vp, 0, 0, 0, 0);
            vp.gameObject.AddComponent<RectMask2D>();
            var hit = vp.gameObject.AddComponent<Image>(); hit.color = new Color(0, 0, 0, 0.001f);
            var content = Rect("Content", vp); content.anchorMin = new Vector2(0, 1); content.anchorMax = new Vector2(1, 1); content.pivot = new Vector2(0.5f, 1); content.sizeDelta = Vector2.zero;
            var fit = content.gameObject.AddComponent<ContentSizeFitter>(); fit.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            var sr = area.gameObject.AddComponent<ScrollRect>(); sr.viewport = vp; sr.content = content; sr.horizontal = false; sr.scrollSensitivity = 30;
            return sr;
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
        // one of BreneIcons' pictures, tinted by the theme (role)
        public static Image Glyph(RectTransform rt, string icon, int role)
        {
            var img = rt.gameObject.AddComponent<Image>(); img.sprite = BreneIcons.Get(icon); img.raycastTarget = false;
            rt.gameObject.AddComponent<Skin>().role = role; img.color = Theme.Get(role); return img;
        }
        // a button with its icon on the left and its label beside it
        public static void WithIcon(Button b, string icon)
        {
            if (b == null || icon == null || b.transform.Find("Icon") != null) return;
            var rt = Rect("Icon", b.transform); rt.anchorMin = rt.anchorMax = new Vector2(0, 0.5f); rt.pivot = new Vector2(0, 0.5f);
            rt.sizeDelta = new Vector2(30, 30); rt.anchoredPosition = new Vector2(9, 0);
            Glyph(rt, icon, Role.Text);
            var t = b.GetComponentInChildren<Text>(); if (t == null) return;
            t.rectTransform.offsetMin = new Vector2(44, 0); t.rectTransform.offsetMax = new Vector2(-4, 0);
            t.alignment = TextAnchor.MiddleLeft; t.fontSize = 19;
        }
    }

    // ---- the editor's state ----
    public static class BreneEdit
    {
        public static bool On;
        public static Action Changed = () => { };
        public static Action Save = () => { };   // saved even outside edit mode (a panel shrunk to its chip, a chip moved)
        public static Canvas Canvas;
        public static float Scale { get { return Canvas != null ? Canvas.scaleFactor : 1f; } }
    }

    public class Panel
    {
        public string Id, Title;
        public RectTransform Root, Body, Bar, Chip;   // Chip: the round icon the panel shrinks to
        public GameObject Resize, Hide, ShrinkBtn;
        public string Icon; public bool Shrunk;
        public bool Droppable;   // other buttons can be dropped into it (button panels)
        public bool CanHide = true;
        // tool = a quick-button panel (shown together by Tools / Show all); window = a big flow or page, one open at a time;
        // dialog = pops up when needed (a choice, a picker, a call); chat and dock stand on their own
        public string Kind = "tool";   // the dock holds Edit layout, so it is never hidden
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
            Icon = BreneIcons.ForPanel(id);
            var ic = Ui.Rect("Icon", Bar); ic.anchorMin = ic.anchorMax = new Vector2(0, 0.5f); ic.pivot = new Vector2(0, 0.5f); ic.sizeDelta = new Vector2(30, 30); ic.anchoredPosition = new Vector2(10, 0);
            Ui.Glyph(ic, Icon, Role.Text);
            var tl = Ui.Label(Bar, title, 22, Role.Text, TextAnchor.MiddleLeft); tl.fontStyle = FontStyle.Bold;
            tl.rectTransform.offsetMin = new Vector2(48, 0); tl.rectTransform.offsetMax = new Vector2(-96, 0);
            Bar.gameObject.AddComponent<DragMove>().target = Root;

            // - shrinks the panel to a round chip where it stands; tap the chip to open it again (any kind but a pop-up dialog)
            var srt = Ui.Rect("Shrink", Bar); srt.anchorMin = srt.anchorMax = new Vector2(1, 0.5f); srt.pivot = new Vector2(1, 0.5f);
            srt.sizeDelta = new Vector2(38, 34); srt.anchoredPosition = new Vector2(-6, 0);
            var sbt = Ui.Button(srt, "-", Shrink); Ui.Stretch(sbt); var st = sbt.GetComponentInChildren<Text>(); st.fontSize = 30; st.fontStyle = FontStyle.Bold;
            ShrinkBtn = srt.gameObject;
            Chip = Ui.Rect("Chip " + id, canvas); Chip.anchorMin = Chip.anchorMax = new Vector2(0, 1); Chip.pivot = new Vector2(0, 1); Chip.sizeDelta = new Vector2(64, 64);
            var cbg = Ui.Box(Chip, Role.Title); cbg.sprite = BreneIcons.Get("disc"); cbg.type = Image.Type.Simple;
            var crt = Ui.Rect("Ring", Chip); Ui.Fill(crt, 0, 0, 0, 0); Ui.Glyph(crt, "halo", Role.Accent);
            var cic = Ui.Rect("Icon", Chip); cic.anchorMin = cic.anchorMax = new Vector2(0.5f, 0.5f); cic.sizeDelta = new Vector2(34, 34); Ui.Glyph(cic, Icon, Role.Text);
            var cb = Chip.gameObject.AddComponent<Button>(); cb.targetGraphic = cbg; cb.onClick.AddListener(() => Expand());
            Chip.gameObject.AddComponent<BreneHover>();
            var cdm = Chip.gameObject.AddComponent<DragMove>(); cdm.target = Chip; cdm.always = true;
            Chip.gameObject.SetActive(false);

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

        public void ShowEdit(bool on)
        {
            Resize.SetActive(on); Hide.SetActive(on && CanHide);
            ShrinkBtn.SetActive(Kind != "dialog");
            ((RectTransform)ShrinkBtn.transform).anchoredPosition = new Vector2(on && CanHide ? -50 : -6, 0);
        }

        // ---- shrink to a chip, and back ----
        public void Shrink() { if (Kind == "dialog") return; ShrinkAt(Root.anchoredPosition); BreneEdit.Save(); }
        public void ShrinkAt(Vector2 at)
        {
            Shrunk = true; Chip.anchoredPosition = at; Chip.gameObject.SetActive(true); Chip.SetAsLastSibling();
            Root.gameObject.SetActive(false);
        }
        // opens where the chip is now
        public void Expand()
        {
            Root.anchoredPosition = Chip.anchoredPosition; Shrunk = false; Chip.gameObject.SetActive(false);
            Root.gameObject.SetActive(true); Root.SetAsLastSibling(); BreneEdit.Save();
        }
        // open, or as a chip
        public bool Visible { get { return Root.gameObject.activeSelf || Shrunk; } }
        // put away, chip and all
        public void Close() { Shrunk = false; Chip.gameObject.SetActive(false); Root.gameObject.SetActive(false); }

        // fit the grid's cells to the panel's width so buttons grow with the panel
        public float FootPad = 10;   // room under the buttons (the dock keeps its status line there)

        // fit the grid's cells to the panel's width so buttons grow with the panel, and the panel's height to its buttons
        public void Fit()
        {
            var g = Body.GetComponent<GridLayoutGroup>(); if (g == null) return;
            float w = Root.sizeDelta.x - 20; int cols = Mathf.Max(1, Mathf.FloorToInt((w + 8) / 158f));
            g.cellSize = new Vector2(Mathf.Floor((w - (cols - 1) * 8) / cols), 56);
            int n = 0; for (int i = 0; i < Body.childCount; i++) if (Body.GetChild(i).gameObject.activeSelf) n++;
            int rows = Mathf.Max(1, (n + cols - 1) / cols);
            Root.sizeDelta = new Vector2(Root.sizeDelta.x, 54 + rows * 56 + (rows - 1) * 8 + FootPad);
        }
        public static void FitAll() { foreach (var p in new List<Panel>(All)) p.Fit(); }
    }

    public class PanelTag : MonoBehaviour
    {
        public Panel panel;
        // one window at a time: opening one puts the others away. A shrunk panel opened by anything (a button, a tutorial) drops its chip.
        void OnEnable()
        {
            if (panel == null) return;
            if (panel.Shrunk) { panel.Shrunk = false; if (panel.Chip != null) panel.Chip.gameObject.SetActive(false); }
            if (panel.Kind != "window") return;
            foreach (var p in new List<Panel>(Panel.All)) if (p != panel && p.Kind == "window" && p.Root != null && p.Root.gameObject.activeSelf) p.Root.gameObject.SetActive(false);
        }
    }
    public class DropZone : MonoBehaviour { public Panel panel; }

    public class DragMove : MonoBehaviour, IBeginDragHandler, IDragHandler, IEndDragHandler
    {
        public RectTransform target; public bool always;   // always: saved outside edit mode too (chips)
        public void OnBeginDrag(PointerEventData e) { target.SetAsLastSibling(); }
        public void OnDrag(PointerEventData e) { target.anchoredPosition += e.delta / BreneEdit.Scale; }
        public void OnEndDrag(PointerEventData e) { if (always) BreneEdit.Save(); else BreneEdit.Changed(); }
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
            Panel.FitAll();   // both panels resize to their new number of buttons
            BreneEdit.Changed();
        }
    }

    // in the headset the button under VaM's pointer or a fingertip lights up in the accent colour and grows a little, much
    // stronger than the usual faint tint (which is hard to see on a board in the room). On a monitor it does nothing.
    public class BreneHover : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler
    {
        public static bool Strong;
        bool laser, poke, lit;
        public void OnPointerEnter(PointerEventData e) { laser = true; Show(); }
        public void OnPointerExit(PointerEventData e) { laser = false; Show(); }
        public void Poke(bool on) { if (poke == on) return; poke = on; Show(); }
        void OnDisable() { laser = false; poke = false; Show(); }
        void Show()
        {
            bool on = Strong && (laser || poke); if (on == lit) return; lit = on;
            var img = GetComponent<Image>(); if (img == null) return;
            if (on) { img.color = Theme.Get(Role.Accent); transform.localScale = Vector3.one * 1.06f; }
            else { var sk = GetComponent<Skin>(); if (sk != null) sk.Apply(); transform.localScale = Vector3.one; }
        }
    }
}
