// Brene for Virt-a-Mate: the guided parts. "Set up a scene" and "Glasses setup" flows, the Help panel and the tutorials.
// Part of BreneMain (partial class), so the steps can reach its settings, panels and buttons.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using SimpleJSON;

namespace Brene
{
    public partial class BreneMain
    {
        Flow sceneFlow, glassFlow; Coach coach; Panel pHelp; readonly List<Lesson> lessons = new List<Lesson>();
        bool tutorialSeen; float welcomeAt = -1; string lightPick = "";

        void BuildGuides(Transform root)
        {
            Add("sceneflow", "Set up scene", () => sceneFlow.Open(0), null);
            Add("glassflow", "Glasses setup", () => glassFlow.Open(0), null);
            Add("help", "Help", OpenHelp, null);
            MakeButton("sceneflow", pDock); MakeButton("glassflow", pDock); MakeButton("help", pDock);
            pDock.Root.sizeDelta = new Vector2(500, 230); pDock.Fit(); PlaceBottomRight(pDock);

            sceneFlow = new Flow(root, "sceneflow", "Set up a scene", new Vector2(380, -60));
            SceneSteps(); sceneFlow.Build();
            glassFlow = new Flow(root, "glassflow", "Glasses setup", new Vector2(420, -80));
            GlassSteps(); glassFlow.Build();

            pHelp = new Panel(root, "help", "Help and tutorials", new Vector2(420, -120), new Vector2(520, 560), false);
            var vl = pHelp.Body.gameObject.AddComponent<VerticalLayoutGroup>(); vl.spacing = 8; vl.childControlHeight = true; vl.childControlWidth = true; vl.childForceExpandHeight = false;
            if (coach != null) coach.Destroy();
            coach = new Coach(uiSize.val); coach.Finished = n => { if (n == "Welcome") { tutorialSeen = true; SaveLayout(); } };
            Lessons();
            foreach (var l in lessons)
            {
                var lesson = l; var r = UI.Rect("Lesson " + l.Name, pHelp.Body); r.gameObject.AddComponent<LayoutElement>().minHeight = 70;
                var b = UI.Button(r, l.Name + "  -  " + l.About, () => { pHelp.Root.gameObject.SetActive(false); coach.Start(lesson); }); Flow.Stretch(b);
                b.GetComponentInChildren<Text>().fontSize = 19;
            }
            pHelp.Root.gameObject.SetActive(false);
            if (!tutorialSeen) welcomeAt = Time.realtimeSinceStartup + 2.5f;
        }

        void OpenHelp() { pHelp.Root.gameObject.SetActive(true); pHelp.Root.SetAsLastSibling(); }

        void TickGuides()
        {
            if (welcomeAt > 0 && Time.realtimeSinceStartup > welcomeAt) { welcomeAt = -1; if (!tutorialSeen && lessons.Count > 0 && !coach.Running) coach.Start(lessons[0]); }
            if (coach != null) coach.Tick();
            if (sceneFlow != null) sceneFlow.Tick();
            if (glassFlow != null) glassFlow.Tick();
        }

        // ---- helpers ----
        List<Atom> Atoms(string type) { var l = new List<Atom>(); foreach (var a in SuperController.singleton.GetAtoms()) if (a != null && a.type == type) l.Add(a); return l; }
        // VaM adds atoms with a coroutine; asked for by name so a different signature cannot stop the plugin from loading
        void AddAtom(string type, Flow f)
        {
            try { SuperController.singleton.StartCoroutine("AddAtomByType", type); f.Note("Asked VaM to add a " + type + ". If none appears, use VaM's own Add Atom and tell the coding session."); }
            catch (Exception e) { f.Note("VaM would not add it here (" + e.Message + "). Use VaM's own Add Atom."); }
            StartCoroutine(RedrawSoon(f));
        }
        System.Collections.IEnumerator RedrawSoon(Flow f) { yield return new WaitForSeconds(1.2f); f.Redraw(); }
        RectTransform Btn(string id) { Act a; return acts.TryGetValue(id, out a) && a.btn != null ? (RectTransform)a.btn.transform : null; }

        // library tiles (scenes, poses) in a flow step; tap runs pick(path, name)
        System.Collections.IEnumerator FlowTiles(Flow f, RectTransform parent, string kind, Action<string, string> pick)
        {
            var grid = Flow.Grid(parent, new Vector2(140, 164));
            var req = UnityEngine.Networking.UnityWebRequest.Get(link.Url + "/lib/items?limit=48&kind=" + kind); req.timeout = 10;
            yield return req.SendWebRequest();
            if (req.isNetworkError || req.isHttpError) { f.Note("Start the Brene relay and set your VaM folder in the Library page to see your saved ones here."); req.Dispose(); yield break; }
            var items = JSON.Parse(req.downloadHandler.text)["items"].AsArray; req.Dispose();
            if (items == null || items.Count == 0) { f.Note("None found in your VaM folder."); yield break; }
            var thumbs = new List<KeyValuePair<RawImage, string>>();
            for (int i = 0; i < items.Count; i++)
            {
                var path = items[i]["path"].Value; var name = items[i]["name"].Value;
                var tile = UI.Rect("Tile " + name, grid); var bg = UI.Box(tile, Role.Button);
                var bt = tile.gameObject.AddComponent<Button>(); bt.targetGraphic = bg; bt.onClick.AddListener(() => pick(path, name));
                var pic = UI.Rect("Pic", tile); pic.anchorMin = Vector2.zero; pic.anchorMax = Vector2.one; pic.offsetMin = new Vector2(6, 34); pic.offsetMax = new Vector2(-6, -6);
                var raw = pic.gameObject.AddComponent<RawImage>(); raw.color = new Color(1, 1, 1, 0.08f); raw.raycastTarget = false;
                var cap = UI.Rect("Cap", tile); cap.anchorMin = new Vector2(0, 0); cap.anchorMax = new Vector2(1, 0); cap.pivot = new Vector2(0.5f, 0); cap.sizeDelta = new Vector2(0, 32);
                UI.Label(cap, name, 15, Role.Text, TextAnchor.MiddleCenter);
                if (items[i]["thumb"].Value != "") thumbs.Add(new KeyValuePair<RawImage, string>(raw, items[i]["thumb"].Value));
            }
            foreach (var t in thumbs)
            {
                if (t.Key == null) yield break;
                var tr = UnityEngine.Networking.UnityWebRequest.Get(link.Url + "/lib/thumb?p=" + UnityEngine.Networking.UnityWebRequest.EscapeURL(t.Value)); tr.timeout = 10;
                yield return tr.SendWebRequest();
                if (t.Key != null && !tr.isNetworkError && !tr.isHttpError) { var tex = new Texture2D(2, 2); if (tex.LoadImage(tr.downloadHandler.data)) { t.Key.texture = tex; t.Key.color = Color.white; } }
                tr.Dispose();
            }
        }

        // ---- Set up a scene ----
        void SceneSteps()
        {
            var f = sceneFlow;
            f.Steps.Add(new FlowStep("Start", "Keep this scene, or open a saved one.", c =>
            {
                Flow.Wide(c, "Keep the scene I have  >", () => f.Show(1), true);
                Flow.Say(c, "Or tap a saved scene to open it:");
                StartCoroutine(FlowTiles(f, c, "scene", (path, name) => { Send("Load", path); f.Note("Opening " + name + "..."); }));
            }));
            f.Steps.Add(new FlowStep("People", "Who is in the scene. Shape anyone with Character.", c =>
            {
                var people = Atoms("Person");
                if (people.Count == 0) Flow.Say(c, "No people yet.");
                foreach (var a in people)
                {
                    var atom = a; var row = Flow.Grid(c, new Vector2(196, 56));
                    UI.Label(UI.Rect("Name", row), atom.uid, 21, Role.Text, TextAnchor.MiddleLeft).fontStyle = FontStyle.Bold;
                    UI.Button(row, "Select", () => SuperController.singleton.SelectController(atom.mainController));
                    UI.SetOn(UI.Button(row, "Character  >", () => { SuperController.singleton.SelectController(atom.mainController); chr.Open("Start"); }), true);
                }
                Flow.Wide(c, "+ Add a person", () => AddAtom("Person", f), false);
            }) { Check = () => Atoms("Person").Count > 0 ? null : "add at least one person" });
            f.Steps.Add(new FlowStep("Pose", "Pick a pose for each person.", c =>
            {
                var people = Atoms("Person"); if (people.Count == 0) { Flow.Say(c, "Add a person first (step 2)."); return; }
                Atom who = null; var sel = SuperController.singleton.GetSelectedAtom(); if (sel != null && sel.type == "Person") who = sel; if (who == null) who = people[0];
                var chips = Flow.Grid(c, new Vector2(150, 48));
                foreach (var a in people) { var atom = a; UI.SetOn(UI.Button(chips, atom.uid, () => { SuperController.singleton.SelectController(atom.mainController); f.Redraw(); }), atom == who); }
                var target = who;
                StartCoroutine(FlowTiles(f, c, "pose", (path, name) => { var err = ApplyPreset("pose", path, target.uid); f.Note(err ?? (name + " on " + target.uid)); }));
            }));
            f.Steps.Add(new FlowStep("Lights", "Brighten or soften the lights.", c =>
            {
                var lights = Atoms("InvisibleLight");
                if (lights.Count == 0) Flow.Say(c, "This scene has no lights of its own (VaM's default light is used).");
                foreach (var a in lights)
                {
                    var atom = a; var st = atom.GetStorableByID("Light"); if (st == null) continue;
                    var inten = st.GetFloatJSONParam("intensity"); var range = st.GetFloatJSONParam("range");
                    Flow.Say(c, atom.uid);
                    if (inten != null) Flow.SliderRow(c, "Brightness", 0, Mathf.Max(8f, inten.max), inten.val, v => inten.val = v);
                    if (range != null) Flow.SliderRow(c, "Reach", 0, Mathf.Max(25f, range.max), range.val, v => range.val = v);
                    Flow.Wide(c, "Select " + atom.uid + " (move it in VaM)", () => SuperController.singleton.SelectController(atom.mainController), false);
                }
                Flow.Wide(c, "+ Add a light", () => AddAtom("InvisibleLight", f), false);
            }));
            f.Steps.Add(new FlowStep("View", "How you look at it: glasses, 3D, head tracking.", c =>
            {
                var g = Flow.Grid(c, new Vector2(196, 60));
                foreach (var id in new[] { "head", "stereo", "full", "center", "hands" }) { var a = acts[id]; var b = UI.Button(g, a.label, () => { a.run(); Refresh(); f.Redraw(); }); UI.SetOn(b, a.on != null && a.on()); }
                Flow.Wide(c, "Glasses setup, step by step  >", () => { f.Panel.Root.gameObject.SetActive(false); glassFlow.Open(0); }, true);
            }));
            f.Steps.Add(new FlowStep("Play & save", "Try it, then keep it.", c =>
            {
                var g = Flow.Grid(c, new Vector2(196, 60));
                foreach (var id in new[] { "play", "freeze", "undo", "redo" }) { var a = acts[id]; var b = UI.Button(g, a.id == "play" ? (SuperController.singleton.gameMode == SuperController.GameMode.Play ? "Play mode" : "Edit mode") : a.label, () => { a.run(); Refresh(); f.Redraw(); }); UI.SetOn(b, a.on != null && a.on()); }
                Flow.Wide(c, "Save scene", () => Send("SaveSceneDialog"), true);
            }));
        }

        // ---- Glasses setup ----
        void GlassSteps()
        {
            var f = glassFlow;
            f.Steps.Add(new FlowStep("Relay", "Start the Brene relay on this PC.", c =>
            {
                Flow.Say(c, "Double-click start-brene.bat (in the vam\\relay folder) and leave its window open. This step turns green by itself when it answers.");
            }) { Check = () => link.Connected ? null : "the relay is not answering on " + link.Url });
            f.Steps.Add(new FlowStep("Glasses", "Plug in the glasses and start their helper.", c =>
            {
                Flow.Say(c, "Plug the VITURE glasses into this PC, close VITURE's own app, then double-click start-viture.bat (Brenai's glasses helper). Turns green when head movement arrives.");
            }) { Check = () => !link.Connected ? "start the relay first (step 1)" : link.Glasses ? null : "no head movement yet from the glasses helper" });
            f.Steps.Add(new FlowStep("Straight", "Look straight at the middle of the screen, then press Re-centre.", c =>
            {
                Flow.Wide(c, "Re-centre", () => { vit.Recenter(); f.Note("Straight ahead set."); }, true);
                Flow.Wide(c, headOn.val ? "Head tracking: on" : "Head tracking: off (tap to turn on)", () => { headOn.val = !headOn.val; f.Redraw(); }, headOn.val);
            }) { Check = () => link.Glasses ? null : "the glasses are not sending movement" });
            f.Steps.Add(new FlowStep("Directions", "Turn your head left. Does the view turn left too?", c =>
            {
                Flow.Say(c, "Try left and right, then up and down, then tilt your head. If one goes the wrong way, tap its flip.");
                Flow.Wide(c, "Flip left / right" + (flipYaw.val ? " (flipped)" : ""), () => { flipYaw.val = !flipYaw.val; f.Redraw(); }, flipYaw.val);
                Flow.Wide(c, "Flip up / down" + (flipPitch.val ? " (flipped)" : ""), () => { flipPitch.val = !flipPitch.val; f.Redraw(); }, flipPitch.val);
                Flow.Wide(c, "Flip tilt" + (flipRoll.val ? " (flipped)" : ""), () => { flipRoll.val = !flipRoll.val; f.Redraw(); }, flipRoll.val);
                if (link.HasPos) Flow.SliderRow(c, "Lean amount (6DOF)", 0, 3, posScale.val, v => posScale.val = v);
            }));
            f.Steps.Add(new FlowStep("3D", "Turn on side-by-side 3D and switch the glasses to 3D.", c =>
            {
                Flow.Wide(c, stereoOn.val ? "3D: on" : "3D: off (tap to turn on)", () => { stereoOn.val = !stereoOn.val; f.Redraw(); }, stereoOn.val);
                Flow.Say(c, "Long-press the glasses' button for their 3D mode. Picture doubled or squashed: try the other layout. Depth inside out: swap eyes.");
                Flow.Wide(c, fullOn.val ? "Layout: Full (32:9)" : "Layout: Half (16:9)", () => { fullOn.val = !fullOn.val; f.Redraw(); }, false);
                Flow.Wide(c, "Swap eyes" + (swapEyes.val ? " (swapped)" : ""), () => { swapEyes.val = !swapEyes.val; f.Redraw(); }, swapEyes.val);
                Flow.SliderRow(c, "Eye spacing", 0.04f, 0.08f, ipd.val, v => ipd.val = v);
            }));
            f.Steps.Add(new FlowStep("Hands", "Optional: control things with your hands.", c =>
            {
                Flow.Say(c, "Open 127.0.0.1:8767/hands in Chrome or Edge on this PC and press Start camera. Hold a hand up: a ball follows it in VaM. Close your hand over a control point to hold it; open to let go.");
                Flow.Wide(c, handsOn.val ? "Hand control: on" : "Hand control: off (tap to turn on)", () => { handsOn.val = !handsOn.val; f.Redraw(); }, handsOn.val);
            }) { Check = () => !link.Connected ? "start the relay first" : link.Hands.Count > 0 ? null : "no hands seen yet (is the hands page running?)" });
        }

        // ---- the tutorials ----
        void Lessons()
        {
            lessons.Clear();
            var w = new Lesson("Welcome", "a 1 minute tour of Brene"); lessons.Add(w);
            w.Steps.Add(new CoachStep("Welcome to Brene", "Brene puts VaM's tools into big, clear panels and step-by-step flows. Nothing of VaM's is taken away: its own menus are still one tap away.\n\nThis tour takes about a minute. Skip any time."));
            w.Steps.Add(new CoachStep("Your dock", "Everything starts here: the menu, Character, scene and glasses setup, Help, and Edit layout. The line at the bottom says what is connected.") { Target = () => pDock.Root, Enter = () => pDock.Root.gameObject.SetActive(true) });
            w.Steps.Add(new CoachStep("The radial menu", "Hold the <b>" + KeyName() + "</b> key, move the mouse toward a choice and let go. Two flicks reach anything.\n\n<b>Try it now:</b> hold the key.") { Done = () => radial.Open });
            w.Steps.Add(new CoachStep("Character", "Makes and changes a person in nine steps: who, a starting look, body, face, skin, hair, clothes, pose, save.") { Target = () => Btn("character") });
            w.Steps.Add(new CoachStep("Set up a scene", "A flow for the whole scene: open one, people, poses, lights, how you view it, play and save.") { Target = () => Btn("sceneflow") });
            w.Steps.Add(new CoachStep("Library", "Your scenes, looks and poses as picture tiles, and the VaM Hub with one-tap install. It's a web page, so it also works on your phone:\n\n<b>127.0.0.1:8767/library</b> on this PC (needs the relay running)."));
            w.Steps.Add(new CoachStep("Make it yours", "Edit layout lets you drag panels, resize them and move buttons between them. Theme changes the colours.") { Target = () => Btn("edit") });
            w.Steps.Add(new CoachStep("Help is here", "Every tour is in Help, any time: Character, Scene, Glasses, Library, Layout.") { Target = () => Btn("help") });

            var ch = new Lesson("Make a character", "the Character flow, step by step"); lessons.Add(ch);
            ch.Steps.Add(new CoachStep("The Character flow", "Character walks you through making a person. Let's open it.") { Enter = () => chr.Open("Who"), Target = () => chr.Panel.Root });
            ch.Steps.Add(new CoachStep("The steps", "Nine numbered steps. Tap any number to jump, or just go in order.") { Target = () => chr.StepsRt });
            ch.Steps.Add(new CoachStep("Next", "Next takes you to the following step. Back goes the other way.\n\n<b>Try it:</b> press Next.") { Target = () => chr.NextRt, Done = () => chr.Section != "Who" });
            ch.Steps.Add(new CoachStep("Shapes", "Body and Face have simple sliders. The small grey name under each is the real VaM shape it moves.") { Enter = () => chr.Open("Body"), Target = () => chr.Panel.Root });
            ch.Steps.Add(new CoachStep("Every shape is still here", "This button lists all of VaM's shapes for this part of the body, 60 at a time. Search finds any by a word.") { Target = () => chr.AllShapesRt });
            ch.Steps.Add(new CoachStep("Pictures for the rest", "Skin, Hair, Clothes and Pose show your saved ones as pictures. Tap one to put it on. Finish saves the look.") { Enter = () => chr.Open("Hair"), Target = () => chr.Panel.Root });

            var sc = new Lesson("Set up a scene", "the scene flow"); lessons.Add(sc);
            sc.Steps.Add(new CoachStep("Scene flow", "Six steps from an empty room to a saved scene.") { Enter = () => sceneFlow.Open(0), Target = () => sceneFlow.Panel.Root });
            sc.Steps.Add(new CoachStep("Steps and checks", "Numbers along the top jump to a step. Some steps check themselves and say \"Ready\" in green, or what is missing.") { Target = () => sceneFlow.StepsRt });
            sc.Steps.Add(new CoachStep("People", "Here you see who is in the scene, select them, or send them to Character.") { Enter = () => sceneFlow.Show(1), Target = () => sceneFlow.Panel.Root });
            sc.Steps.Add(new CoachStep("Lights and view", "Lights has brightness and reach sliders for each light. View has the glasses and 3D switches.") { Enter = () => sceneFlow.Show(3), Target = () => sceneFlow.Panel.Root });
            sc.Steps.Add(new CoachStep("Keep it", "Play & save: try it in play mode, then save the scene.") { Enter = () => sceneFlow.Show(5), Target = () => sceneFlow.NextRt });

            var gl = new Lesson("Glasses", "VITURE glasses in VaM"); lessons.Add(gl);
            gl.Steps.Add(new CoachStep("Glasses setup", "Six steps, each checked live: relay, glasses, straight ahead, directions, 3D, hands.") { Enter = () => glassFlow.Open(0), Target = () => glassFlow.Panel.Root });
            gl.Steps.Add(new CoachStep("Green means go", "Each step turns green by itself when it works. If it stays orange, it says what is missing.") { Target = () => glassFlow.Panel.Root });
            gl.Steps.Add(new CoachStep("Work through it", "Press Next at each step. You can come back any time from the dock.") { Target = () => glassFlow.NextRt });

            var lib = new Lesson("Library", "scenes, looks and the Hub"); lessons.Add(lib);
            lib.Steps.Add(new CoachStep("The Library page", "Open <b>127.0.0.1:8767/library</b> in a browser on this PC, or on your phone if the relay was started with --lan (it prints the link).\n\nFirst time: paste your VaM folder."));
            lib.Steps.Add(new CoachStep("Tabs", "Scenes, Looks (whole look, skin, hair, clothes), Poses, and Hub. Tap a picture, then Load or Apply: VaM does it straight away."));
            lib.Steps.Add(new CoachStep("Hub", "Sort by Hot Picks, Trending, Rating and more. Install fetches the package and anything it needs, then VaM rescans."));

            var lay = new Lesson("Layout", "move and restyle everything"); lessons.Add(lay);
            lay.Steps.Add(new CoachStep("Edit layout", "Turn on edit mode.\n\n<b>Try it:</b> press Edit layout.") { Target = () => Btn("edit"), Done = () => Editor.On });
            lay.Steps.Add(new CoachStep("Move and resize", "Drag a panel's title bar to move it. Drag the coloured corner to resize. x hides a panel.") { Target = () => pScene.Root });
            lay.Steps.Add(new CoachStep("Move buttons", "Drag a button onto another panel, or between two buttons, to put it there.") { Target = () => pScene.Body });
            lay.Steps.Add(new CoachStep("Done", "Press Edit layout again to finish. Your layout is saved.\n\n<b>Try it now.</b>") { Target = () => Btn("edit"), Done = () => !Editor.On });
        }
        string KeyName() { return menuKey.val == "BackQuote" ? "` (under Esc)" : menuKey.val == "Mouse4" ? "mouse back button" : menuKey.val; }
    }
}
