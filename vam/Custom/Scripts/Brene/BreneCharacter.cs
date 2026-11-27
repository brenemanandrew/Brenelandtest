// Brene for Virt-a-Mate: the Character panel, VaM's character editor in plain words, laid out as a flow:
//   1 Who > 2 Start from (a whole look, or as is) > 3 Body > 4 Face > 5 Skin > 6 Hair > 7 Clothes > 8 Pose > 9 Finish (save)
// Back and Next walk the steps in order; the numbered steps along the top jump anywhere. Nothing of VaM's is hidden: every
// shape is reachable from "All body shapes" / "All face shapes" (and search), and VaM's own menus are untouched.
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
        static readonly string[] STEPS = { "Who", "Start", "Body", "Face", "Skin", "Hair", "Clothes", "Pose", "Personality", "Reactions", "Finish" };
        static readonly Dictionary<string, string> KIND = new Dictionary<string, string> { { "Start", "look" }, { "Skin", "skin" }, { "Hair", "hair" }, { "Clothes", "clothing" }, { "Pose", "pose" } };
        static readonly Dictionary<string, string> HINT = new Dictionary<string, string> {
            { "Who", "Pick who to work on." }, { "Start", "Start from a saved look, or keep them as they are." }, { "Body", "Shape the body." },
            { "Face", "Shape the face." }, { "Skin", "Pick a skin." }, { "Hair", "Pick a hairstyle." }, { "Clothes", "Pick clothes." },
            { "Pose", "Pick a pose." }, { "Personality", "Who she is (from Brenai)." }, { "Reactions", "What she does when you touch her." }, { "Finish", "Save the look, or the whole scene." } };
        static readonly string[] FACE_WORDS = { "face", "head", "eye", "brow", "nose", "nostril", "lip", "mouth", "jaw", "chin", "cheek", "ear", "forehead", "temple", "teeth", "tongue", "smile", "frown", "blink", "squint", "sneer", "pupil", "iris", "lash", "lid", "philtrum", "skull" };

        readonly MonoBehaviour host; readonly Link link; readonly Func<string, string, string, string> apply;
        public Panel Panel; string section = "Who"; Atom person; bool showAll; int allPage;
        RectTransform content; Text who, note, hint; InputField search; readonly Dictionary<string, Button> tabs = new Dictionary<string, Button>();
        readonly Dictionary<string, float> original = new Dictionary<string, float>();
        int build;   // bumps on every rebuild so late thumbnails for an old list are dropped

        public Character(MonoBehaviour host, Link link, Func<string, string, string, string> apply) { this.host = host; this.link = link; this.apply = apply; }

        public void Build(Transform canvas)
        {
            Panel = new Panel(canvas, "character", "Character", new Vector2(380, -300), new Vector2(760, 720), false);
            var b = Panel.Body;
            // the person, Next person, Reset shapes
            var top = Ui.Rect("Top", b); Ui.Top(top, 48, 0);
            who = Ui.Label(top, "", 22, Role.Text, TextAnchor.MiddleLeft); who.fontStyle = FontStyle.Bold; ((RectTransform)who.transform).offsetMax = new Vector2(-260, 0);
            Small(top, "Next person", 260, 130, NextPerson); Small(top, "Reset shapes", 125, 125, Reset);
            // the steps, numbered, in order
            var bar = Ui.Rect("Steps", b); StepsRt = bar; Ui.Top(bar, 52, 54);
            var g = bar.gameObject.AddComponent<GridLayoutGroup>(); g.cellSize = new Vector2(64, 52); g.spacing = new Vector2(3, 0);
            for (int k = 0; k < STEPS.Length; k++) { var name = STEPS[k]; var tb = Ui.Button(bar, (k + 1) + "\n" + (name == "Personality" ? "Traits" : name == "Reactions" ? "React" : name), () => Show(name)); tb.GetComponentInChildren<Text>().fontSize = 14; tabs[name] = tb; }
            // search
            var sr = Ui.Rect("Search", b); Ui.Top(sr, 44, 146);
            var hr = Ui.Rect("Hint", b); Ui.Top(hr, 36, 110);
            hint = Ui.Label(hr, "", 20, Role.Accent, TextAnchor.MiddleLeft); hint.fontStyle = FontStyle.Bold;
            Ui.Box(sr, Role.Field); search = sr.gameObject.AddComponent<InputField>();
            var ph = Ui.Label(sr, "Search", 20, Role.Dim, TextAnchor.MiddleLeft); ph.fontStyle = FontStyle.Italic;
            var tx = Ui.Label(sr, "", 20, Role.Text, TextAnchor.MiddleLeft); tx.supportRichText = false; tx.raycastTarget = true;
            search.textComponent = tx; search.placeholder = ph; search.onEndEdit.AddListener(s => Show(section));
            // the list
            var area = Ui.Rect("Area", b); Ui.Fill(area, 0, 196, 0, 92);
            content = Ui.Scroll(area).content;
            var vl = content.gameObject.AddComponent<VerticalLayoutGroup>(); vl.spacing = 6; vl.childControlHeight = true; vl.childControlWidth = true; vl.childForceExpandHeight = false;
            // Back and Next
            var nav = Ui.Rect("Nav", b); Ui.Bottom(nav, 54, 32);
            var back = Ui.Rect("Back", nav); Ui.Span(back, 0, 0.32f);
            var bb = Ui.Button(back, "< Back", () => Step(-1)); Ui.Stretch(bb);
            var next = Ui.Rect("Next", nav); Ui.Span(next, 0.36f, 1);
            NextRt = next; nextBtn = Ui.Button(next, "Next >", () => Step(1)); Ui.Stretch(nextBtn); Ui.SetOn(nextBtn, true);
            var nr = Ui.Rect("Note", b); Ui.Bottom(nr, 28, 0);
            note = Ui.Label(nr, "", 16, Role.Dim, TextAnchor.MiddleLeft);
            Panel.Root.gameObject.SetActive(false);
        }

        Button nextBtn;
        public RectTransform StepsRt, NextRt, AllShapesRt;   // for the tutorial's spotlight
        public string SaveName, LastApplied = "";              // the name Finish offers; the kind of the last tile tapped
        public Action<Atom> MakeWizra;                         // Finish's "Make her Wizra"
        public Action<string, Atom> MakeCast;
        public Action<RectTransform, Atom> BuildPersonality, BuildReactions;   // steps 9 and 10 come from BreneMain (they need Brenai)
        public void Redraw() { Show(section, true); }
        public void Note(string s) { if (note != null) note.text = s ?? ""; }                  // Finish's "Make her Zoe / Belinda / Margo" (Little Shepersville)
        public int Changed { get { return original.Count; } }
        public void Find(string q) { search.text = q; Show(section, true); }
        public string Section { get { return section; } }
        void Step(int d)
        {
            int i = Array.IndexOf(STEPS, section) + d;
            if (i >= STEPS.Length) { Panel.Root.gameObject.SetActive(false); return; }   // Next on Finish: done
            Show(STEPS[Mathf.Clamp(i, 0, STEPS.Length - 1)]);
        }

        void Small(RectTransform parent, string text, float fromRight, float w, Action a)
        {
            var r = Ui.Rect(text, parent); r.anchorMin = r.anchorMax = new Vector2(1, 0.5f); r.pivot = new Vector2(1, 0.5f); r.sizeDelta = new Vector2(w, 42);
            r.anchoredPosition = new Vector2(-(fromRight - w), 0);
            var bt = Ui.Button(r, text, a); Ui.Stretch(bt);
            bt.GetComponentInChildren<Text>().fontSize = 17;
        }

        // ---- opening ----
        public void Open(string sec)
        {
            Panel.Root.gameObject.SetActive(true); Panel.Root.SetAsLastSibling();
            var sel = SuperController.singleton.GetSelectedAtom();
            if (sel != null && sel.type == "Person") person = sel;
            if (person == null) foreach (var a in SuperController.singleton.GetAtoms()) if (a != null && a.type == "Person") { person = a; break; }
            if (sec == "Looks") sec = "Start";
            Show(sec ?? (person == null ? "Who" : section));
        }
        void NextPerson()
        {
            var list = new List<Atom>(); foreach (var a in SuperController.singleton.GetAtoms()) if (a != null && a.type == "Person") list.Add(a);
            if (list.Count == 0) { person = null; Show(section); return; }
            int i = list.IndexOf(person); person = list[(i + 1) % list.Count]; Show(section);
        }

        void Show(string sec) { Show(sec, false); }
        void Show(string sec, bool keepSearch)
        {
            if (sec != section && !keepSearch) { showAll = false; allPage = 0; search.text = ""; }
            section = sec; build++;
            foreach (var kv in new List<KeyValuePair<string, Button>>(tabs)) Ui.SetOn(kv.Value, kv.Key == sec);
            for (int i = content.childCount - 1; i >= 0; i--) UnityEngine.Object.Destroy(content.GetChild(i).gameObject);
            int at = Array.IndexOf(STEPS, sec);
            hint.text = "Step " + (at + 1) + " of " + STEPS.Length + ": " + HINT[sec];
            Ui.SetText(nextBtn, at == STEPS.Length - 1 ? "Done" : "Next: " + STEPS[at + 1] + " >");
            who.text = person != null ? person.uid : "No person yet"; note.text = "";
            search.gameObject.SetActive(sec != "Who" && sec != "Finish" && sec != "Personality" && sec != "Reactions");
            if (sec == "Who") { People(); return; }
            if (person == null) { note.text = "There is no person in this scene. Add one in VaM (Add Atom > People)."; return; }
            var q = search.text.Trim();
            if (sec == "Finish") Finish();
            else if (sec == "Personality") { if (BuildPersonality != null) BuildPersonality(content, person); }
            else if (sec == "Reactions") { if (BuildReactions != null) BuildReactions(content, person); }
            else if (sec == "Body" || sec == "Face") Shapes(sec == "Face", q);
            else Tiles(KIND[sec], q, build);
        }

        // step 1: big buttons, one per person in the scene
        void People()
        {
            var grid = Grid(new Vector2(190, 70)); int n = 0;
            foreach (var a in SuperController.singleton.GetAtoms())
            {
                if (a == null || a.type != "Person") continue; var atom = a; n++;
                var bt = Ui.Button(grid, atom.uid, () => { if (atom == null) { Show("Who"); return; } person = atom; if (atom.mainController != null) SuperController.singleton.SelectController(atom.mainController); Show("Start"); });
                Ui.SetOn(bt, atom == person);
            }
            note.text = n == 0 ? "There is no person in this scene. Add one in VaM (Add Atom > People)." : "Tap one to start.";
        }

        // step 9: save
        void Finish()
        {
            var row = Row2("Look name"); var nameRt = Ui.Rect("Name", row); Ui.Span(nameRt, 0.3f, 1);
            Ui.Box(nameRt, Role.Field); var nameIn = nameRt.gameObject.AddComponent<InputField>();
            var tx = Ui.Label(nameRt, "", 20, Role.Text, TextAnchor.MiddleLeft); tx.raycastTarget = true; nameIn.textComponent = tx; nameIn.text = !string.IsNullOrEmpty(SaveName) ? SaveName : person.uid + " look";
            var grid = Grid(new Vector2(200, 60));
            Ui.SetOn(Ui.Button(grid, "Save look", () => note.text = SaveLook(nameIn.text)), true);
            Ui.Button(grid, "Save scene", () => SuperController.singleton.gameObject.SendMessage("SaveSceneDialog", SendMessageOptions.DontRequireReceiver));
            Ui.Button(grid, "Start over", () => Show("Who"));
            if (MakeWizra != null) Ui.SetOn(Ui.Button(grid, "Make her Wizra", () => { MakeWizra(person); note.text = person.uid + " is Wizra's body now: her voice, lips and face."; }), true);
            if (MakeCast != null) foreach (var w in new[] { "Zoe", "Belinda", "Margo" }) { var who = w; Ui.Button(grid, "Make her " + who, () => { MakeCast(who.ToLowerInvariant(), person); note.text = person.uid + " is " + who + "'s body now."; }); }
            note.text = original.Count + " shape(s) changed on " + person.uid + ". Reset shapes puts them back.";
        }
        // VaM's appearance preset store: name it, then its store action. Not yet checked inside VaM.
        string SaveLook(string name)
        {
            var st = person.GetStorableByID("AppearancePresets"); if (st == null) return person.uid + " has no AppearancePresets";
            var nm = st.GetStringJSONParam("presetName"); if (nm != null) nm.val = name;
            st.CallAction("StorePreset");
            return "Asked VaM to save \"" + name + "\". If it does not show in Looks, tell the coding session.";
        }

        RectTransform Row2(string label)
        {
            var row = Ui.Rect("Row " + label, content); row.gameObject.AddComponent<LayoutElement>().minHeight = 56;
            var lt = Ui.Rect("L", row); Ui.Span(lt, 0, 0.3f);
            Ui.Label(lt, label, 20, Role.Text, TextAnchor.MiddleLeft);
            return row;
        }
        RectTransform Grid(Vector2 cell)
        {
            var gr = Ui.Rect("Grid", content); var g = gr.gameObject.AddComponent<GridLayoutGroup>(); g.cellSize = cell; g.spacing = new Vector2(8, 8);
            return gr;
        }

        // ---- shapes ----
        JSONStorable Geometry() { return person != null ? person.GetStorableByID("geometry") : null; }
        public static string Clean(string n)
        {
            int c = n.LastIndexOf(':'); if (c >= 0) n = n.Substring(c + 1);
            int s = Math.Max(n.LastIndexOf('/'), n.LastIndexOf('\\')); if (s >= 0) n = n.Substring(s + 1);
            if (n.EndsWith(".vmi")) n = n.Substring(0, n.Length - 4);
            return n.Replace('_', ' ').Trim();
        }

        static bool IsFace(string clean) { var c = clean.ToLowerInvariant(); foreach (var w in FACE_WORDS) if (c.Contains(w)) return true; return false; }

        void Shapes(bool face, string q)
        {
            var list = face ? FACE : BODY;
            var geo = Geometry(); if (geo == null) { note.text = "This person has no shape controls (geometry) that Brene can reach."; return; }
            var names = geo.GetFloatParamNames(); if (names == null || names.Count == 0) { note.text = "No shapes found on " + person.uid + ". Tell the coding session."; return; }
            if (q != "")
            {
                // search every shape by its clean name
                var words = q.ToLowerInvariant().Split(' '); int shown = 0;
                foreach (var n in names)
                {
                    var c = Clean(n).ToLowerInvariant(); bool all = true; foreach (var w in words) if (w != "" && !c.Contains(w)) { all = false; break; }
                    if (!all) continue; Row(geo, n, Clean(n)); if (++shown >= 60) break;
                }
                note.text = shown == 0 ? "No shape matches \"" + q + "\"" : shown + " shape(s)" + (shown >= 60 ? " (first 60; add a word)" : "");
                return;
            }
            int found = 0;
            foreach (var entry in list) { var n = Match(names, entry); if (n == null) continue; Row(geo, n, entry[0]); found++; }
            // every other shape in this region, sorted by clean name, a page at a time: nothing of VaM's is out of reach
            var region = new List<string>(); foreach (var n in names) if (IsFace(Clean(n)) == face) region.Add(n);
            region.Sort((x, y) => string.Compare(Clean(x), Clean(y), StringComparison.OrdinalIgnoreCase));
            var tg = Ui.Rect("All", content); AllShapesRt = tg; tg.gameObject.AddComponent<LayoutElement>().minHeight = 52;
            Ui.Stretch(Ui.Button(tg, (showAll ? "Hide " : "Show ") + "all " + region.Count + (face ? " face" : " body") + " shapes", () => { showAll = !showAll; allPage = 0; Show(section); }));
            if (showAll)
            {
                int end = Math.Min(region.Count, (allPage + 1) * 60);
                for (int i = 0; i < end; i++) Row(geo, region[i], Clean(region[i]));
                if (end < region.Count) { var mg = Ui.Rect("More", content); mg.gameObject.AddComponent<LayoutElement>().minHeight = 52; Ui.Stretch(Ui.Button(mg, "Show more (" + (region.Count - end) + " left)", () => { allPage++; Show(section); })); }
            }
            note.text = found + " of " + list.Length + " simple sliders found. Every other shape is under \"all shapes\", or search.";
        }

        // the morph for a friendly slider: an exact (clean, any case) name first, then the shortest name holding all the words
        public static string Match(List<string> names, string[] entry)
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
            var row = Ui.Rect("Row " + label, content); row.gameObject.AddComponent<LayoutElement>().minHeight = 62;
            var lt = Ui.Rect("L", row); lt.anchorMin = new Vector2(0, 0.45f); lt.anchorMax = new Vector2(0.4f, 1); lt.offsetMin = lt.offsetMax = Vector2.zero;
            Ui.Label(lt, label, 21, Role.Text, TextAnchor.MiddleLeft).fontStyle = FontStyle.Bold;
            var lr = Ui.Rect("Real", row); lr.anchorMin = new Vector2(0, 0); lr.anchorMax = new Vector2(0.4f, 0.45f); lr.offsetMin = lr.offsetMax = Vector2.zero;
            Ui.Label(lr, Clean(param) == label ? "" : Clean(param), 13, Role.Dim, TextAnchor.UpperLeft);
            var sr = Ui.Rect("S", row); sr.anchorMin = new Vector2(0.4f, 0); sr.anchorMax = new Vector2(1, 1); sr.offsetMin = new Vector2(6, 8); sr.offsetMax = new Vector2(-6, -8);
            float lo = Mathf.Min(f.min, -1f), hi = Mathf.Max(f.max, 1f);
            var key = person.uid + "|" + param;
            Ui.Slider(sr, lo, hi, f.val, v => { if (!original.ContainsKey(key)) original[key] = f.val; f.val = v; });
        }

        void Reset()
        {
            foreach (var kv in new List<KeyValuePair<string, float>>(original))
            {
                var parts = kv.Key.Split(new[] { '|' }, 2); var a = SuperController.singleton.GetAtomByUid(parts[0]); if (a == null) continue;
                var geo = a.GetStorableByID("geometry"); if (geo == null) continue; var f = geo.GetFloatJSONParam(parts[1]); if (f != null) f.val = kv.Value;
            }
            int n = original.Count; original.Clear(); Show(section); note.text = n + " shape(s) put back";
        }

        // ---- picture tiles from the library ----
        void Tiles(string kind, string q, int myBuild)
        {
            if (kind == "look")
            {
                var kr = Ui.Rect("Keep", content); kr.gameObject.AddComponent<LayoutElement>().minHeight = 52;
                Ui.Stretch(Ui.Button(kr, "Keep " + person.uid + " as they are  >", () => Show("Body")));
            }
            var grid = Grid(new Vector2(132, 158));
            note.text = "Loading...";
            host.StartCoroutine(link.Json("GET", "/lib/items?limit=60&kind=" + kind + "&q=" + UnityWebRequest.EscapeURL(q ?? ""), null, 10, (JSONNode j, string e) =>
            {
                if (myBuild != build || grid == null) return;   // the list was redrawn while the relay was answering
                if (j == null || e != null) { note.text = "Start the Brene relay (start-brene.bat) and set your VaM folder in the Library page."; return; }
                var items = j["items"].AsArray; int total = j["total"].AsInt;
                if (items == null || items.Count == 0) { note.text = j["vam"].Value == "" ? "Set your VaM folder in the Library page first (127.0.0.1:8767/library)." : q != "" ? "Nothing matches \"" + q + "\". Clear the search to see them all." : "None found"; return; }
                note.text = total + " found" + (total > items.Count ? " (first " + items.Count + "; search to narrow)" : "") + ". Tap one to put it on " + (person != null ? person.uid : "the person") + ".";
                var tiles = new List<RawImage>(); var thumbs = new List<string>();
                for (int i = 0; i < items.Count; i++)
                {
                    var it = items[i]; var path = it["path"].Value; var name = it["name"].Value;
                    var raw = Pics.Tile(grid, name, () => { var err = apply(kind, path, person != null ? person.uid : ""); note.text = err ?? ("Applied " + name); if (err == null) LastApplied = kind; });
                    if (it["thumb"].Value != "") { tiles.Add(raw); thumbs.Add(it["thumb"].Value); }
                }
                host.StartCoroutine(link.Thumbs(tiles, thumbs));
            }));
        }
    }
}
