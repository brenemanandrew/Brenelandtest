// Brene for Virt-a-Mate: the VR headset version of the panels.
// When VaM is running in a headset, everything Brene draws on the monitor moves onto a board floating in front of you:
// the same panels, layout, flows, radial menu and tutorials, nothing removed.
//   Pressing     poke a button with the glowing fingertip ahead of each hand (the main way); VaM's laser pointers still work.
//                Buttons on the board are 4 cm tall, and the one under the pointer or a fingertip lights up in the accent colour.
//   Hands        Brene draws its own glowing hands at the controllers: a bright ring, a dotted finger and a fingertip dot.
//                The tip is "Poke tip distance" ahead of the controller (a plugin setting; controllers differ).
//   Ring menu    hold both hands together in front of your chest for half a second, or Menu on the wrist dock.
//   Wrist dock   raise your left hand and look at it: a small dock appears on the wrist (Board, Menu, Phone, Bring board here).
//                It hides again a moment after the hand drops out of view.
//   The board    appears at arm's length, a little below eye height, facing you, and stays put until you bring it back.
//   Phone        quick lines to send without a keyboard (typing still works on a real keyboard).
// Desktop-only parts switch off in VR: the glasses' camera control and webcam hands (the headset tracks you itself).
// Not reachable from a plugin on VaM's Unity 2018: thumbsticks, buttons and haptics (no general XR input API), so poking, the
// gesture and the wrist dock cover them. Finger curl on the trigger is not drawn (the trigger mapping could not be confirmed).
// The canvases are handed to VaM with SendMessage("AddCanvas"), the way VaM lets its pointers reach a plugin's world UI;
// asked for by name so a VaM version without it cannot stop the plugin from loading.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.XR;

namespace Brene
{
    public partial class BreneMain
    {
        bool vr; float nextVrCheck, wristSeen = -1, wristLost = -1; GameObject wristGo; Canvas wristCanvas; GameObject quickRow;
        // the board in canvas units, and metres per unit: a 56-unit button is 4 cm tall, the board about 86 by 54 cm
        const float VR_UNIT = 0.04f / 56f, BOARD_UW = 1200f, BOARD_UH = 760f, BOARD_DIST = 0.55f;
        public int PokeCount;   // buttons pressed by poking (the tutorial waits on it)

        public bool InVR { get { return vr; } }

        static bool HeadsetOn() { try { return XRSettings.enabled && XRSettings.isDeviceActive; } catch (Exception) { return false; } }

        void TickVR()
        {
            if (Time.realtimeSinceStartup > nextVrCheck)
            {
                nextVrCheck = Time.realtimeSinceStartup + 1f; bool on = HeadsetOn();
                if (on && !vr) EnterVR(); else if (!on && vr) LeaveVR();
            }
            if (vr) { Wrist(); TickHands(); }
        }

        // ---- switching ----
        void EnterVR()
        {
            vr = true; vit.Head = false; vit.Stereo = false; vit.HandsOn = false; BreneHover.Strong = true;
            RestoreVamMenu();   // the monitor's menu offset is not used in the headset
            foreach (var c in Canvases()) { ToWorld(c); Send("AddCanvas", c); }
            KeepOnScreen();   // panels laid out for the monitor come onto the board
            BuildWrist(); BuildQuick(); PlaceBoard();
            if (coach != null) coach.WorldSize = BoardSize();
            radial.World = true; radial.WorldSize = BoardSize();
            Line("<i>Headset on: the panels are on a board in front of you. Poke buttons with your fingertip. Raise your left wrist for the dock.</i>");
        }
        void LeaveVR()
        {
            vr = false; vit.Head = headOn.val; vit.Stereo = stereoOn.val; vit.HandsOn = handsOn.val; BreneHover.Strong = false;
            foreach (var c in Canvases()) { Send("RemoveCanvas", c); ToScreen(c); }
            if (wristCanvas != null) Send("RemoveCanvas", wristCanvas);
            if (wristGo != null) Destroy(wristGo); wristGo = null;
            if (quickRow != null) Destroy(quickRow); quickRow = null;
            PhoneLayout(); PhoneShow(phScreen);
            DropHands();
            if (coach != null) coach.WorldSize = Vector2.zero;
            if (radial != null) radial.World = false;
            KeepOnScreen();
        }
        List<Canvas> Canvases()
        {
            var l = new List<Canvas>();
            if (canvasGo != null) l.Add(canvasGo.GetComponent<Canvas>());
            if (radialGo != null) l.Add(radialGo.GetComponent<Canvas>());
            if (coach != null && coach.CanvasGo != null) l.Add(coach.CanvasGo.GetComponent<Canvas>());
            return l;
        }
        // the screen in panel units; in the headset, the board (a fixed size, so buttons are always big enough to poke)
        Vector2 BoardSize() { return vr ? new Vector2(BOARD_UW, BOARD_UH) : new Vector2(Screen.width / uiSize.val, Screen.height / uiSize.val); }
        void ToWorld(Canvas c)
        {
            if (c == null) return;
            c.renderMode = RenderMode.WorldSpace; c.worldCamera = Cam();
            var rt = (RectTransform)c.transform; var size = BoardSize();
            rt.pivot = Vector2.zero; rt.sizeDelta = size; rt.localScale = Vector3.one * VR_UNIT;
        }
        void ToScreen(Canvas c) { if (c == null) return; c.renderMode = RenderMode.ScreenSpaceOverlay; ((RectTransform)c.transform).localScale = Vector3.one; }

        // the headset's own camera: the main camera if it renders in stereo, else any stereo camera (VaM's VR eye camera)
        Camera Cam()
        {
            var m = Camera.main; if (m != null && m.stereoEnabled) return m;
            foreach (var c in Camera.allCameras) if (c != null && c.enabled && c.stereoEnabled) return c;
            return m;
        }
        Transform HeadT()
        {
            if (vr) { var cam = Cam(); if (cam != null) return cam.transform; }   // in a headset: where the eyes really are
            var ct = Vam.CenterTarget(); if (ct != null) return ct;
            var c2 = Cam(); return c2 != null ? c2.transform : null;
        }
        // a tracked controller (or the head) in the room. The headset camera sits inside VaM's player rig, whose transform IS the
        // tracking space (with VaM's player height and world scale), so a tracked point is placed through the camera's parent.
        // (The first version worked from VaM's camera target and ignored the rig's scale and offset: the wrist dock and the glowing
        // hands landed away from the real controllers.) False when untracked.
        bool XrPose(XRNode node, out Vector3 pos, out Quaternion rot)
        {
            pos = Vector3.zero; rot = Quaternion.identity;
            Vector3 local = InputTracking.GetLocalPosition(node), headLocal = InputTracking.GetLocalPosition(XRNode.Head);
            if (local.sqrMagnitude < 0.0000001f) return false;
            var cam = Cam(); var space = cam != null ? cam.transform.parent : null;
            if (space != null)
            {
                pos = space.TransformPoint(cam.transform.localPosition + (local - headLocal));
                rot = space.rotation * InputTracking.GetLocalRotation(node);
                return true;
            }
            var h = HeadT(); if (h == null) return false;
            var rig = h.rotation * Quaternion.Inverse(InputTracking.GetLocalRotation(XRNode.Head));
            pos = h.position + rig * (local - headLocal); rot = rig * InputTracking.GetLocalRotation(node);
            return true;
        }

        // at arm's length, a little below eye height, turned to face you; the radial and the tutorial sit a few millimetres in front
        void PlaceBoard()
        {
            var h = HeadT(); if (h == null) return;
            var fwd = h.forward; fwd.y = 0; if (fwd.sqrMagnitude < 0.01f) fwd = Vector3.forward; fwd.Normalize();
            var size = BoardSize(); float s = VR_UNIT;
            var centre = h.position + fwd * BOARD_DIST - Vector3.up * 0.16f;
            var rot = Quaternion.LookRotation(centre - h.position);   // faces your eyes, tilted back a little
            var corner = centre - rot * new Vector3(size.x * s / 2, size.y * s / 2, 0);   // the canvases' pivot is bottom-left
            var toward = rot * Vector3.forward;
            int i = 0;
            foreach (var c in Canvases()) { if (c == null) continue; c.transform.position = corner - toward * (0.004f * i++); c.transform.rotation = rot; }
            if (canvasGo != null) canvasGo.SetActive(true);
        }
        void ToggleBoard() { if (canvasGo == null) return; bool on = !canvasGo.activeSelf; canvasGo.SetActive(on); if (on) PlaceBoard(); }

        // ---- the wrist dock ----
        Button wristMr;
        void BuildWrist()
        {
            wristGo = new GameObject("Brene wrist");
            wristCanvas = wristGo.AddComponent<Canvas>(); wristCanvas.renderMode = RenderMode.WorldSpace; wristCanvas.worldCamera = Cam();
            wristGo.AddComponent<GraphicRaycaster>();
            var rt = (RectTransform)wristGo.transform; rt.sizeDelta = new Vector2(420, 450); rt.localScale = Vector3.one * 0.0006f;   // about 25 by 27 cm (three rows), buttons 8 cm tall
            var bg = Ui.Rect("Bg", rt); Ui.Fill(bg, 0, 0, 0, 0); Ui.Box(bg, Role.Panel);
            var g = Ui.Rect("Grid", rt); Ui.Fill(g, 12, 12, 12, 12);
            var grid = g.gameObject.AddComponent<GridLayoutGroup>(); grid.cellSize = new Vector2(192, 132); grid.spacing = new Vector2(12, 12);
            var bb = Ui.Button(g, "Board", ToggleBoard); Ui.SetOn(bb, true); Ui.WithIcon(bb, "layout");
            Ui.WithIcon(Ui.Button(g, "Menu", () => { if (!canvasGo.activeSelf) ToggleBoard(); radial.OpenAtCentre(); }), "ring");
            Ui.WithIcon(Ui.Button(g, "Phone", () => { if (!canvasGo.activeSelf) ToggleBoard(); OpenPhone(); }), "phone");
            Ui.Button(g, "Bring board here", PlaceBoard);
            var mrb = Ui.Button(g, "See my room", () => { mrOn.val = !mrOn.val; }); Ui.WithIcon(mrb, "glasses"); wristMr = mrb;   // mixed reality on/off, one tap away for safety
            Theme.ApplyAll(rt);
            Send("AddCanvas", wristCanvas);
            wristGo.SetActive(false);
        }

        // shown while the left hand is up in front of your face; follows the hand, faces you
        void Wrist()
        {
            if (wristGo == null) return; var h = HeadT(); if (h == null) return;
            Vector3 hand; Quaternion hr; if (!XrPose(XRNode.LeftHand, out hand, out hr)) { if (wristGo.activeSelf) wristGo.SetActive(false); return; }
            var to = hand - h.position; float d = to.magnitude;
            bool inView = d > 0.15f && d < 0.65f && Vector3.Dot(h.forward, to / Mathf.Max(d, 0.001f)) > 0.8f;
            float now = Time.realtimeSinceStartup;
            if (inView) { wristLost = -1; if (wristSeen < 0) wristSeen = now; if (now - wristSeen > 0.35f && !wristGo.activeSelf) wristGo.SetActive(true); }
            else { wristSeen = -1; if (wristLost < 0) wristLost = now; if (now - wristLost > 1.5f && wristGo.activeSelf) wristGo.SetActive(false); }
            if (!wristGo.activeSelf) return;
            // above the hand, turned to face you; the canvas's middle sits on that point
            var rt = (RectTransform)wristGo.transform; var face = Quaternion.LookRotation(hand - h.position);
            rt.rotation = face; rt.position = hand + Vector3.up * 0.14f;
        }

        // ---- glowing hands, poking and the both-hands gesture ----
        readonly BreneGlow[] palmGlow = new BreneGlow[2], tipGlow = new BreneGlow[2], fingerGlow = new BreneGlow[4];
        readonly float[] pokeAt = new float[2]; readonly bool[] pokeArmed = { true, true }; readonly Button[] pokeHover = new Button[2];
        readonly int[] pokeState = new int[2];   // 0 away, 1 near a button, 2 touching
        float gestStart = -1; bool gestArmed = true;

        void TickHands()
        {
            var h = HeadT(); if (h == null) return;
            Vector3 pL, pR; Quaternion rL, rR;
            bool okL = XrPose(XRNode.LeftHand, out pL, out rL), okR = XrPose(XRNode.RightHand, out pR, out rR);
            float tip = pokeTip != null ? pokeTip.val : 0.07f;
            // the index fingertip: ahead of the controller along its pointing direction, and a little down
            Vector3 tL = pL + rL * new Vector3(0, -0.015f, tip), tR = pR + rR * new Vector3(0, -0.015f, tip);
            if (okL) Poke(0, tL); else pokeState[0] = 0;
            if (okR) Poke(1, tR); else pokeState[1] = 0;
            DrawHand(0, okL, pL, tL, h.position); DrawHand(1, okR, pR, tR, h.position);
            Gesture(okL && okR, pL, pR, h);
        }

        void DrawHand(int i, bool ok, Vector3 palm, Vector3 tip, Vector3 eye)
        {
            if (palmGlow[i] == null) { palmGlow[i] = new BreneGlow("Brene hand " + i, true); tipGlow[i] = new BreneGlow("Brene fingertip " + i, false); fingerGlow[i * 2] = new BreneGlow("Brene finger " + i, false); fingerGlow[i * 2 + 1] = new BreneGlow("Brene finger " + i, false); }
            if (!ok) { palmGlow[i].Hide(); tipGlow[i].Hide(); fingerGlow[i * 2].Hide(); fingerGlow[i * 2 + 1].Hide(); return; }
            var hand = new Color(0.35f, 0.9f, 1f);
            var tipC = pokeState[i] == 2 ? new Color(0.35f, 1f, 0.5f) : pokeState[i] == 1 ? Theme.Get(Role.Accent) : new Color(0.7f, 0.97f, 1f);
            palmGlow[i].Place(palm, eye, 0.09f, hand);
            fingerGlow[i * 2].Place(palm + (tip - palm) * 0.36f, eye, 0.022f, hand);
            fingerGlow[i * 2 + 1].Place(palm + (tip - palm) * 0.68f, eye, 0.022f, hand);
            tipGlow[i].Place(tip, eye, pokeState[i] == 2 ? 0.045f : 0.035f, tipC);
        }
        void DropHands()
        {
            for (int i = 0; i < 2; i++) { if (palmGlow[i] != null) palmGlow[i].Destroy(); if (tipGlow[i] != null) tipGlow[i].Destroy(); palmGlow[i] = null; tipGlow[i] = null; }
            for (int i = 0; i < 4; i++) { if (fingerGlow[i] != null) fingerGlow[i].Destroy(); fingerGlow[i] = null; }
            for (int i = 0; i < 2; i++) { if (pokeHover[i] != null) Hover(pokeHover[i], false); pokeHover[i] = null; pokeState[i] = 0; pokeArmed[i] = true; }
        }

        // the canvases a fingertip can press, front first (the left hand does not press its own wrist dock)
        List<Canvas> PokeCanvases(int hand)
        {
            var l = new List<Canvas>();
            if (radialGo != null) l.Add(radialGo.GetComponent<Canvas>());
            if (coach != null && coach.CanvasGo != null) l.Add(coach.CanvasGo.GetComponent<Canvas>());
            if (wristCanvas != null && hand != 0) l.Add(wristCanvas);
            if (canvasGo != null) l.Add(canvasGo.GetComponent<Canvas>());
            return l;
        }

        // A press is the fingertip crossing the board's face (within 1.5 cm, or through it) over an active button. One press, then
        // the tip has to come back out (3 cm) before the next, and at least 0.4 s apart.
        void Poke(int hand, Vector3 tip)
        {
            Button best = null; bool onCanvas = false; float z = -1;
            foreach (var c in PokeCanvases(hand))
            {
                if (c == null || !c.gameObject.activeInHierarchy) continue;
                var crt = (RectTransform)c.transform; var lp = crt.InverseTransformPoint(tip);
                if (!crt.rect.Contains(new Vector2(lp.x, lp.y))) continue;
                float zc = lp.z * crt.localScale.z;   // metres from the face: below zero is your side
                if (zc < -0.08f || zc > 0.06f) continue;
                onCanvas = true; z = zc;
                best = ButtonAt(c, tip);
                if (best != null) break;
            }
            float now = Time.realtimeSinceStartup;
            if (!onCanvas || z < -0.03f) pokeArmed[hand] = true;   // back out: ready for the next press
            bool near = best != null && z > -0.08f;
            if (pokeHover[hand] != (near ? best : null)) { if (pokeHover[hand] != null) Hover(pokeHover[hand], false); pokeHover[hand] = near ? best : null; if (pokeHover[hand] != null) Hover(pokeHover[hand], true); }
            pokeState[hand] = !near ? 0 : z > -0.015f ? 2 : 1;
            if (best != null && z > -0.015f && z < 0.05f && pokeArmed[hand] && now - pokeAt[hand] > 0.4f)
            {
                pokeArmed[hand] = false; pokeAt[hand] = now; PokeCount++;
                try { best.onClick.Invoke(); } catch (Exception e) { SuperController.LogError("Brene poke: " + e.Message); }
                Refresh();
            }
        }
        // the frontmost active, pressable button under the fingertip (a list's buttons only where the list shows them)
        static Button ButtonAt(Canvas c, Vector3 tip)
        {
            var bs = c.GetComponentsInChildren<Button>(false);
            for (int i = bs.Length - 1; i >= 0; i--)
            {
                var b = bs[i]; if (b == null || !b.isActiveAndEnabled || !b.interactable) continue;
                var brt = (RectTransform)b.transform; var bl = brt.InverseTransformPoint(tip);
                if (!brt.rect.Contains(new Vector2(bl.x, bl.y))) continue;
                var mask = b.GetComponentInParent<RectMask2D>();
                if (mask != null) { var mrt = (RectTransform)mask.transform; var ml = mrt.InverseTransformPoint(tip); if (!mrt.rect.Contains(new Vector2(ml.x, ml.y))) continue; }
                return b;
            }
            return null;
        }
        static void Hover(Button b, bool on)
        {
            if (b == null) return;
            var hv = b.GetComponent<BreneHover>(); if (hv == null) hv = b.gameObject.AddComponent<BreneHover>();
            hv.Poke(on);
        }

        // both hands together in front of your chest (within 12 cm of each other, 25 to 60 cm ahead) for half a second: the ring menu
        void Gesture(bool both, Vector3 a, Vector3 b, Transform h)
        {
            bool pose = false; float apart = both ? Vector3.Distance(a, b) : 1f;
            if (both)
            {
                var fwd = h.forward; fwd.y = 0; if (fwd.sqrMagnitude < 0.01f) fwd = Vector3.forward; fwd.Normalize();
                float ahead = Vector3.Dot((a + b) * 0.5f - h.position, fwd);
                pose = apart < 0.12f && ahead > 0.25f && ahead < 0.6f;
            }
            if (apart > 0.2f) gestArmed = true;
            if (!pose || !gestArmed) { gestStart = -1; return; }
            if (gestStart < 0) gestStart = Time.realtimeSinceStartup;
            if (Time.realtimeSinceStartup - gestStart < 0.5f) return;
            gestArmed = false; gestStart = -1;
            if (canvasGo != null && !canvasGo.activeSelf) ToggleBoard();
            if (radial != null && !radial.Open) radial.OpenAtCentre();
        }

        // ---- the Phone without a keyboard ----
        static readonly string[] QUICK = { "Hey", "How's your day?", "Tell me more", "Ha!", "What are you thinking?", "Look at me" };
        void BuildQuick()
        {
            if (pChat == null) return;
            var row = Ui.Rect("Quick", pChat.Body); Ui.Bottom(row, 118, 60);   // two rows of three, 56 high (4 cm on the board)
            var g = row.gameObject.AddComponent<GridLayoutGroup>(); g.cellSize = new Vector2(140, 56); g.spacing = new Vector2(6, 6);
            foreach (var q in QUICK) { var line = q; var b = Ui.Button(row, line, () => { chatIn.text = line; SendChat(); }); b.GetComponentInChildren<Text>().fontSize = 17; }
            quickRow = row.gameObject;
            PhoneLayout(); PhoneShow(phScreen);
        }
    }
}
