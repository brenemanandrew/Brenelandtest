// Brene for Virt-a-Mate: big, clear panels you can drag around, Wizra's chat, and VITURE glasses support.
// Load Brene.cslist as a Session plugin (Main menu > Session Plugin Presets) so it stays across scenes, or on any atom in a scene.
// Layout, theme and size are saved to Saves/PluginData/Brene/layout.json with "Save layout" (and on every change in edit mode).
//
// VaM calls that are not certain to exist in every VaM version (undo, the save and load dialogs, the main menu) go through
// SendMessage, which does nothing if the method is missing instead of stopping the whole plugin from loading.
using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using SimpleJSON;
using MVR.FileManagementSecure;

namespace Brene
{
    public class BreneMain : MVRScript
    {
        const string DIR = "Saves/PluginData/Brene", FILE = "Saves/PluginData/Brene/layout.json";

        class Act { public string id, label; public Action run; public Func<bool> on; public Button btn; }
        readonly Dictionary<string, Act> acts = new Dictionary<string, Act>();

        GameObject canvasGo; Canvas canvas; CanvasScaler scaler;
        Panel pScene, pPeople, pGlasses, pChat, pLayout, pDock;
        Text status, chatLog; InputField chatIn; ScrollRect chatScroll; RectTransform peopleList;
        Link link; Viture vit; bool chatBusy; float nextStatus, nextPeople, saveAt = -1;
        readonly List<string> chatLines = new List<string>();

        JSONStorableString relayUrl; JSONStorableBool showUi, headOn, stereoOn, fullOn, handsOn, swapEyes, flipYaw, flipPitch, flipRoll;
        JSONStorableFloat uiSize, ipd, posScale;

        public override void Init()
        {
            try
            {
                link = new Link(); vit = new Viture(link);
                relayUrl = new JSONStorableString("Relay address", "http://127.0.0.1:8767", s => link.Url = s.TrimEnd('/'));
                RegisterString(relayUrl); CreateTextField(relayUrl).height = 60; link.Url = relayUrl.val;
                showUi = Bool("Show Brene panels", true, v => { if (canvasGo != null) canvasGo.SetActive(v); });
                uiSize = new JSONStorableFloat("Panel size", 1.25f, v => { if (scaler != null) scaler.scaleFactor = v; }, 0.6f, 3f);
                RegisterFloat(uiSize); CreateSlider(uiSize);
                headOn = Bool("Head tracking (glasses)", true, v => vit.Head = v);
                handsOn = Bool("Hand control", true, v => vit.HandsOn = v);
                stereoOn = Bool("3D side by side", false, v => vit.Stereo = v);
                fullOn = Bool("3D Full (32:9 screen)", false, v => vit.Full = v);
                swapEyes = Bool("Swap eyes", false, v => vit.SwapEyes = v);
                flipYaw = Bool("Flip left/right", false, v => vit.FlipYaw = v);
                flipPitch = Bool("Flip up/down", false, v => vit.FlipPitch = v);
                flipRoll = Bool("Flip tilt", false, v => vit.FlipRoll = v);
                ipd = new JSONStorableFloat("Eye spacing (m)", 0.064f, v => vit.Ipd = v, 0.04f, 0.08f); RegisterFloat(ipd); CreateSlider(ipd, true);
                posScale = new JSONStorableFloat("6DOF movement scale", 1f, v => vit.PosScale = v, 0f, 3f); RegisterFloat(posScale); CreateSlider(posScale, true);
                CreateButton("Re-centre head", true).button.onClick.AddListener(() => vit.Recenter());
                CreateButton("Reset panel layout", true).button.onClick.AddListener(ResetLayout);

                Actions();
                BuildCanvas();
                LoadLayout();
                StartCoroutine(link.Poll(() => vit.Head || vit.HandsOn));
            }
            catch (Exception e) { SuperController.LogError("Brene: " + e); }
        }

        JSONStorableBool Bool(string name, bool def, Action<bool> set)
        {
            var b = new JSONStorableBool(name, def, v => { set(v); Refresh(); }); RegisterBool(b); CreateToggle(b, name.StartsWith("Flip") || name.StartsWith("Swap") || name.StartsWith("3D"));
            set(def); return b;
        }

        // ---- the actions a button can run ----
        void Actions()
        {
            var sc = SuperController.singleton;
            Add("play", "Play mode", () => sc.gameMode = sc.gameMode == SuperController.GameMode.Play ? SuperController.GameMode.Edit : SuperController.GameMode.Play, () => sc.gameMode == SuperController.GameMode.Play);
            Add("freeze", "Freeze", () => Send("SetFreezeAnimation", !sc.freezeAnimation), () => sc.freezeAnimation);
            Add("undo", "Undo", () => Send("Undo"), null);
            Add("redo", "Redo", () => Send("Redo"), null);
            Add("save", "Save scene", () => Send("SaveSceneDialog"), null);
            Add("load", "Open scene", () => Send("LoadSceneDialog"), null);
            Add("menu", "VaM menu", () => Send("ToggleMainHUD"), null);
            Add("head", "Head track", () => headOn.val = !headOn.val, () => headOn.val);
            Add("stereo", "3D", () => stereoOn.val = !stereoOn.val, () => stereoOn.val);
            Add("full", "3D Full", () => fullOn.val = !fullOn.val, () => fullOn.val);
            Add("center", "Re-centre", () => vit.Recenter(), null);
            Add("hands", "Hands", () => handsOn.val = !handsOn.val, () => handsOn.val);
            Add("edit", "Edit layout", () => SetEdit(!Editor.On), () => Editor.On);
            Add("theme", "Theme", NextTheme, null);
            Add("bigger", "Bigger", () => uiSize.val = Mathf.Min(3f, uiSize.val + 0.15f), null);
            Add("smaller", "Smaller", () => uiSize.val = Mathf.Max(0.6f, uiSize.val - 0.15f), null);
            Add("savelayout", "Save layout", SaveLayout, null);
            Add("panels", "Show all", ShowAll, null);
        }
        void Add(string id, string label, Action run, Func<bool> on) { acts[id] = new Act { id = id, label = label, run = run, on = on }; }
        static void Send(string method) { SuperController.singleton.gameObject.SendMessage(method, SendMessageOptions.DontRequireReceiver); }
        static void Send(string method, object arg) { SuperController.singleton.gameObject.SendMessage(method, arg, SendMessageOptions.DontRequireReceiver); }

        // ---- building the panels ----
        void BuildCanvas()
        {
            canvasGo = new GameObject("Brene UI");
            canvas = canvasGo.AddComponent<Canvas>(); canvas.renderMode = RenderMode.ScreenSpaceOverlay; canvas.sortingOrder = 30;
            scaler = canvasGo.AddComponent<CanvasScaler>(); scaler.uiScaleMode = CanvasScaler.ScaleMode.ConstantPixelSize; scaler.scaleFactor = uiSize.val;
            canvasGo.AddComponent<GraphicRaycaster>();
            Editor.Canvas = canvas; Editor.Changed = () => { if (Editor.On) saveAt = Time.realtimeSinceStartup + 1f; };
            var root = canvasGo.transform;

            pScene = new Panel(root, "scene", "Scene", new Vector2(20, -20), new Vector2(340, 250), true);
            pGlasses = new Panel(root, "glasses", "Glasses", new Vector2(20, -290), new Vector2(340, 250), true);
            pLayout = new Panel(root, "layout", "Layout", new Vector2(20, -560), new Vector2(340, 250), true);
            pPeople = new Panel(root, "people", "People", new Vector2(380, -20), new Vector2(240, 320), false);
            pChat = new Panel(root, "chat", "Wizra", new Vector2(-1, -20), new Vector2(460, 520), false);
            pDock = new Panel(root, "dock", "Brene", new Vector2(-1, -1), new Vector2(330, 110), true); pDock.CanHide = false; pDock.ShowEdit(Editor.On);

            foreach (var id in new[] { "play", "freeze", "undo", "redo", "save", "load", "menu" }) MakeButton(id, pScene);
            foreach (var id in new[] { "head", "stereo", "full", "center", "hands" }) MakeButton(id, pGlasses);
            foreach (var id in new[] { "theme", "bigger", "smaller", "savelayout", "panels" }) MakeButton(id, pLayout);
            MakeButton("edit", pDock);

            // people: one button per person in the scene, tap to select
            Scroll(pPeople.Body, out peopleList);
            var v = peopleList.gameObject.AddComponent<VerticalLayoutGroup>(); v.spacing = 6; v.childForceExpandHeight = false; v.childControlHeight = true; v.childControlWidth = true;

            // Wizra: the log, a box to type in and Send
            var logArea = UI.Rect("Log", pChat.Body); UI.Fill(logArea, 0, 0, 0, 62); UI.Box(logArea, Role.Field);
            RectTransform logContent; chatScroll = Scroll(logArea, out logContent);
            var lv = logContent.gameObject.AddComponent<VerticalLayoutGroup>(); lv.childControlHeight = true; lv.childControlWidth = true; lv.padding = new RectOffset(10, 10, 8, 8);
            chatLog = UI.Label(logContent, "Say something to Wizra. Her words come from the PC model through the Brene relay.", 21, Role.Text, TextAnchor.UpperLeft);
            chatLog.verticalOverflow = VerticalWrapMode.Overflow; chatLog.supportRichText = true;
            chatLog.gameObject.AddComponent<LayoutElement>();
            var inRt = UI.Rect("Input", pChat.Body); inRt.anchorMin = new Vector2(0, 0); inRt.anchorMax = new Vector2(1, 0); inRt.pivot = new Vector2(0, 0);
            inRt.offsetMin = new Vector2(0, 0); inRt.offsetMax = new Vector2(-110, 54);
            chatIn = Input(inRt, "Type here, Enter to send");
            var sendRt = UI.Rect("Send", pChat.Body); sendRt.anchorMin = sendRt.anchorMax = new Vector2(1, 0); sendRt.pivot = new Vector2(1, 0); sendRt.sizeDelta = new Vector2(100, 54);
            var sb = UI.Button(sendRt, "Send", SendChat); var sbr = (RectTransform)sb.transform; sbr.anchorMin = Vector2.zero; sbr.anchorMax = Vector2.one; sbr.sizeDelta = Vector2.zero;
            UI.SetOn(sb, false);

            // status line along the bottom of the dock
            var st = UI.Rect("Status", pDock.Root); st.anchorMin = new Vector2(0, 0); st.anchorMax = new Vector2(1, 0); st.pivot = new Vector2(0, 0); st.sizeDelta = new Vector2(0, 30);
            status = UI.Label(st, "", 16, Role.Dim, TextAnchor.MiddleLeft);
            UI.Fill((RectTransform)pDock.Body, 10, 54, 10, 34);

            PlaceRight(pChat, 20); PlaceBottomRight(pDock);
            foreach (var p in Panel.All) p.Fit();
            Refresh();
        }

        void PlaceRight(Panel p, float top) { p.Root.anchoredPosition = new Vector2(Screen.width / uiSize.val - p.Root.sizeDelta.x - 20, -top); }
        void PlaceBottomRight(Panel p) { p.Root.anchoredPosition = new Vector2(Screen.width / uiSize.val - p.Root.sizeDelta.x - 20, -(Screen.height / uiSize.val - p.Root.sizeDelta.y - 20)); }

        void MakeButton(string id, Panel p)
        {
            Act a; if (!acts.TryGetValue(id, out a)) return;
            if (a.btn != null) { a.btn.transform.SetParent(p.Body, false); return; }
            a.btn = UI.Button(p.Body, a.label, () => { try { a.run(); } catch (Exception e) { SuperController.LogError("Brene " + a.id + ": " + e.Message); } Refresh(); });
            a.btn.gameObject.AddComponent<DragButton>().actionId = id;
        }

        ScrollRect Scroll(RectTransform area, out RectTransform content)
        {
            var vp = UI.Rect("Viewport", area); UI.Fill(vp, 0, 0, 0, 0);
            vp.gameObject.AddComponent<RectMask2D>();
            var hit = vp.gameObject.AddComponent<Image>(); hit.color = new Color(0, 0, 0, 0.001f);
            content = UI.Rect("Content", vp); content.anchorMin = new Vector2(0, 1); content.anchorMax = new Vector2(1, 1); content.pivot = new Vector2(0.5f, 1); content.sizeDelta = Vector2.zero;
            var fit = content.gameObject.AddComponent<ContentSizeFitter>(); fit.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            var sr = area.gameObject.AddComponent<ScrollRect>(); sr.viewport = vp; sr.content = content; sr.horizontal = false; sr.scrollSensitivity = 30; sr.movementType = ScrollRect.MovementType.Clamped;
            return sr;
        }

        InputField Input(RectTransform rt, string hint)
        {
            UI.Box(rt, Role.Field);
            var f = rt.gameObject.AddComponent<InputField>();
            var ph = UI.Label(rt, hint, 21, Role.Dim, TextAnchor.MiddleLeft); ph.fontStyle = FontStyle.Italic;
            var tx = UI.Label(rt, "", 21, Role.Text, TextAnchor.MiddleLeft); tx.supportRichText = false; tx.raycastTarget = true;
            f.textComponent = tx; f.placeholder = ph; f.lineType = InputField.LineType.SingleLine;
            f.onEndEdit.AddListener(s => { if (UnityEngine.Input.GetKey(KeyCode.Return) || UnityEngine.Input.GetKey(KeyCode.KeypadEnter)) SendChat(); });
            return f;
        }

        // ---- Wizra ----
        void SendChat()
        {
            var text = chatIn.text.Trim(); if (text == "" || chatBusy) return;
            chatIn.text = ""; chatBusy = true; Line("<b>You:</b> " + Esc(text)); Line("<i>Wizra is thinking...</i>");
            StartCoroutine(link.Chat(text, (reply, err) =>
            {
                chatBusy = false; chatLines.RemoveAt(chatLines.Count - 1);
                if (err != null) Line("<color=#ff8a8a>" + Esc(err) + "</color>"); else Line("<b>Wizra:</b> " + Esc(reply));
            }));
            chatIn.ActivateInputField();
        }
        void Line(string s)
        {
            chatLines.Add(s); while (chatLines.Count > 80) chatLines.RemoveAt(0);
            chatLog.text = string.Join("\n\n", chatLines.ToArray());
            Canvas.ForceUpdateCanvases(); chatScroll.verticalNormalizedPosition = 0;
        }
        static string Esc(string s) { return (s ?? "").Replace("<", "&lt;").Replace(">", "&gt;"); }

        // ---- people ----
        void RefreshPeople()
        {
            if (peopleList == null) return;
            var names = new List<Atom>();
            foreach (var a in SuperController.singleton.GetAtoms()) if (a != null && a.type == "Person") names.Add(a);
            if (names.Count == peopleList.childCount) { bool same = true; for (int i = 0; i < names.Count; i++) if (peopleList.GetChild(i).name != "Button " + names[i].uid) same = false; if (same) return; }
            for (int i = peopleList.childCount - 1; i >= 0; i--) Destroy(peopleList.GetChild(i).gameObject);
            foreach (var a in names)
            {
                var atom = a;
                var b = UI.Button(peopleList, atom.uid, () => { if (atom.mainController != null) SuperController.singleton.SelectController(atom.mainController); });
                var le = b.gameObject.AddComponent<LayoutElement>(); le.minHeight = 52; le.preferredHeight = 52;
            }
            if (names.Count == 0) { var t = UI.Label(peopleList, "No people in this scene", 18, Role.Dim, TextAnchor.MiddleLeft); t.gameObject.AddComponent<LayoutElement>().minHeight = 40; }
        }

        // ---- editor ----
        void SetEdit(bool on)
        {
            Editor.On = on; foreach (var p in Panel.All) p.ShowEdit(on);
            if (!on) SaveLayout();
            Refresh();
        }
        void ShowAll() { foreach (var p in Panel.All) p.Root.gameObject.SetActive(true); Editor.Changed(); }
        void NextTheme()
        {
            int i = Array.IndexOf(Theme.Names, Theme.Name); Theme.Name = Theme.Names[(i + 1) % Theme.Names.Length];
            Theme.ApplyAll(canvasGo.transform); Refresh(); Editor.Changed();
        }

        void Refresh()
        {
            foreach (var a in acts.Values) if (a.btn != null && a.on != null) { try { UI.SetOn(a.btn, a.on()); } catch (Exception) { } }
            Act play; if (acts.TryGetValue("play", out play) && play.btn != null) { try { UI.SetText(play.btn, SuperController.singleton.gameMode == SuperController.GameMode.Play ? "Play mode" : "Edit mode"); } catch (Exception) { } }
        }

        // ---- layout file ----
        void SaveLayout()
        {
            try
            {
                var j = new JSONClass(); j["theme"] = Theme.Name; j["size"].AsFloat = uiSize.val;
                var ps = new JSONClass();
                foreach (var p in Panel.All)
                {
                    var o = new JSONClass();
                    o["x"].AsFloat = p.Root.anchoredPosition.x; o["y"].AsFloat = p.Root.anchoredPosition.y;
                    o["w"].AsFloat = p.Root.sizeDelta.x; o["h"].AsFloat = p.Root.sizeDelta.y;
                    o["hidden"].AsBool = !p.Root.gameObject.activeSelf;
                    if (p.Droppable)
                    {
                        var arr = new JSONArray();
                        for (int i = 0; i < p.Body.childCount; i++) { var d = p.Body.GetChild(i).GetComponent<DragButton>(); if (d != null) arr.Add(d.actionId); }
                        o["buttons"] = arr;
                    }
                    ps[p.Id] = o;
                }
                j["panels"] = ps;
                FileManagerSecure.CreateDirectory(DIR);
                SuperController.singleton.SaveJSON(j, FILE);
            }
            catch (Exception e) { SuperController.LogError("Brene: could not save the layout: " + e.Message); }
        }

        void LoadLayout()
        {
            if (!FileManagerSecure.FileExists(FILE)) return;
            try
            {
                var j = SuperController.singleton.LoadJSON(FILE);
                if (j == null) return;
                if (j["theme"] != null && Array.IndexOf(Theme.Names, j["theme"].Value) >= 0) { Theme.Name = j["theme"].Value; Theme.ApplyAll(canvasGo.transform); }
                if (j["size"] != null) uiSize.val = j["size"].AsFloat;
                var ps = j["panels"];
                foreach (var p in Panel.All)
                {
                    var o = ps[p.Id]; if (o == null || o["x"] == null) continue;
                    p.Root.anchoredPosition = new Vector2(o["x"].AsFloat, o["y"].AsFloat);
                    p.Root.sizeDelta = new Vector2(Mathf.Max(180, o["w"].AsFloat), Mathf.Max(110, o["h"].AsFloat));
                    p.Root.gameObject.SetActive(!o["hidden"].AsBool);
                }
                // buttons: put each where it was saved, in order (an action not in the file stays where it was built)
                foreach (var p in Panel.All)
                {
                    var o = ps[p.Id]; if (o == null || !p.Droppable) continue;
                    var arr = o["buttons"].AsArray; if (arr == null) continue;
                    for (int i = 0; i < arr.Count; i++) { Act a; if (acts.TryGetValue(arr[i].Value, out a) && a.btn != null) { a.btn.transform.SetParent(p.Body, false); a.btn.transform.SetAsLastSibling(); } }
                }
                foreach (var p in Panel.All) p.Fit();
                Act edit; if (acts.TryGetValue("edit", out edit) && edit.btn != null && !edit.btn.gameObject.activeInHierarchy) edit.btn.transform.SetParent(pDock.Body, false);   // never lose the way back into the editor
                pDock.Root.gameObject.SetActive(true);
            }
            catch (Exception e) { SuperController.LogError("Brene: could not read the layout: " + e.Message); }
        }

        void ResetLayout()
        {
            if (FileManagerSecure.FileExists(FILE)) FileManagerSecure.DeleteFile(FILE);
            Theme.Name = "Night"; uiSize.val = 1.25f;
            Panel.All.Clear(); foreach (var a in acts.Values) a.btn = null;
            if (canvasGo != null) Destroy(canvasGo);
            BuildCanvas(); canvasGo.SetActive(showUi.val);
        }

        // ---- every frame ----
        void Update()
        {
            if (saveAt > 0 && Time.realtimeSinceStartup > saveAt) { saveAt = -1; SaveLayout(); }
            if (Time.realtimeSinceStartup > nextPeople) { nextPeople = Time.realtimeSinceStartup + 2f; RefreshPeople(); Refresh(); }
            if (status != null && Time.realtimeSinceStartup > nextStatus)
            {
                nextStatus = Time.realtimeSinceStartup + 0.5f;
                string s;
                if (!link.Connected) s = (vit.Head || vit.HandsOn) ? "Relay: not running" : "Glasses and hands off";
                else s = "Glasses: " + (link.Glasses ? (link.HasPos ? "6DOF" : "3DOF") : "none") + "   Hands: " + link.Hands.Count + (vit.HandNote != "" ? "   " + vit.HandNote : "");
                if (Editor.On) s = "Editing: drag titles to move, corners to resize, buttons between panels";
                status.text = s;
            }
        }
        void LateUpdate() { if (vit != null) { vit.LateUpdate(); vit.Hands(); } }

        void OnDestroy()
        {
            if (vit != null) vit.Shutdown();
            if (canvasGo != null) Destroy(canvasGo);
            Panel.All.Clear(); Editor.On = false;
        }
    }
}
