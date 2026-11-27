// Brene for Virt-a-Mate: Little Shepersville, the VaM side. Brenai's server is every character's mind and keeps the story
// (day, time, turning points, writing deadlines); VaM is the town and the bodies. Everything goes through the relay's /story/*.
//   Story panel    the day, time and place; the town's places, each tied to a VaM scene (Go loads it, Set picks its scene).
//   Turning point  when Brenai has a question waiting (2 to 4 answers), a card opens in the middle (on the board in VR).
//   Margo's call   her call faces on a screen, changing with what she does in her replies; her voice like a phone call.
//   The laptop     the cabin laptop for writing: title, text, word count, Save (kept on the PC and sent to Brenai), Tell Margo.
// Part of BreneMain.
using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Networking;
using SimpleJSON;

namespace Brene
{
    public partial class BreneMain
    {
        static readonly string[] PLACES = { "Rental cabin", "Peak Pizza", "Casa Belinda", "Main Street", "Library", "Wizra's flat", "Lodge", "Trail", "Lake" };
        Panel pStory, pChoice, pCall, pLaptop; Flow pickFlow; string storyPlace = "", pickFor = "", shownChoice = "";
        Text storyLine, choiceText, callCaption, laptopCount, laptopNote; RectTransform storyPlaces, choiceAnswers; RawImage callFace;
        InputField laptopTitle, laptopText; JSONNode storyState, margoInfo; float nextStory; bool storyBusy;
        readonly Dictionary<string, Texture2D> pics = new Dictionary<string, Texture2D>();

        void BuildStory(Transform root)
        {
            Add("story", "Story", () => Show(pStory), null);
            Add("laptop", "Laptop", OpenLaptop, null);
            Add("margo", "Call Margo", CallMargo, null);
            MakeButton("story", pDock);

            // the story panel: where and when, and the places
            pStory = new Panel(root, "story", "Little Shepersville", new Vector2(700, -40), new Vector2(560, 640), false);
            var v = pStory.Body.gameObject.AddComponent<VerticalLayoutGroup>(); v.spacing = 8; v.childControlHeight = true; v.childControlWidth = true; v.childForceExpandHeight = false;
            var sl = Ui.Rect("Line", pStory.Body); sl.gameObject.AddComponent<LayoutElement>().minHeight = 64;
            storyLine = Ui.Label(sl, "", 20, Role.Text, TextAnchor.MiddleLeft); storyLine.supportRichText = true;
            var tools = Flow.Grid(pStory.Body, new Vector2(170, 52));
            Ui.Button(tools, "Laptop", OpenLaptop); Ui.Button(tools, "Call Margo", CallMargo); Ui.Button(tools, "Talk to...", () => { Show(pChat); NextWho(); });
            Flow.Say(pStory.Body, "Places: Go takes you there (loads its scene). Set picks which VaM scene is that place.");
            storyPlaces = Ui.Rect("Places", pStory.Body); var pv = storyPlaces.gameObject.AddComponent<VerticalLayoutGroup>(); pv.spacing = 4; pv.childControlHeight = true; pv.childControlWidth = true; pv.childForceExpandHeight = false;
            pStory.Root.gameObject.SetActive(false);

            // the scene picker for a place (one step of the flow panel)
            pickFlow = new Flow(root, "pickscene", "Pick a scene", new Vector2(420, -60));
            pickFlow.Steps.Add(new FlowStep("Scene", "Tap the scene for this place.", c => StartCoroutine(FlowTiles(pickFlow.Note, c, "scene", (path, name) =>
            {
                StartCoroutine(Json("POST", "/story/places", Obj("place", pickFor, "scene", path), (j, e) => { pickFlow.Note(e ?? (pickFor + " is now " + name)); RefreshPlaces(); }));
            }))));
            pickFlow.Build();

            // a turning point: the question and its answers, in the middle
            pChoice = new Panel(root, "choice", "A choice", new Vector2(0, 0), new Vector2(620, 420), false); pChoice.CanHide = false;
            var cv = pChoice.Body.gameObject.AddComponent<VerticalLayoutGroup>(); cv.spacing = 10; cv.childControlHeight = true; cv.childControlWidth = true; cv.childForceExpandHeight = false;
            var ct = Ui.Rect("Q", pChoice.Body); ct.gameObject.AddComponent<LayoutElement>().minHeight = 110;
            choiceText = Ui.Label(ct, "", 26, Role.Text, TextAnchor.MiddleCenter); choiceText.fontStyle = FontStyle.Bold;
            choiceAnswers = Ui.Rect("Answers", pChoice.Body); var av = choiceAnswers.gameObject.AddComponent<VerticalLayoutGroup>(); av.spacing = 8; av.childControlHeight = true; av.childControlWidth = true; av.childForceExpandHeight = false;
            pChoice.Root.gameObject.SetActive(false);

            // Margo's video call
            pCall = new Panel(root, "call", "Margo (video call)", new Vector2(700, -40), new Vector2(420, 560), false);
            var fr = Ui.Rect("Face", pCall.Body); Ui.Fill(fr, 0, 0, 0, 120); Ui.Box(fr, Role.Field);
            var fi = Ui.Rect("Img", fr); Ui.Fill(fi, 6, 6, 6, 6); callFace = fi.gameObject.AddComponent<RawImage>(); callFace.color = new Color(1, 1, 1, 0.1f);
            var cc = Ui.Rect("Caption", pCall.Body); cc.anchorMin = new Vector2(0, 0); cc.anchorMax = new Vector2(1, 0); cc.pivot = new Vector2(0.5f, 0); cc.sizeDelta = new Vector2(0, 56); cc.anchoredPosition = new Vector2(0, 60);
            callCaption = Ui.Label(cc, "", 18, Role.Dim, TextAnchor.MiddleCenter);
            var hb = Ui.Rect("Hang up", pCall.Body); hb.anchorMin = new Vector2(0, 0); hb.anchorMax = new Vector2(1, 0); hb.pivot = new Vector2(0.5f, 0); hb.sizeDelta = new Vector2(0, 52);
            Flow.Stretch(Ui.Button(hb, "Hang up", () => { pCall.Root.gameObject.SetActive(false); TalkTo("wizra"); }));
            pCall.Root.gameObject.SetActive(false);

            // the cabin laptop
            pLaptop = new Panel(root, "laptop", "Cabin laptop", new Vector2(380, -40), new Vector2(760, 640), false);
            var tr = Ui.Rect("Title", pLaptop.Body); tr.anchorMin = new Vector2(0, 1); tr.anchorMax = new Vector2(1, 1); tr.pivot = new Vector2(0.5f, 1); tr.sizeDelta = new Vector2(0, 46);
            laptopTitle = Field(tr, "Chapter title", 22, false);
            var tx = Ui.Rect("Text", pLaptop.Body); Ui.Fill(tx, 0, 54, 0, 96);
            laptopText = Field(tx, "Write here...", 20, true);
            laptopText.onValueChanged.AddListener(s => Count());
            var nr = Ui.Rect("Note", pLaptop.Body); nr.anchorMin = new Vector2(0, 0); nr.anchorMax = new Vector2(1, 0); nr.pivot = new Vector2(0.5f, 0); nr.sizeDelta = new Vector2(0, 30); nr.anchoredPosition = new Vector2(0, 60);
            laptopCount = Ui.Label(nr, "0 words", 17, Role.Dim, TextAnchor.MiddleLeft);
            var lb = Ui.Rect("Buttons", pLaptop.Body); lb.anchorMin = new Vector2(0, 0); lb.anchorMax = new Vector2(1, 0); lb.pivot = new Vector2(0.5f, 0); lb.sizeDelta = new Vector2(0, 54);
            var lg = lb.gameObject.AddComponent<GridLayoutGroup>(); lg.cellSize = new Vector2(240, 54); lg.spacing = new Vector2(8, 0);
            Ui.SetOn(Ui.Button(lb, "Save", SaveWriting), true); Ui.Button(lb, "Tell Margo", TellMargo); Ui.Button(lb, "Close", () => pLaptop.Root.gameObject.SetActive(false));
            laptopNote = laptopCount;
            pLaptop.Root.gameObject.SetActive(false);
            RefreshPlaces();
        }

        InputField Field(RectTransform rt, string hint, int size, bool multi)
        {
            Ui.Box(rt, Role.Field); var f = rt.gameObject.AddComponent<InputField>();
            var ph = Ui.Label(rt, hint, size, Role.Dim, multi ? TextAnchor.UpperLeft : TextAnchor.MiddleLeft); ph.fontStyle = FontStyle.Italic;
            var t = Ui.Label(rt, "", size, Role.Text, multi ? TextAnchor.UpperLeft : TextAnchor.MiddleLeft); t.supportRichText = false; t.raycastTarget = true;
            if (multi) { ((RectTransform)t.transform).offsetMin = new Vector2(10, 8); ((RectTransform)t.transform).offsetMax = new Vector2(-10, -8); ((RectTransform)ph.transform).offsetMax = new Vector2(-10, -8); }
            f.textComponent = t; f.placeholder = ph; f.lineType = multi ? InputField.LineType.MultiLineNewline : InputField.LineType.SingleLine;
            return f;
        }
        void Show(Panel p) { p.Root.gameObject.SetActive(true); p.Root.SetAsLastSibling(); }

        // ---- talking to the relay ----
        static JSONClass Obj(params string[] kv) { var j = new JSONClass(); for (int i = 0; i + 1 < kv.Length; i += 2) j[kv[i]] = kv[i + 1]; return j; }
        IEnumerator Json(string method, string path, JSONNode body, Action<JSONNode, string> done)
        {
            var req = new UnityWebRequest(link.Url + path, method); req.downloadHandler = new DownloadHandlerBuffer(); req.timeout = 15;
            if (body != null) { req.uploadHandler = new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes(body.ToString())); req.SetRequestHeader("Content-Type", "application/json"); }
            yield return req.SendWebRequest();
            if (req.isNetworkError) { done(null, "The Brene relay is not running (start-brene.bat)"); req.Dispose(); yield break; }
            JSONNode j = null; try { j = JSON.Parse(req.downloadHandler.text); } catch (Exception) { }
            req.Dispose();
            if (j == null) done(null, "Bad answer from the relay"); else if (j["error"] != null && j["error"].Value != "") done(j, j["error"].Value); else done(j, null);
        }
        IEnumerator Picture(string rel, Action<Texture2D> done)
        {
            Texture2D t; if (pics.TryGetValue(rel, out t) && t != null) { done(t); yield break; }
            var req = UnityWebRequest.Get(link.Url + "/story/media?p=" + UnityWebRequest.EscapeURL(rel)); req.timeout = 10;
            yield return req.SendWebRequest();
            if (!req.isNetworkError && !req.isHttpError) { t = new Texture2D(2, 2); if (t.LoadImage(req.downloadHandler.data)) { pics[rel] = t; done(t); } }
            req.Dispose();
        }

        // ---- every couple of seconds: the story's state, and a turning point if one is waiting ----
        void TickStory()
        {
            if (pStory == null || storyBusy || !link.Connected || Time.realtimeSinceStartup < nextStory) return;
            nextStory = Time.realtimeSinceStartup + 2f; storyBusy = true;
            StartCoroutine(Json("GET", "/story/state", null, (j, e) =>
            {
                storyBusy = false; if (j == null) return; storyState = j;
                storyPlace = j["place"].Value;
                var line = j["live"].AsBool
                    ? "<b>Day " + j["day"].Value + "</b>, " + j["time"].Value + (storyPlace != "" ? "   at <b>" + storyPlace + "</b>" : "")
                    : "<color=#ffb070>" + (j["note"].Value != "" ? j["note"].Value : "The story is not running yet") + "</color>" + (storyPlace != "" ? "\nYou are at <b>" + storyPlace + "</b>" : "");
                storyLine.text = line;
                var pend = j["pending"];
                if (pend != null && pend["id"] != null && pend["id"].Value != "" && pend["id"].Value != shownChoice) ShowChoice(pend);
            }));
        }

        void ShowChoice(JSONNode pend)
        {
            shownChoice = pend["id"].Value; choiceText.text = pend["question"].Value;
            for (int i = choiceAnswers.childCount - 1; i >= 0; i--) Destroy(choiceAnswers.GetChild(i).gameObject);
            var ans = pend["answers"].AsArray; if (ans == null) return;
            for (int i = 0; i < ans.Count && i < 4; i++)
            {
                int k = i; string label = ans[i].Value;
                Flow.Wide(choiceAnswers, label, () =>
                {
                    var body = new JSONClass(); body["id"] = shownChoice; body["answer"].AsInt = k;
                    StartCoroutine(Json("POST", "/story/choose", body, (j, e) => { if (e != null) Line("<color=#ff8a8a>" + Esc(e) + "</color>"); else { Line("<i>You chose: " + Esc(label) + "</i>"); pChoice.Root.gameObject.SetActive(false); } }));
                }, k == 0);
            }
            // in the middle of the screen (or the board), above everything
            var size = vr ? BoardSize() : new Vector2(Screen.width / uiSize.val, Screen.height / uiSize.val);
            pChoice.Root.anchoredPosition = new Vector2((size.x - pChoice.Root.sizeDelta.x) / 2, -(size.y - pChoice.Root.sizeDelta.y) / 2);
            Show(pChoice);
        }

        // ---- places ----
        void RefreshPlaces()
        {
            if (storyPlaces == null) return;
            StartCoroutine(Json("GET", "/story/places", null, (j, e) =>
            {
                for (int i = storyPlaces.childCount - 1; i >= 0; i--) Destroy(storyPlaces.GetChild(i).gameObject);
                var map = j != null ? j["places"] : null;
                foreach (var pl in PLACES)
                {
                    var place = pl; bool set = map != null && map[place] != null && map[place].Value != "";
                    var row = Flow.Grid(storyPlaces, new Vector2(170, 48));
                    Ui.Label(Ui.Rect("Name", row), place, 19, set ? Role.Text : Role.Dim, TextAnchor.MiddleLeft).fontStyle = FontStyle.Bold;
                    Ui.SetOn(Ui.Button(row, set ? "Go" : "Go (no scene)", () => GoTo(place)), set);
                    Ui.Button(row, set ? "Change scene" : "Set scene", () => { pickFor = place; pickFlow.Steps[0].Hint = "Tap the VaM scene that is " + place + "."; pickFlow.Open(0); });
                }
            }));
        }
        void GoTo(string place)
        {
            StartCoroutine(Json("POST", "/story/goto", Obj("place", place), (j, e) =>
            {
                if (e != null) { Line("<color=#ff8a8a>" + Esc(e) + "</color>"); return; }
                storyPlace = place; if (j["note"] != null && j["note"].Value != "") Line("<i>" + Esc(j["note"].Value) + "</i>"); else Line("<i>Going to " + place + "...</i>");
            }));
        }

        // ---- Margo's call ----
        void CallMargo()
        {
            Show(pCall); Show(pChat); TalkTo("margo"); callCaption.text = "Connecting...";
            if (margoInfo == null) StartCoroutine(Json("GET", "/story/margo", null, (j, e) => { margoInfo = j; if (e != null) callCaption.text = e; else Face("warm", ""); }));
            else Face("warm", "");
        }
        void MargoHeard(string reply)
        {
            if (!pCall.Root.gameObject.activeSelf) return;
            var f = Feeling(reply);
            Face(f == "smile" ? "smiling" : f == "frown" ? "stern" : f == "surprise" ? "delighted" : "listening", "");
        }
        // a call face by mood (warm, listening, smiling, delighted, skeptical, stern, evening, weekend)
        void Face(string mood, string caption)
        {
            if (margoInfo == null) return; var calls = margoInfo["call"].AsArray; if (calls == null) return;
            string file = null; for (int i = 0; i < calls.Count; i++) if (calls[i]["mood"].Value == mood) file = calls[i]["file"].Value;
            if (file == null && calls.Count > 0) file = calls[0]["file"].Value;
            if (file == null) return;
            callCaption.text = caption != "" ? caption : "Margo · " + mood;
            StartCoroutine(Picture("margo/" + file, t => { callFace.texture = t; callFace.color = Color.white; }));
        }

        // ---- the laptop ----
        void OpenLaptop()
        {
            Show(pLaptop);
            StartCoroutine(Json("GET", "/story/writing", null, (j, e) =>
            {
                if (j == null) { laptopNote.text = e; return; }
                if (laptopText.text == "" && j["text"].Value != "") { laptopTitle.text = j["title"].Value; laptopText.text = j["text"].Value; }
                Count();
            }));
        }
        int Words() { int n = 0; bool inWord = false; foreach (var ch in laptopText.text) { bool w = !char.IsWhiteSpace(ch); if (w && !inWord) n++; inWord = w; } return n; }
        void Count() { if (laptopCount != null) laptopCount.text = Words() + " words"; }
        void SaveWriting()
        {
            var body = Obj("title", laptopTitle.text == "" ? "Untitled" : laptopTitle.text, "text", laptopText.text);
            StartCoroutine(Json("POST", "/story/writing", body, (j, e) => laptopNote.text = e ?? (j["words"].Value + " words saved" + (j["sentToBrenai"].AsBool ? ", sent to Brenai" : " on this PC"))));
        }
        void TellMargo()
        {
            SaveWriting();
            var title = laptopTitle.text == "" ? "my pages" : "\"" + laptopTitle.text + "\"";
            CallMargo(); SayTo("margo", "*sends her " + title + ", " + Words() + " words*", null);
        }
    }
}
