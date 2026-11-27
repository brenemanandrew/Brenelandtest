// Brene for Virt-a-Mate: move and size VaM's own menus.
// VaM draws its menus as panels in the 3D space in front of the camera (world-space canvases). Brene finds every such panel
// that does not belong to a person or object in the scene (and is not Brene's own), and moves them together: up, down, left,
// right, closer, further, and smaller or bigger around their shared middle. VaM keeps its menus in front of the camera
// itself; whenever it moves one, that becomes the new starting point and Brene's offset is put back on top, every frame.
// The offset is saved with the layout. Reset puts everything back where VaM had it.
// Part of BreneMain.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Brene
{
    public partial class BreneMain
    {
        class MenuPart { public Transform t; public Vector3 basePos, wrotePos, baseScale, wroteScale; public bool wrote; }
        readonly List<MenuPart> menuParts = new List<MenuPart>();
        Vector3 menuMove; float menuSize = 1f, nextMenuScan; Panel pVamMenu; Text vamMenuNote;

        void BuildVamMenu(Transform root)
        {
            Add("movemenu", "Move VaM menu", () => { pVamMenu.Root.gameObject.SetActive(!pVamMenu.Root.gameObject.activeSelf); pVamMenu.Root.SetAsLastSibling(); ScanMenus(); }, () => pVamMenu != null && pVamMenu.Root.gameObject.activeSelf);
            Add("mm_up", "Up", () => Nudge(0, 0.03f, 0, 1), null);
            Add("mm_down", "Down", () => Nudge(0, -0.03f, 0, 1), null);
            Add("mm_left", "Left", () => Nudge(-0.03f, 0, 0, 1), null);
            Add("mm_right", "Right", () => Nudge(0.03f, 0, 0, 1), null);
            Add("mm_closer", "Closer", () => Nudge(0, 0, -0.05f, 1), null);
            Add("mm_further", "Further", () => Nudge(0, 0, 0.05f, 1), null);
            Add("mm_smaller", "Smaller", () => Nudge(0, 0, 0, 0.92f), null);
            Add("mm_bigger", "Bigger", () => Nudge(0, 0, 0, 1.08f), null);
            Add("mm_reset", "Reset", () => { menuMove = Vector3.zero; menuSize = 1f; BreneEdit.Changed(); }, null);
            pVamMenu = new Panel(root, "vammenu", "Move VaM menu", new Vector2(380, -60), new Vector2(340, 250), true);
            foreach (var id in new[] { "mm_up", "mm_down", "mm_left", "mm_right", "mm_closer", "mm_further", "mm_smaller", "mm_bigger", "mm_reset" }) MakeButton(id, pVamMenu);
            var nr = Ui.Rect("Note", pVamMenu.Root); Ui.Bottom(nr, 30, 0);
            vamMenuNote = Ui.Label(nr, "", 15, Role.Dim, TextAnchor.MiddleLeft); pVamMenu.FootPad = 40;
            MakeButton("movemenu", pLayout);
        }

        void Nudge(float x, float y, float z, float k)
        {
            menuMove += new Vector3(x, y, z); menuSize = Mathf.Clamp(menuSize * k, 0.4f, 2.5f);
            if (menuParts.Count == 0) ScanMenus();
            BreneEdit.Changed();
        }

        // VaM's menu panels: world-space canvases that are not part of an atom and not Brene's
        void ScanMenus()
        {
            nextMenuScan = Time.realtimeSinceStartup + 3f;
            var mine = new HashSet<Transform>();
            foreach (var c in Canvases()) if (c != null) mine.Add(c.transform);
            if (wristGo != null) mine.Add(wristGo.transform);
            var keep = new List<MenuPart>();
            foreach (var c in UnityEngine.Object.FindObjectsOfType<Canvas>())
            {
                if (c == null || !c.isRootCanvas || c.renderMode != RenderMode.WorldSpace || mine.Contains(c.transform)) continue;
                if (c.GetComponentInParent<Atom>() != null) continue;
                MenuPart old = null; foreach (var m in menuParts) if (m.t == c.transform) old = m;
                keep.Add(old ?? new MenuPart { t = c.transform });
            }
            menuParts.Clear(); menuParts.AddRange(keep);
            if (vamMenuNote != null) vamMenuNote.text = menuParts.Count == 0 ? "No VaM menu found to move (tell the coding session)" : "Moving " + menuParts.Count + " VaM menu part(s)";
        }

        // VaM's menus back where VaM had them (Brene is going away, or the headset took over)
        void RestoreVamMenu()
        {
            foreach (var m in menuParts)
            {
                if (m.t == null || !m.wrote) continue;
                if (m.t.position == m.wrotePos) m.t.position = m.basePos;
                if (m.t.localScale == m.wroteScale) m.t.localScale = m.baseScale;
                m.wrote = false;
            }
        }

        // every frame, after VaM has placed its menus
        void TickVamMenu()
        {
            if (vr) return;
            bool moved = menuMove != Vector3.zero || Mathf.Abs(menuSize - 1f) > 0.001f;
            if (!moved && menuParts.Count == 0) return;
            if (Time.realtimeSinceStartup > nextMenuScan) ScanMenus();
            var cam = Vam.MonitorCam(); if (cam == null) return; var ct = cam.transform;
            // where VaM has each part now (its own move wins; ours goes back on top)
            Vector3 mid = Vector3.zero; int n = 0;
            foreach (var m in menuParts)
            {
                if (m.t == null) continue;
                if (!m.wrote || m.t.position != m.wrotePos || m.t.localScale != m.wroteScale) { m.basePos = m.t.position; m.baseScale = m.t.localScale; }
                mid += m.basePos; n++;
            }
            if (n == 0) return; mid /= n;
            var shift = ct.right * menuMove.x + ct.up * menuMove.y + ct.forward * menuMove.z;
            foreach (var m in menuParts)
            {
                if (m.t == null) continue;
                m.t.position = mid + (m.basePos - mid) * menuSize + shift; m.t.localScale = m.baseScale * menuSize;
                m.wrotePos = m.t.position; m.wroteScale = m.t.localScale; m.wrote = true;
            }
        }
    }
}
