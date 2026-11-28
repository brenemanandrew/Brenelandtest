// Brene for Virt-a-Mate: a step-by-step flow panel, used by "Set up a scene" and "Glasses setup".
// Numbered steps along the top (tap to jump), one line saying what this step is for, the step's own content, a live check where
// the step can be checked ("Relay: running" in green, or what is missing in plain words), and Back / Next at the bottom.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Brene
{
    public class FlowStep
    {
        public string Name, Hint;
        public Action<RectTransform> Build;   // fills the step's content
        public Func<string> Check;            // null when this step is fine, else what is missing (shown live)
        public FlowStep(string name, string hint, Action<RectTransform> build) { Name = name; Hint = hint; Build = build; }
    }

    public class Flow
    {
        public Panel Panel; public readonly List<FlowStep> Steps = new List<FlowStep>(); public int Index;
        public RectTransform Content, NextRt, StepsRt; Text hint, check, note; Button nextBtn; readonly List<Button> tabs = new List<Button>();
        float nextCheck;

        public Flow(Transform canvas, string id, string title, Vector2 pos) { Panel = new Panel(canvas, id, title, pos, new Vector2(640, 660), false); }

        public void Build()
        {
            var b = Panel.Body;
            StepsRt = Ui.Rect("Steps", b); Ui.Top(StepsRt, 54, 0);
            var g = StepsRt.gameObject.AddComponent<GridLayoutGroup>(); float w = Mathf.Floor((620 - (Steps.Count - 1) * 3) / Steps.Count); g.cellSize = new Vector2(w, 54); g.spacing = new Vector2(3, 0);
            for (int i = 0; i < Steps.Count; i++) { int k = i; var t = Ui.Button(StepsRt, (i + 1) + "\n" + Steps[i].Name, () => Show(k)); t.GetComponentInChildren<Text>().fontSize = 15; tabs.Add(t); }
            var hr = Ui.Rect("Hint", b); Ui.Top(hr, 40, 58);
            hint = Ui.Label(hr, "", 21, Role.Accent, TextAnchor.MiddleLeft); hint.fontStyle = FontStyle.Bold;
            var cr = Ui.Rect("Check", b); Ui.Top(cr, 30, 98);
            check = Ui.Label(cr, "", 18, Role.Text, TextAnchor.MiddleLeft); check.supportRichText = true;
            var area = Ui.Rect("Area", b); Ui.Fill(area, 0, 132, 0, 92);
            Content = Ui.Scroll(area).content;
            var vl = Content.gameObject.AddComponent<VerticalLayoutGroup>(); vl.spacing = 8; vl.childControlHeight = true; vl.childControlWidth = true; vl.childForceExpandHeight = false;
            var nav = Ui.Rect("Nav", b); Ui.Bottom(nav, 54, 32);
            var back = Ui.Rect("Back", nav); Ui.Span(back, 0, 0.32f);
            Ui.Stretch(Ui.Button(back, "< Back", () => Show(Index - 1)));
            NextRt = Ui.Rect("Next", nav); Ui.Span(NextRt, 0.36f, 1);
            nextBtn = Ui.Button(NextRt, "Next >", () => { if (Index >= Steps.Count - 1) Panel.Root.gameObject.SetActive(false); else Show(Index + 1); }); Ui.Stretch(nextBtn); Ui.SetOn(nextBtn, true);
            var nr = Ui.Rect("Note", b); Ui.Bottom(nr, 28, 0);
            note = Ui.Label(nr, "", 16, Role.Dim, TextAnchor.MiddleLeft);
            Panel.Root.gameObject.SetActive(false);
        }

        public void Open(int i) { Panel.Root.gameObject.SetActive(true); Panel.Root.SetAsLastSibling(); Show(i); }
        public void Note(string s) { if (note != null) note.text = s ?? ""; }
        public void Redraw() { if (Content != null) Show(Index); }   // a late redraw after the panels were rebuilt (Reset layout) is dropped

        public void Show(int i)
        {
            Index = Mathf.Clamp(i, 0, Steps.Count - 1); var st = Steps[Index];
            for (int k = 0; k < tabs.Count; k++) Ui.SetOn(tabs[k], k == Index);
            for (int k = Content.childCount - 1; k >= 0; k--) UnityEngine.Object.Destroy(Content.GetChild(k).gameObject);
            hint.text = "Step " + (Index + 1) + " of " + Steps.Count + ": " + st.Hint;
            Ui.SetText(nextBtn, Index == Steps.Count - 1 ? "Done" : "Next: " + Steps[Index + 1].Name + " >");
            note.text = ""; check.text = ""; nextCheck = 0;
            try { st.Build(Content); } catch (Exception e) { note.text = "This step hit a problem: " + e.Message; }
            Tick();
        }

        // the live check, twice a second while the panel is open
        public void Tick()
        {
            if (Panel == null || !Panel.Root.gameObject.activeInHierarchy || Time.realtimeSinceStartup < nextCheck) return;
            nextCheck = Time.realtimeSinceStartup + 0.5f;
            var st = Steps[Index]; if (st.Check == null) { check.text = ""; return; }
            string miss; try { miss = st.Check(); } catch (Exception e) { miss = e.Message; }
            check.text = miss == null ? "<color=#5fe0a0>Ready</color>" : "<color=#ffb070>Not yet: " + miss + "</color>";
        }

        // ---- small builders the steps use ----
        public static Button Wide(RectTransform parent, string text, Action a, bool on)
        {
            var r = Ui.Rect("Row " + text, parent); r.gameObject.AddComponent<LayoutElement>().minHeight = 56;
            var b = Ui.Button(r, text, a); Ui.Stretch(b); Ui.SetOn(b, on); return b;
        }
        public static RectTransform Grid(RectTransform parent, Vector2 cell)
        {
            var gr = Ui.Rect("Grid", parent); var g = gr.gameObject.AddComponent<GridLayoutGroup>(); g.cellSize = cell; g.spacing = new Vector2(8, 8); return gr;
        }
        public static Text Say(RectTransform parent, string text)
        {
            var r = Ui.Rect("Say", parent); var t = Ui.Label(r, text, 19, Role.Text, TextAnchor.UpperLeft); t.verticalOverflow = VerticalWrapMode.Overflow;
            var le = r.gameObject.AddComponent<LayoutElement>(); le.minHeight = 30 + 26 * Mathf.Floor(text.Length / 52f); return t;
        }
        public static void SliderRow(RectTransform parent, string label, float min, float max, float val, Action<float> set)
        {
            var row = Ui.Rect("Row " + label, parent); row.gameObject.AddComponent<LayoutElement>().minHeight = 56;
            var l = Ui.Rect("L", row); Ui.Span(l, 0, 0.38f);
            Ui.Label(l, label, 20, Role.Text, TextAnchor.MiddleLeft);
            var s = Ui.Rect("S", row); s.anchorMin = new Vector2(0.38f, 0); s.anchorMax = new Vector2(1, 1); s.offsetMin = new Vector2(6, 8); s.offsetMax = new Vector2(-6, -8);
            Ui.Slider(s, min, max, val, set);
        }
    }
}
