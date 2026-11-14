# Water tower audit (from breneland-live/js/water-tower.js, read 2026-11-14)

Bottom line: a 48 m first-person climbing game (4 routes: ladder, yellow, orange, red), built entirely in code from constants (no model file). Hand holds, hang positions, walk bands and camera blockers are computed from the same numbers, not from the meshes. A new model is only safe if built to those exact numbers; otherwise hands grab air and the camera goes through the tank (no crash, silently broken).

Key numbers (tower local frame, origin on the axis at ground): H 48 (catwalk), legs radius 8 at ground to 5.2 at top, 4 legs at 0/90/180/270 deg, tank radius 6.6 height 11, roof 5 (eave y 59, top y 64, deck 64.15, beacon 67), brace rings at 9.6/19.2/28.8/38.4, ladder on face 0 (rungs every 0.4 m from 0.5 m, radius 0.022), catwalk ring 4.4-8.4 m at y 48, footing pads 2.2 x 0.9 x 2.2 with circle colliders r 1.2. World position (-140, -152) shared by layout, terrain, minimap, voice zone, pose editor.

Safe to change: colours/materials, decoration (rivets, plates, bands, signs, lamp styling), trim that stays inside the solid shapes and off climb paths.
Must stay: every constant in water-tower.js:30-101, leg/ladder/route layout, missing-brace and wet spans, gates, pads, catwalk and deck heights, world position. Gates, beacon, chalk bags, lamps, light cone stay code-driven.

Plan: hybrid reskin only. Restyle the non-climbable look (tank, roof, name, footings, trim) and colours; keep every climb surface code-built. The Meshy water_tower.glb (a small 2-storey tower) is a STYLE reference only, never a geometry swap. After any change: climb all 4 routes, catwalk, peak, jump; check api.hands() distances ~0.

Full report: in the session transcript (agent audit), summarised here.
