// Brene for Virt-a-Mate: guided tutorials.
// The screen dims except for a bright window around the thing being explained (the spotlight), with a card beside it:
// what it is, what to do, step dots, Back / Next / Skip. A step can wait for you to actually do it ("Hold the ` key now"):
// then Next is replaced by "Waiting for you..." and the tutorial moves on by itself once it has happened.
// Tutorials are picked from the Tutorials list (radial menu > Help, or the dock's ? button). Welcome runs once on the first start.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Brene
{
    public class CoachStep
    {
        public string Title, Text;
        public Func<RectTransform> Target;   // what to spotlight; null = a card in the middle
        public Func<bool> Done;              // when set, the step waits until this is true
        public Action Enter;                 // run when the step opens (open a panel, switch a step)
        public CoachStep(string title, string text) { Title = title; Text = text; }
    }

    public class Lesson { public string Name, About; public List<CoachStep> Steps = new List<CoachStep>(); public Lesson(string n, string a) { Name = n; About = a; } }

    public class Coach
    {
        readonly GameObject go; readonly RectTransform root; readonly Image[] dims = new Image[4]; RectTransform ring, card;
        Text title, body, dots; Button back, next; Lesson lesson; int index; bool waiting; float doneAt = -1; float k = 1f;
        public bool Running { get { return lesson != null; } }
        public GameObject CanvasGo { get { return go; } }
        public Vector2 WorldSize;   // set in VR: the board's size in canvas units (zero on a monitor)
        public Action<string> Finished = _ => { };

        public Coach(float scale)
        {
            k = Mathf.Max(0.6f, scale);
            go = new GameObject("Brene coach");
            var c = go.AddComponent<Canvas>(); c.renderMode = RenderMode.ScreenSpaceOverlay; c.sortingOrder = 35;   // above the panels (30), under the radial menu (40) so a "try it" step shows the ring
            var sc = go.AddComponent<CanvasScaler>(); sc.uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize; sc.scaleFactor = 1f;
            go.AddComponent<GraphicRaycaster>();
            root = (RectTransform)go.transform;
            for (int i = 0; i < 4; i++)
            {
                var d = Ui.Rect("Dim", root); d.anchorMin = d.anchorMax = Vector2.zero; d.pivot = Vector2.zero;
                dims[i] = d.gameObject.AddComponent<Image>(); dims[i].color = new Color(0, 0, 0, 0.62f);
            }
            ring = Ui.Rect("Spot", root); ring.anchorMin = ring.anchorMax = Vector2.zero; ring.pivot = Vector2.zero;
            var ri = Ui.Box(ring, Role.Accent); ri.raycastTarget = false; ri.fillCenter = false;
            card = Ui.Rect("Card", root); card.anchorMin = card.anchorMax = Vector2.zero; card.pivot = new Vector2(0.5f, 0.5f); card.sizeDelta = new Vector2(560, 300);
            Ui.Box(card, Role.Panel); card.localScale = Vector3.one * k;
            var tr = Ui.Rect("Title", card); tr.anchorMin = new Vector2(0, 1); tr.anchorMax = new Vector2(1, 1); tr.pivot = new Vector2(0.5f, 1); tr.sizeDelta = new Vector2(-36, 50); tr.anchoredPosition = new Vector2(0, -12);
            title = Ui.Label(tr, "", 28, Role.Accent, TextAnchor.MiddleLeft); title.fontStyle = FontStyle.Bold;
            var br = Ui.Rect("Body", card); Ui.Fill(br, 26, 66, 26, 86);
            body = Ui.Label(br, "", 22, Role.Text, TextAnchor.UpperLeft); body.supportRichText = true;
            var dr = Ui.Rect("Dots", card); dr.anchorMin = new Vector2(0, 0); dr.anchorMax = new Vector2(0.4f, 0); dr.pivot = new Vector2(0, 0); dr.sizeDelta = new Vector2(0, 30); dr.anchoredPosition = new Vector2(14, 24);
            dots = Ui.Label(dr, "", 18, Role.Dim, TextAnchor.MiddleLeft);
            back = Btn("Back", new Vector2(-276, 18), 110, () => Show(index - 1));
            Btn("Skip", new Vector2(-156, 18), 100, Stop);
            next = Btn("Next", new Vector2(-18, 18), 130, () => { if (!waiting) Show(index + 1); });
            Ui.SetOn(next, true);
            go.SetActive(false);
        }

        Button Btn(string text, Vector2 fromBottomRight, float w, Action a)
        {
            var r = Ui.Rect(text, card); r.anchorMin = r.anchorMax = new Vector2(1, 0); r.pivot = new Vector2(1, 0); r.sizeDelta = new Vector2(w, 54); r.anchoredPosition = fromBottomRight;
            var b = Ui.Button(r, text, a); Ui.Stretch(b); return b;
        }

        public void Start(Lesson l) { lesson = l; go.SetActive(true); Theme.ApplyAll(root); Show(0); }
        public void Stop() { var n = lesson != null ? lesson.Name : ""; lesson = null; go.SetActive(false); Finished(n); }

        void Show(int i)
        {
            if (lesson == null) return;
            if (i >= lesson.Steps.Count) { Stop(); return; }
            index = Mathf.Max(0, i); var st = lesson.Steps[index];
            if (st.Enter != null) { try { st.Enter(); } catch (Exception e) { SuperController.LogError("Brene tutorial: " + e.Message); } }
            title.text = st.Title; body.text = st.Text; waiting = st.Done != null; doneAt = -1;
            var d = ""; for (int k = 0; k < lesson.Steps.Count; k++) d += k == index ? "● " : "○ "; dots.text = d;
            Ui.SetText(next, waiting ? "Waiting..." : index == lesson.Steps.Count - 1 ? "Finish" : "Next");
            Ui.SetOn(next, !waiting); back.gameObject.SetActive(index > 0);
            Place();
        }

        // every frame while running: follow the target (panels move), and watch for "do it" steps
        public void Tick()
        {
            if (lesson == null) return;
            Place();
            var st = lesson.Steps[index];
            if (waiting && st.Done != null)
            {
                bool ok = false; try { ok = st.Done(); } catch (Exception) { }
                if (ok && doneAt < 0) { doneAt = Time.realtimeSinceStartup; body.text = st.Text + "\n\n<color=#5fe0a0><b>Nice, that's it.</b></color>"; }
                if (doneAt > 0 && Time.realtimeSinceStartup - doneAt > 1.1f) { waiting = false; Show(index + 1); }
            }
        }

        void Place()
        {
            var st = lesson.Steps[index]; RectTransform t = null;
            try { if (st.Target != null) t = st.Target(); } catch (Exception) { }
            bool world = WorldSize.x > 0;
            float W = world ? WorldSize.x : Screen.width, H = world ? WorldSize.y : Screen.height;
            Rect hole;
            if (t != null && t.gameObject.activeInHierarchy)
            {
                var c = new Vector3[4]; t.GetWorldCorners(c);   // screen pixels on an overlay canvas; metres on the VR board
                if (world) for (int q = 0; q < 4; q++) c[q] = root.InverseTransformPoint(c[q]);   // the board's units, from its bottom-left corner
                float pad = 10; hole = new Rect(c[0].x - pad, c[0].y - pad, c[2].x - c[0].x + pad * 2, c[2].y - c[0].y + pad * 2);
            }
            else hole = new Rect(W / 2, H / 2, 0, 0);
            // four dims around the hole; the hole stays clickable so you can do what the step asks
            SetR(dims[0], 0, 0, W, Mathf.Max(0, hole.y));
            SetR(dims[1], 0, hole.y + hole.height, W, Mathf.Max(0, H - hole.y - hole.height));
            SetR(dims[2], 0, hole.y, Mathf.Max(0, hole.x), hole.height);
            SetR(dims[3], hole.x + hole.width, hole.y, Mathf.Max(0, W - hole.x - hole.width), hole.height);
            ring.gameObject.SetActive(hole.width > 0);
            ring.anchoredPosition = new Vector2(hole.x - 4, hole.y - 4); ring.sizeDelta = new Vector2(hole.width + 8, hole.height + 8);
            // the card: beside the hole where there is room, else in the middle
            float ck = world ? 1f : k; card.localScale = Vector3.one * ck;
            float cw = card.sizeDelta.x * ck, ch = card.sizeDelta.y * ck; Vector2 p;
            if (hole.width == 0) p = new Vector2(W / 2, H / 2);
            else if (hole.x + hole.width + cw + 30 < W) p = new Vector2(hole.x + hole.width + 20 + cw / 2, hole.y + hole.height / 2);
            else if (hole.x - cw - 30 > 0) p = new Vector2(hole.x - 20 - cw / 2, hole.y + hole.height / 2);
            else if (hole.y - ch - 30 > 0) p = new Vector2(hole.x + hole.width / 2, hole.y - 20 - ch / 2);
            else p = new Vector2(hole.x + hole.width / 2, hole.y + hole.height + 20 + ch / 2);
            card.anchoredPosition = new Vector2(Mathf.Clamp(p.x, cw / 2 + 10, W - cw / 2 - 10), Mathf.Clamp(p.y, ch / 2 + 10, H - ch / 2 - 10));
            card.SetAsLastSibling();
        }
        static void SetR(Image im, float x, float y, float w, float h) { var r = im.rectTransform; r.anchoredPosition = new Vector2(x, y); r.sizeDelta = new Vector2(w, h); }

        // the panel size changed (Bigger, Smaller, a layout read): the card follows
        public void Scale(float scale) { k = Mathf.Max(0.6f, scale); }
        public void Destroy() { if (go != null) UnityEngine.Object.Destroy(go); }
    }
}
