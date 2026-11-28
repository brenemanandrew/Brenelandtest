// Brene for Virt-a-Mate: mixed reality - the characters in your real room.
// Brene cannot show the room itself: the headset's passthrough does, through Virtual Desktop's passthrough with a colour key
// (anything drawn in the key colour is replaced by the real room). Brene's part is to draw everything that is not a character
// in that colour: every camera clears to the key colour instead of the sky, and the scene's environment (room models, floors,
// walls, skies) is switched off. Characters, their clothes and the lights stay. Turning it off puts all of it back.
//   Key colour: Green (default: keeps black hair and dark clothes solid), Blue, Magenta or Black.
// Part of BreneMain.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Brene
{
    public partial class BreneMain
    {
        JSONStorableBool mrOn; JSONStorableStringChooser mrKey;
        class CamWas { public Camera cam; public CameraClearFlags flags; public Color bg; }
        readonly List<CamWas> mrCams = new List<CamWas>();
        readonly List<Atom> mrHidden = new List<Atom>();
        float nextMrScan;
        static readonly string[] MR_WORDS = { "room", "floor", "ground", "wall", "environment", "env", "sky", "level", "house", "apartment", "studio", "stage", "scene", "terrain" };

        void InitMR()
        {
            mrKey = new JSONStorableStringChooser("Mixed reality key colour", new List<string> { "Green", "Blue", "Magenta", "Black" }, "Green", "Mixed reality key colour");
            RegisterStringChooser(mrKey); CreatePopup(mrKey, true);
            mrOn = new JSONStorableBool("Mixed reality (passthrough)", false, (bool v) => { if (v) MrStart(); else MrStop(); Refresh(); try { if (wristMr != null) Ui.SetOn(wristMr, v); } catch (Exception) { } });
            RegisterBool(mrOn); CreateToggle(mrOn, true);
            Add("mr", "Mixed reality", () => mrOn.val = !mrOn.val, () => mrOn.val);
        }

        Color KeyColour()
        {
            switch (mrKey.val) { case "Blue": return new Color(0, 0, 1, 1); case "Magenta": return new Color(1, 0, 1, 1); case "Black": return new Color(0, 0, 0, 1); default: return new Color(0, 1, 0, 1); }
        }

        void MrStart()
        {
            MrScan();
            try { Line("<i>Mixed reality on: everything but the characters is drawn in " + mrKey.val.ToLowerInvariant() + ". Turn on passthrough with the chroma key (" + mrKey.val.ToLowerInvariant() + ") in Virtual Desktop to see your room.</i>"); } catch (Exception) { }
        }

        // which atoms are scenery: room and prop models (CustomUnityAsset) and anything named like a room, floor, wall or sky
        static bool IsScenery(Atom a)
        {
            if (a == null || a.type == "Person" || a.type == "CoreControl" || a.type == "InvisibleLight" || a.type == "WindowCamera") return false;
            if (a.type == "CustomUnityAsset") return true;
            var n = (a.uid ?? "").ToLowerInvariant();
            foreach (var w in MR_WORDS) if (n.Contains(w)) return true;
            return false;
        }

        // cameras to key (the headset's and the desktop one) and scenery to switch off; run now and then, since scenes change
        void MrScan()
        {
            nextMrScan = Time.realtimeSinceStartup + 2f;
            var cams = new List<Camera>();
            var vrc = Cam(); if (vrc != null) cams.Add(vrc);
            var mc = Vam.MonitorCam(); if (mc != null && !cams.Contains(mc)) cams.Add(mc);
            foreach (var c in Camera.allCameras) if (c != null && c.enabled && c.stereoEnabled && !cams.Contains(c)) cams.Add(c);
            foreach (var c in cams)
            {
                bool known = false; foreach (var w in mrCams) if (w.cam == c) known = true;
                if (!known) mrCams.Add(new CamWas { cam = c, flags = c.clearFlags, bg = c.backgroundColor });
            }
            foreach (var a in SuperController.singleton.GetAtoms())
            {
                if (!IsScenery(a) || mrHidden.Contains(a)) continue;
                a.gameObject.SendMessage("SetOn", false, SendMessageOptions.DontRequireReceiver);   // VaM's own atom on/off, asked for by name
                mrHidden.Add(a);
            }
        }

        // every frame while on: VaM may set a camera back, so the key colour goes back on top
        void TickMR()
        {
            if (mrOn == null || !mrOn.val) return;
            if (Time.realtimeSinceStartup > nextMrScan) MrScan();
            var key = KeyColour();
            foreach (var w in mrCams) if (w.cam != null) { w.cam.clearFlags = CameraClearFlags.SolidColor; w.cam.backgroundColor = key; }
        }

        void MrStop()
        {
            foreach (var w in mrCams) if (w.cam != null) { w.cam.clearFlags = w.flags; w.cam.backgroundColor = w.bg; }
            mrCams.Clear();
            foreach (var a in mrHidden) if (a != null) a.gameObject.SendMessage("SetOn", true, SendMessageOptions.DontRequireReceiver);
            mrHidden.Clear();
        }
    }
}
