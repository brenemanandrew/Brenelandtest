// Brene for Virt-a-Mate: the Character panel, VaM's character editor in plain words.
//   Body, Face   friendly sliders (Height, Shoulders, Waist, Hips, Bust, Eyes, Lips...). Each is matched to whatever morph this
//                VaM has under a likely name, and the real morph name is shown small under it; sliders with no match are left
//                out. "Search all shapes" finds any morph by a word, without the package clutter in front of the name.
//   Skin, Hair, Clothes, Looks   picture tiles of your presets (from the relay's library, packages included); tap to apply.
//   Reset        puts every slider you moved back to where it was when you first touched it.
// Morphs are read and set through the person's "geometry" storable as float parameters, the same way VaM's own triggers and
// Timeline reach them, so nothing here depends on VaM's internal morph classes.
using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Networking;
using SimpleJSON;

namespace Brene
{
    public class Character
    {
        static readonly string[][] BODY = {
            new[] { "Height", "Height" }, new[] { "Thin", "Thin", "Body Thin" }, new[] { "Heavy", "Heavy", "Body Weight", "Fat" },
            new[] { "Fit", "Fitness", "Bodybuilder", "Muscular" }, new[] { "Shoulders", "Shoulder Width", "Shoulders Width", "Shoulder Size" },
            new[] { "Arms", "Arms Size", "Upper Arm Size", "Arm Size" }, new[] { "Bust", "Breasts Size", "Breast Size", "Breasts Implants", "Breast Implants" },
            new[] { "Waist", "Waist Width", "Waist Size", "Waist" }, new[] { "Hips", "Hip Size", "Hips Size", "Hip Width", "Hips Width" },
            new[] { "Glutes", "Glute Size", "Glutes Size" }, new[] { "Thighs", "Thigh Size", "Thighs Size", "Thighs Width" },
            new[] { "Legs", "Legs Length", "Leg Length" }, new[] { "Neck", "Neck Width", "Neck Length" },
        };
        static readonly string[][] FACE = {
            new[] { "Face width", "Face Width", "Face Round", "Head Width" }, new[] { "Age", "Age", "Older" },
            new[] { "Eye size", "Eyes Size", "Eye Size" }, new[] { "Eye height", "Eyes Height", "Eye Height" },
            new[] { "Brow", "Brow Height", "Brow Size" }, new[] { "Nose width", "Nose Width" }, new[] { "Nose length", "Nose Length", "Nose Size" },
            new[] { "Lips", "Lips Size", "Lip Size", "Lips Full" }, new[] { "Mouth width", "Mouth Width" },
            new[] { "Cheekbones", "Cheekbones Height", "Cheekbones Size", "Cheek Bones" }, new[] { "Jaw", "Jaw Width", "Jaw Size" },
            new[] { "Chin", "Chin Length", "Chin Size" }, new[] { "Ears", "Ears Size", "Ear Size" },
        };
        static readonly string[] SECTIONS = { "Body", "Face", "Skin", "Hair", "Clothes", "Looks" };
        static readonly Dictionary<string, string> KIND = new Dictionary<string, string> { { "Skin", "skin" }, { "Hair", "hair" }, { "Clothes", "clothing" }, { "Looks", "look" } };

        readonly MonoBehaviour host; readonly Link link; readonly Func<string, string, string, string> apply;
        public Panel Panel; string section = "Body"; Atom person;
        RectTransform content; Text who, note; InputField search; readonly Dictionary<string, Button> tabs = new Dictionary<string, Button>();
        readonly Dictionary<string, float> original = new Dictionary<string, float>();
        int build;   // bumps on every rebuild so late thumbnails for an old list are dropped

        public Character(MonoBehaviour host, Link link, Func<string, string, string, string> apply) { this.host = host; this.link = link; this.apply = apply; }

        public void Build(Transform canvas)
        {
            Panel = new Panel(canvas, "character", "Character", new Vector2(380, -360), new Vector2(560, 640), false);
            var b = Panel.Body;
            // the person, Next, Reset
            var top = UI.Rect("Top", b); top.anchorMin = new Vector2(0, 1); top.anchorMax = new Vector2(1, 1); top.pivot = new Vector2(0.5f, 1); top.sizeDelta = new Vector2(0, 48);
            who = UI.Label(top, "", 22, Role.Text, TextAnchor.MiddleLeft); who.fontStyle = FontStyle.Bold; ((RectTransform)who.transform).offsetMax = new Vector2(-230, 0);
            Small(top, "Next person", 220, 110, NextPerson); Small(top, "Reset", 105, 100, Reset);
            // section tabs
            var bar = UI.Rect("Sections", b); bar.anchorMin = new Vector2(0, 1); bar.anchorMax = new Vector2(1, 1); bar.pivot = new Vector2(0.5f, 1);
            bar.sizeDelta = new Vector2(0, 50); bar.anchoredPosition = new Vector2(0, -54);
            var g = bar.gameObject.AddComponent<GridLayoutGroup>(); g.cellSize = new Vector2(84, 50); g.spacing = new Vector2(4, 0);
            foreach (var s in SECTIONS) { var name = s; tabs[s] = UI.Button(bar, s, () => Show(name)); }
            // search
            var sr = UI.Rect("Search", b); sr.anchorMin = new Vector2(0, 1); sr.anchorMax = new Vector2(1, 1); sr.pivot = new Vector2(0.5f, 1);
            sr.sizeDelta = new Vector2(0, 46); sr.anchoredPosition = new Vector2(0, -110);
            UI.Box(sr, Role.Field); search = sr.gameObject.AddComponent<InputField>();
            var ph = UI.Label(sr, "Search", 20, Role.Dim, TextAnchor.MiddleLeft); ph.fontStyle = FontStyle.Italic;
            var tx = UI.Label(sr, "", 20, Role.Text, TextAnchor.MiddleLeft); tx.supportRichText = false; tx.raycastTarget = true;
            search.textComponent = tx; search.placeholder = ph; search.onEndEdit.AddListener(s => Show(section));
            // the list
            var area = UI.Rect("Area", b); UI.Fill(area, 0, 162, 0, 30);
            var vp = UI.Rect("Viewport", area); UI.Fill(vp, 0, 0, 0, 0); vp.gameObject.AddComponent<RectMask2D>();
            var hit = vp.gameObject.AddComponent<Image>(); hit.color = new Color(0, 0, 0, 0.001f);
            content = UI.Rect("Content", vp); content.anchorMin = new Vector2(0, 1); content.anchorMax = new Vector2(1, 1); content.pivot = new Vector2(0.5f, 1); content.sizeDelta = Vector2.zero;
            content.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            var scroll = area.gameObject.AddComponent<ScrollRect>(); scroll.viewport = vp; scroll.content = content; scroll.horizontal = false; scroll.scrollSensitivity = 30;
            var nr = UI.Rect("Note", b); nr.anchorMin = new Vector2(0, 0); nr.anchorMax = new Vector2(1, 0); nr.pivot = new Vector2(0.5f, 0); nr.sizeDelta = new Vector2(0, 28);
            note = UI.Label(nr, "", 16, Role.Dim, TextAnchor.MiddleLeft);
            Panel.Root.gameObject.SetActive(false);
        }

        void Small(RectTransform parent, string text, float fromRight, float w, Action a)
        {
            var r = UI.Rect(text, parent); r.anchorMin = r.anchorMax = new Vector2(1, 0.5f); r.pivot = new Vector2(1, 0.5f); r.sizeDelta = new Vector2(w, 42);
            r.anchoredPosition = new Vector2(-(fromRight - w), 0);
            var bt = UI.Button(r, text, a); var br = (RectTransform)bt.transform; br.anchorMin = Vector2.zero; br.anchorMax = Vector2.one; br.sizeDelta = Vector2.zero;
            bt.GetComponentInChildren<Text>().fontSize = 17;
        }

        // ---- opening ----
        public void Open(string sec)
        {
            Panel.Root.gameObject.SetActive(true); Panel.Root.SetAsLastSibling();
            var sel = SuperController.singleton.GetSelectedAtom();
            if (sel != null && sel.type == "Person") person = sel;
            if (person == null) foreach (var a in SuperController.singleton.GetAtoms()) if (a != null && a.type == "Person") { person = a; break; }
            Show(sec ?? section);
        }
        void NextPerson()
        {
            var list = new List<Atom>(); foreach (var a in SuperController.singleton.GetAtoms()) if (a != null && a.type == "Person") list.Add(a);
            if (list.Count == 0) { person = null; Show(section); return; }
            int i = list.IndexOf(person); person = list[(i + 1) % list.Count]; Show(section);
        }

        void Show(string sec)
        {
            section = sec; build++;
            foreach (var kv in tabs) UI.SetOn(kv.Value, kv.Key == sec);
            for (int i = content.childCount - 1; i >= 0; i--) UnityEngine.Object.Destroy(content.GetChild(i).gameObject);
            who.text = person != null ? person.uid : "No person in this scene"; note.text = "";
            if (person == null) return;
            var q = search.text.Trim();
            if (sec == "Body" || sec == "Face") Shapes(sec == "Body" ? BODY : FACE, q);
            else host.StartCoroutine(Tiles(KIND[sec], q, build));
        }

        // ---- shapes ----
        JSONStorable Geometry() { return person != null ? person.GetStorableByID("geometry") : null; }
        static string Clean(string n)
        {
            int c = n.LastIndexOf(':'); if (c >= 0) n = n.Substring(c + 1);
            int s = Math.Max(n.LastIndexOf('/'), n.LastIndexOf('\\')); if (s >= 0) n = n.Substring(s + 1);
            if (n.EndsWith(".vmi")) n = n.Substring(0, n.Length - 4);
            return n.Replace('_', ' ').Trim();
        }

        void Shapes(string[][] list, string q)
        {
            var geo = Geometry(); if (geo == null) { note.text = "This person has no shape controls (geometry) that Brene can reach."; return; }
            var names = geo.GetFloatParamNames(); if (names == null || names.Count == 0) { note.text = "No shapes found on " + person.uid + ". Tell the coding session."; return; }
            var vert = content.gameObject.GetComponent<VerticalLayoutGroup>(); if (vert == null) { vert = content.gameObject.AddComponent<VerticalLayoutGroup>(); vert.spacing = 4; vert.childControlHeight = true; vert.childControlWidth = true; vert.childForceExpandHeight = false; }
            var grid = content.gameObject.GetComponent<GridLayoutGroup>(); if (grid != null) UnityEngine.Object.Destroy(grid);
            if (q != "")
            {
                // search every shape by its clean name
                var words = q.ToLowerInvariant().Split(' '); int shown = 0;
                foreach (var n in names)
                {
                    var c = Clean(n).ToLowerInvariant(); bool all = true; foreach (var w in words) if (w != "" && !c.Contains(w)) { all = false; break; }
                    if (!all) continue; Row(geo, n, Clean(n)); if (++shown >= 40) break;
                }
                note.text = shown == 0 ? "No shape matches \"" + q + "\"" : shown + " shape(s)" + (shown >= 40 ? " (first 40; add a word)" : "");
                return;
            }
            int found = 0;
            foreach (var entry in list)
            {
                var n = Match(names, entry); if (n == null) continue;
                Row(geo, n, entry[0]); found++;
            }
            note.text = found + " of " + list.Length + " found on this person. Search for any other shape above.";
        }

        // the morph for a friendly slider: an exact (clean, any case) name first, then the shortest name holding all the words
        static string Match(List<string> names, string[] entry)
        {
            for (int k = 1; k < entry.Length; k++) foreach (var n in names) if (string.Equals(Clean(n), entry[k], StringComparison.OrdinalIgnoreCase)) return n;
            string best = null;
            for (int k = 1; k < entry.Length && best == null; k++)
            {
                var words = entry[k].ToLowerInvariant().Split(' ');
                foreach (var n in names)
                {
                    var c = Clean(n).ToLowerInvariant(); bool all = true; foreach (var w in words) if (!c.Contains(w)) { all = false; break; }
                    if (all && (best == null || Clean(n).Length < Clean(best).Length)) best = n;
                }
            }
            return best;
        }

        void Row(JSONStorable geo, string param, string label)
        {
            var f = geo.GetFloatJSONParam(param); if (f == null) return;
            var row = UI.Rect("Row " + label, content); row.gameObject.AddComponent<LayoutElement>().minHeight = 62;
            var lt = UI.Rect("L", row); lt.anchorMin = new Vector2(0, 0.45f); lt.anchorMax = new Vector2(0.4f, 1); lt.offsetMin = lt.offsetMax = Vector2.zero;
            UI.Label(lt, label, 21, Role.Text, TextAnchor.MiddleLeft).fontStyle = FontStyle.Bold;
            var lr = UI.Rect("Real", row); lr.anchorMin = new Vector2(0, 0); lr.anchorMax = new Vector2(0.4f, 0.45f); lr.offsetMin = lr.offsetMax = Vector2.zero;
            UI.Label(lr, Clean(param) == label ? "" : Clean(param), 13, Role.Dim, TextAnchor.UpperLeft);
            var sr = UI.Rect("S", row); sr.anchorMin = new Vector2(0.4f, 0); sr.anchorMax = new Vector2(1, 1); sr.offsetMin = new Vector2(6, 8); sr.offsetMax = new Vector2(-6, -8);
            float lo = Mathf.Min(f.min, -1f), hi = Mathf.Max(f.max, 1f);
            var key = person.uid + "|" + param;
            UI.Slider(sr, lo, hi, f.val, v => { if (!original.ContainsKey(key)) original[key] = f.val; f.val = v; });
        }

        void Reset()
        {
            foreach (var kv in original)
            {
                var parts = kv.Key.Split(new[] { '|' }, 2); var a = SuperController.singleton.GetAtomByUid(parts[0]); if (a == null) continue;
                var geo = a.GetStorableByID("geometry"); if (geo == null) continue; var f = geo.GetFloatJSONParam(parts[1]); if (f != null) f.val = kv.Value;
            }
            int n = original.Count; original.Clear(); Show(section); note.text = n + " shape(s) put back";
        }

        // ---- picture tiles from the library ----
        IEnumerator Tiles(string kind, string q, int myBuild)
        {
            var vert = content.gameObject.GetComponent<VerticalLayoutGroup>(); if (vert != null) UnityEngine.Object.Destroy(vert);
            yield return null;   // let Destroy finish before adding the grid
            if (myBuild != build) yield break;
            var grid = content.gameObject.GetComponent<GridLayoutGroup>(); if (grid == null) grid = content.gameObject.AddComponent<GridLayoutGroup>();
            grid.cellSize = new Vector2(124, 150); grid.spacing = new Vector2(8, 8);
            note.text = "Loading...";
            var req = UnityWebRequest.Get(link.Url + "/lib/items?limit=60&kind=" + kind + "&q=" + WWW_Escape(q)); req.timeout = 10;
            yield return req.SendWebRequest();
            if (myBuild != build) { req.Dispose(); yield break; }
            if (req.isNetworkError || req.isHttpError) { note.text = "Start the Brene relay (start-brene.bat) and set your VaM folder in the Library page."; req.Dispose(); yield break; }
            var j = JSON.Parse(req.downloadHandler.text); req.Dispose();
            var items = j["items"].AsArray; int total = j["total"].AsInt;
            if (items == null || items.Count == 0) { note.text = j["vam"].Value == "" ? "Set your VaM folder in the Library page first (127.0.0.1:8767/library)." : "None found"; yield break; }
            note.text = total + " found" + (total > items.Count ? " (first " + items.Count + "; search to narrow)" : "") + ". Tap one to put it on " + person.uid + ".";
            var thumbs = new List<KeyValuePair<RawImage, string>>();
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i]; var path = it["path"].Value; var name = it["name"].Value;
                var tile = UI.Rect("Tile " + name, content); var bg = UI.Box(tile, Role.Button);
                var btn = tile.gameObject.AddComponent<Button>(); btn.targetGraphic = bg;
                btn.onClick.AddListener(() => { var err = apply(kind, path, person != null ? person.uid : ""); note.text = err ?? ("Applied " + name); });
                var pic = UI.Rect("Pic", tile); pic.anchorMin = new Vector2(0, 0); pic.anchorMax = new Vector2(1, 1); pic.offsetMin = new Vector2(6, 34); pic.offsetMax = new Vector2(-6, -6);
                var raw = pic.gameObject.AddComponent<RawImage>(); raw.color = new Color(1, 1, 1, 0.08f); raw.raycastTarget = false;
                var cap = UI.Rect("Cap", tile); cap.anchorMin = new Vector2(0, 0); cap.anchorMax = new Vector2(1, 0); cap.pivot = new Vector2(0.5f, 0); cap.sizeDelta = new Vector2(0, 32);
                UI.Label(cap, name, 15, Role.Text, TextAnchor.MiddleCenter);
                if (it["thumb"].Value != "") thumbs.Add(new KeyValuePair<RawImage, string>(raw, it["thumb"].Value));
            }
            foreach (var t in thumbs)
            {
                if (myBuild != build) yield break;
                var tr = UnityWebRequest.Get(link.Url + "/lib/thumb?p=" + WWW_Escape(t.Value)); tr.timeout = 10;
                yield return tr.SendWebRequest();
                if (myBuild == build && !tr.isNetworkError && !tr.isHttpError && t.Key != null)
                {
                    var tex = new Texture2D(2, 2);
                    if (tex.LoadImage(tr.downloadHandler.data)) { t.Key.texture = tex; t.Key.color = Color.white; }
                }
                tr.Dispose();
            }
        }
        static string WWW_Escape(string s) { return UnityWebRequest.EscapeURL(s ?? ""); }
    }
}
