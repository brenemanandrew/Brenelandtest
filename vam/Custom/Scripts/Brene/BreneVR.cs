// Brene for Virt-a-Mate: the VR headset version of the panels.
// When VaM is running in a headset, everything Brene draws on the monitor moves onto a board floating in front of you:
// the same panels, layout, flows, radial menu and tutorials, nothing removed. VaM's own laser pointers press the buttons.
//   Wrist dock   raise your left hand and look at it: a small dock appears on the wrist (Board, Menu, Wizra, Character,
//                Bring board here). It hides again a moment after the hand drops out of view.
//   The board    appears about an arm's length ahead at eye height, facing you, and stays put in the room until you bring it back.
//   Wizra        quick lines to send without a keyboard (typing still works on a real keyboard).
// Desktop-only parts switch off in VR: the glasses' camera control and webcam hands (the headset tracks you itself).
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
        const float BOARD_W = 1.25f;   // metres across

        public bool InVR { get { return vr; } }

        static bool HeadsetOn() { try { return XRSettings.enabled && XRSettings.isDeviceActive; } catch (Exception) { return false; } }

        void TickVR()
        {
            if (Time.realtimeSinceStartup > nextVrCheck)
            {
                nextVrCheck = Time.realtimeSinceStartup + 1f; bool on = HeadsetOn();
                if (on && !vr) EnterVR(); else if (!on && vr) LeaveVR();
            }
            if (vr) Wrist();
        }

        // ---- switching ----
        void EnterVR()
        {
            vr = true; vit.Head = false; vit.Stereo = false; vit.HandsOn = false;
            RestoreVamMenu();   // the monitor's menu offset is not used in the headset
            foreach (var c in Canvases()) { ToWorld(c); Send("AddCanvas", c); }
            BuildWrist(); BuildQuick(); PlaceBoard();
            if (coach != null) coach.WorldSize = BoardSize();
            radial.World = true; radial.WorldSize = BoardSize();
            Line("<i>Headset on: the panels are on a board in front of you. Raise your left wrist for the dock.</i>");
        }
        void LeaveVR()
        {
            vr = false; vit.Head = headOn.val; vit.Stereo = stereoOn.val; vit.HandsOn = handsOn.val;
            foreach (var c in Canvases()) { Send("RemoveCanvas", c); ToScreen(c); }
            if (wristCanvas != null) Send("RemoveCanvas", wristCanvas);
            if (wristGo != null) Destroy(wristGo); wristGo = null;
            if (quickRow != null) Destroy(quickRow); quickRow = null;
            if (pChat != null) for (int i = 0; i < pChat.Body.childCount; i++) { var c = (RectTransform)pChat.Body.GetChild(i); if (c.name == "Log") c.offsetMin = new Vector2(0, 62); }
            if (coach != null) coach.WorldSize = Vector2.zero;
            if (radial != null) radial.World = false;
        }
        List<Canvas> Canvases()
        {
            var l = new List<Canvas>();
            if (canvasGo != null) l.Add(canvasGo.GetComponent<Canvas>());
            if (radialGo != null) l.Add(radialGo.GetComponent<Canvas>());
            if (coach != null && coach.CanvasGo != null) l.Add(coach.CanvasGo.GetComponent<Canvas>());
            return l;
        }
        // the board keeps the desktop layout: one canvas unit per desktop panel unit, scaled to BOARD_W metres
        Vector2 BoardSize() { return new Vector2(Screen.width / uiSize.val, Screen.height / uiSize.val); }
        void ToWorld(Canvas c)
        {
            if (c == null) return;
            c.renderMode = RenderMode.WorldSpace; c.worldCamera = Cam();
            var rt = (RectTransform)c.transform; var size = BoardSize();
            rt.pivot = Vector2.zero; rt.sizeDelta = size; rt.localScale = Vector3.one * (BOARD_W / size.x);
        }
        void ToScreen(Canvas c) { if (c == null) return; c.renderMode = RenderMode.ScreenSpaceOverlay; ((RectTransform)c.transform).localScale = Vector3.one; }

        Camera Cam() { return Camera.main; }
        Transform HeadT()
        {
            var ct = Vam.CenterTarget(); if (ct != null) return ct;
            var cam = Cam(); return cam != null ? cam.transform : null;
        }

        // an arm's length ahead at eye height, facing you; the radial and the tutorial sit a few millimetres in front of the panels
        void PlaceBoard()
        {
            var h = HeadT(); if (h == null) return;
            var fwd = h.forward; fwd.y = 0; if (fwd.sqrMagnitude < 0.01f) fwd = Vector3.forward; fwd.Normalize();
            var rot = Quaternion.LookRotation(fwd);
            var size = BoardSize(); float s = BOARD_W / size.x;
            var centre = h.position + fwd * 0.95f - Vector3.up * 0.12f;
            var corner = centre - rot * new Vector3(size.x * s / 2, size.y * s / 2, 0);   // the canvases' pivot is bottom-left
            int i = 0;
            foreach (var c in Canvases()) { if (c == null) continue; c.transform.position = corner - fwd * (0.004f * i++); c.transform.rotation = rot; }
            if (canvasGo != null) canvasGo.SetActive(true);
        }
        void ToggleBoard() { if (canvasGo == null) return; bool on = !canvasGo.activeSelf; canvasGo.SetActive(on); if (on) PlaceBoard(); }

        // ---- the wrist dock ----
        void BuildWrist()
        {
            wristGo = new GameObject("Brene wrist");
            wristCanvas = wristGo.AddComponent<Canvas>(); wristCanvas.renderMode = RenderMode.WorldSpace; wristCanvas.worldCamera = Cam();
            wristGo.AddComponent<GraphicRaycaster>();
            var rt = (RectTransform)wristGo.transform; rt.sizeDelta = new Vector2(420, 300); rt.localScale = Vector3.one * 0.00045f;   // about 19 by 13 cm
            var bg = Ui.Rect("Bg", rt); Ui.Fill(bg, 0, 0, 0, 0); Ui.Box(bg, Role.Panel);
            var g = Ui.Rect("Grid", rt); Ui.Fill(g, 12, 12, 12, 12);
            var grid = g.gameObject.AddComponent<GridLayoutGroup>(); grid.cellSize = new Vector2(192, 84); grid.spacing = new Vector2(12, 12);
            Ui.SetOn(Ui.Button(g, "Board", ToggleBoard), true);
            Ui.Button(g, "Menu", () => { if (!canvasGo.activeSelf) ToggleBoard(); radial.OpenAtCentre(); });
            Ui.Button(g, "Wizra", () => { if (!canvasGo.activeSelf) ToggleBoard(); pChat.Root.gameObject.SetActive(true); pChat.Root.SetAsLastSibling(); });
            Ui.Button(g, "Bring board here", PlaceBoard);
            Theme.ApplyAll(rt);
            Send("AddCanvas", wristCanvas);
            wristGo.SetActive(false);
        }

        // shown while the left hand is up in front of your face; follows the hand, faces you
        void Wrist()
        {
            if (wristGo == null) return; var h = HeadT(); if (h == null) return;
            Vector3 handLocal = InputTracking.GetLocalPosition(XRNode.LeftHand), headLocal = InputTracking.GetLocalPosition(XRNode.Head);
            Quaternion headLocalRot = InputTracking.GetLocalRotation(XRNode.Head);
            // tracking space to world, from where the head is in both
            var rig = h.rotation * Quaternion.Inverse(headLocalRot);
            var hand = h.position + rig * (handLocal - headLocal);
            var to = hand - h.position; float d = to.magnitude;
            bool inView = d > 0.15f && d < 0.65f && Vector3.Dot(h.forward, to / Mathf.Max(d, 0.001f)) > 0.8f;
            float now = Time.realtimeSinceStartup;
            if (inView) { wristLost = -1; if (wristSeen < 0) wristSeen = now; if (now - wristSeen > 0.35f && !wristGo.activeSelf) wristGo.SetActive(true); }
            else { wristSeen = -1; if (wristLost < 0) wristLost = now; if (now - wristLost > 1.5f && wristGo.activeSelf) wristGo.SetActive(false); }
            if (!wristGo.activeSelf) return;
            // just above the hand, turned to face you; the canvas's middle sits on that point
            var rt = (RectTransform)wristGo.transform; var face = Quaternion.LookRotation(hand - h.position);
            rt.rotation = face; rt.position = hand + Vector3.up * 0.09f;
        }

        // ---- Wizra without a keyboard ----
        static readonly string[] QUICK = { "Hey", "How's your day?", "Tell me more", "Ha!", "What are you thinking?", "Look at me" };
        void BuildQuick()
        {
            if (pChat == null) return;
            var row = Ui.Rect("Quick", pChat.Body); Ui.Bottom(row, 50, 60);
            var g = row.gameObject.AddComponent<GridLayoutGroup>(); g.cellSize = new Vector2(140, 46); g.spacing = new Vector2(6, 6);
            foreach (var q in QUICK) { var line = q; var b = Ui.Button(row, line, () => { chatIn.text = line; SendChat(); }); b.GetComponentInChildren<Text>().fontSize = 17; }
            quickRow = row.gameObject;
            for (int i = 0; i < pChat.Body.childCount; i++) { var c = (RectTransform)pChat.Body.GetChild(i); if (c.name == "Log") c.offsetMin = new Vector2(0, 116); }
        }
    }
}
