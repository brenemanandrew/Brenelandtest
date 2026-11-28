// Brene for Virt-a-Mate: VITURE glasses in desktop mode.
//   Head    turns (and with 6DOF moves) VaM's desktop camera with your head, on top of the mouse camera.
//   3D      draws the scene twice, side by side, for the glasses' 3D mode. Half = each eye squeezed into half a 16:9 picture
//           (1920x1080 side by side); Full = each eye keeps its shape (the PC screen becomes 3840x1080).
//   Hands   a glowing marker for each tracked hand (ring, soft glow, dot, facing the camera); close the hand (or pinch) over a control point of a person or object and it follows
//           your hand until you open it. Moving the hand toward the camera or away carries it nearer or further.
// The desktop camera is SuperController.singleton.MonitorCenterCamera. Head pose is applied as an offset that is taken back off
// before VaM's own camera moves are read, so mouse orbit and head turning add up instead of fighting.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Brene
{
    public class Viture
    {
        public bool Head = true, Stereo, Full, HandsOn = true, SwapEyes;
        public float Ipd = 0.064f, PosScale = 1f;
        public bool FlipYaw, FlipPitch, FlipRoll;
        readonly Link link;

        Quaternion zeroRot = Quaternion.identity; Vector3 zeroPos; bool needZero = true;
        Quaternion lastRot = Quaternion.identity; Vector3 lastPos; Quaternion wroteRot; Vector3 wrotePos; bool applied;
        Camera cam, left, right; int savedMask; bool stereoBuilt;

        public Viture(Link l) { link = l; }

        Camera Cam { get { if (cam == null && SuperController.singleton != null) cam = Vam.MonitorCam(); return cam; } }

        public void Recenter() { needZero = true; }

        // ---- head ----
        public void LateUpdate()
        {
            if (UnityEngine.XR.XRSettings.enabled) return;   // in a headset the headset moves the view
            var c = Cam; if (c == null) return;
            var t = c.transform;
            // take our last offset back off, unless VaM wrote the camera itself this frame (then its value is the base)
            Quaternion baseRot = t.localRotation; Vector3 basePos = t.localPosition;
            if (applied && t.localRotation == wroteRot && t.localPosition == wrotePos)
            {
                baseRot = wroteRot * Quaternion.Inverse(lastRot);
                basePos = wrotePos - baseRot * lastPos;
            }
            Quaternion rot = Quaternion.identity; Vector3 pos = Vector3.zero;
            if (Head && link.Connected && link.Glasses)
            {
                float yaw = FlipYaw ? -link.Yaw : link.Yaw, pitch = FlipPitch ? -link.Pitch : link.Pitch, roll = FlipRoll ? -link.Roll : link.Roll;
                // Unity: +y turns right, +x looks down, +z tilts left; the relay: yaw + = left, pitch + = up, roll + = right
                Quaternion q = Quaternion.Euler(-pitch, -yaw, -roll);
                Vector3 p = link.HasPos ? new Vector3(link.Pos.x, link.Pos.y, -link.Pos.z) * PosScale : Vector3.zero;
                if (needZero) { zeroRot = Quaternion.Euler(0, -yaw, 0); zeroPos = p; needZero = false; }
                rot = Quaternion.Inverse(zeroRot) * q;
                pos = Quaternion.Inverse(zeroRot) * (p - zeroPos);
                pos = Vector3.ClampMagnitude(pos, 1.5f);
            }
            t.localRotation = baseRot * rot;
            t.localPosition = basePos + baseRot * pos;
            lastRot = rot; lastPos = pos; wroteRot = t.localRotation; wrotePos = t.localPosition; applied = true;
            UpdateStereo();
        }

        // ---- side by side 3D ----
        void UpdateStereo()
        {
            var c = Cam; if (c == null) return;
            if (stereoBuilt && (left == null || right == null)) { stereoBuilt = false; if (c.cullingMask == 0) c.cullingMask = savedMask; }   // VaM replaced the camera or removed the eyes: build them again
            if (Stereo && !stereoBuilt) BuildStereo(c);
            if (!Stereo && stereoBuilt) DropStereo(c);
            if (!stereoBuilt) return;
            float half = Ipd / 2f;
            Camera l = SwapEyes ? right : left, r = SwapEyes ? left : right;
            l.transform.localPosition = new Vector3(-half, 0, 0); r.transform.localPosition = new Vector3(half, 0, 0);
            foreach (var e in new[] { left, right })
            {
                e.fieldOfView = c.fieldOfView; e.nearClipPlane = c.nearClipPlane; e.farClipPlane = c.farClipPlane;
                e.cullingMask = savedMask;
                // Half: the glasses stretch each half back to full width, so draw each eye with the whole screen's shape
                if (Full) e.ResetAspect(); else e.aspect = (float)Screen.width / Mathf.Max(1, Screen.height);
            }
        }

        void BuildStereo(Camera c)
        {
            savedMask = c.cullingMask;
            left = MakeEye(c, "Brene eye L", new Rect(0, 0, 0.5f, 1)); right = MakeEye(c, "Brene eye R", new Rect(0.5f, 0, 0.5f, 1));
            c.cullingMask = 0;   // the main camera still clears the screen and still answers VaM's mouse picking
            stereoBuilt = true;
        }
        Camera MakeEye(Camera c, string name, Rect r)
        {
            var go = new GameObject(name); go.transform.SetParent(c.transform, false);
            var e = go.AddComponent<Camera>(); e.CopyFrom(c); e.rect = r; e.depth = c.depth + 1; e.cullingMask = savedMask;
            return e;
        }
        void DropStereo(Camera c)
        {
            if (left != null) UnityEngine.Object.Destroy(left.gameObject);
            if (right != null) UnityEngine.Object.Destroy(right.gameObject);
            left = right = null; c.cullingMask = savedMask; stereoBuilt = false;
        }

        // ---- hands ----
        class Held { public FreeControllerV3 fc; public float depth, size0; public Vector3 offset; }
        readonly Dictionary<int, Held> held = new Dictionary<int, Held>();
        readonly Dictionary<int, BreneGlow> markers = new Dictionary<int, BreneGlow>();
        public string HandNote = "";

        public void Hands()
        {
            var c = Cam; var seen = new HashSet<int>();
            if (c != null && HandsOn && link.Connected)
            {
                foreach (var h in link.Hands)
                {
                    seen.Add(h.id);
                    var sp = new Vector3(h.x * Screen.width, (1f - h.y) * Screen.height, 0);
                    bool grip = h.closed || h.pinch;
                    Held g; held.TryGetValue(h.id, out g);
                    if (grip && g == null) { g = Grab(c, sp, h); if (g != null) held[h.id] = g; }
                    if (!grip && g != null) { held.Remove(h.id); g = null; }
                    float depth = 0.6f;
                    if (g != null) depth = Mathf.Clamp(g.depth * (h.size > 0 && g.size0 > 0 ? h.size / g.size0 : 1f), 0.15f, 8f);
                    var ray = c.ScreenPointToRay(sp); var at = ray.origin + ray.direction * depth;
                    if (g != null && g.fc == null) { held.Remove(h.id); g = null; }   // what was held is gone (another scene was opened)
                    if (g != null) Vam.Ctrl(g.fc).position = at + g.offset;
                    Marker(h.id, at, grip, g != null, c);
                }
            }
            foreach (var id in new List<int>(markers.Keys)) if (!seen.Contains(id)) { if (markers[id] != null) markers[id].Destroy(); markers.Remove(id); held.Remove(id); }
        }

        // the control point nearest the hand on screen (within 70 pixels), preferring the one nearest the camera
        Held Grab(Camera c, Vector3 sp, HandState h)
        {
            FreeControllerV3 best = null; float bestScore = float.MaxValue;
            foreach (var atom in SuperController.singleton.GetAtoms())
            {
                if (atom == null || !atom.gameObject.activeInHierarchy) continue;
                if (atom.freeControllers == null) continue;
                foreach (var fc in atom.freeControllers)
                {
                    if (fc == null) continue;
                    var s = c.WorldToScreenPoint(Vam.Ctrl(fc).position); if (s.z <= 0.05f) continue;
                    float d = Vector2.Distance(new Vector2(s.x, s.y), new Vector2(sp.x, sp.y)); if (d > 70f) continue;
                    float score = d + s.z * 20f;
                    if (score < bestScore) { bestScore = score; best = fc; }
                }
            }
            if (best == null) { HandNote = "Nothing to hold under that hand"; return null; }
            float depth = c.WorldToScreenPoint(Vam.Ctrl(best).position).z;
            var ray = c.ScreenPointToRay(sp);
            HandNote = "Holding " + (best.containingAtom != null ? best.containingAtom.uid + " / " : "") + best.name;
            return new Held { fc = best, depth = depth, size0 = h.size, offset = Vam.Ctrl(best).position - (ray.origin + ray.direction * depth) };
        }

        void Marker(int id, Vector3 at, bool grip, bool holding, Camera c)
        {
            BreneGlow m;
            if (!markers.TryGetValue(id, out m) || m == null) { m = new BreneGlow("Brene hand " + id, true); markers[id] = m; }
            // bigger than the old balls, and the same size on screen at any depth
            float size = (holding ? 0.075f : 0.055f) * Mathf.Max(0.3f, Vector3.Distance(c.transform.position, at) / 0.6f);
            m.Place(at, c.transform.position, size, holding ? new Color(0.35f, 1f, 0.5f) : grip ? new Color(1f, 0.75f, 0.25f) : new Color(0.35f, 0.9f, 1f));
        }

        // where the webcam hands are in the scene (for touch reactions)
        public List<Vector3> HandPoints() { var l = new List<Vector3>(); foreach (var m in new List<BreneGlow>(markers.Values)) if (m != null && m.Shown) l.Add(m.Position); return l; }

        public void Shutdown()
        {
            var c = Cam;
            if (c != null)
            {
                if (stereoBuilt) DropStereo(c);
                if (applied && c.transform.localRotation == wroteRot)
                {
                    var baseRot = wroteRot * Quaternion.Inverse(lastRot);
                    c.transform.localPosition = wrotePos - baseRot * lastPos; c.transform.localRotation = baseRot;
                }
            }
            foreach (var m in new List<BreneGlow>(markers.Values)) if (m != null) m.Destroy();
            markers.Clear(); held.Clear();
        }
    }
}
