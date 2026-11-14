# Lovecraft house audit (from breneland-live/js/lovecraft-*.js, read 2026-11-14)

Bottom line: safe to give a new OUTSIDE look if the shell is rebuilt to the plan numbers. The logic never reads the house mesh: colliders, floors, door, rooms, camera spots all come from code (lovecraft-plan.js:7-16, layout.js:495-496). The visible house is loaded from models/lovecraft.json (parts shell, inside, winter, halloween, spring + anchors), built in Blender from the plan; `?lovecraft=code` or a failed load builds the old code-made house.

What happens there: Arkham Horror table in the parlour (E within 2.3 m), open days Sat/Mon/Thu (storm, maze, notices and the game store read the same days), plaque, auto front door, 4 NPCs (Detective, Professor, Reporter, Cultist), telescope in the study looking WEST out of the study's west window, per-room cameras, see-through windows, fireplaces and candles, the Beneath Angell Street maze door (hall back wall) with cellar grates and green door-glass tint outside, crows at the eaves.

Key numbers: centre (-88.2, -69.5), 11 x 13 m, walls 0.25; terrace 0.94, ground floor 1.66, upper 5.06, eaves 8.46, roof top 11.47; front door u 3.5, 1.3 x 2.55; porch u 1.6-5.4 out to z -60.8 with 3 steps; telescope eye (-94.0, 6.66, -72.9) looking west +-0.75 rad; real (see-through) window holes at fixed spots (lovecraft-build.js:299-305, plan.js:49-54); cellar grates in the foundation band at (-87.45, -62.92) and (-82.62, -70.1); lamp anchors glow-porch-w/e and glow-gate.

May change: cladding, trim, roof styling, dormers, chimneys, shutters, fake windows, cornice, bay styling, porch post/rail styling, fence, hedges, beds, paths, all colours and textures.
Must stay: footprint and wall planes (no solid more than ~0.35 m past the outer box), floor heights, door opening and swing room, sidelight/fanlight spots, porch and steps, porch camera spots clear, every real-window hole, a clear view west from the telescope, the foundation band at the grates, lamp anchors, the whole interior, gate/plaque/steps, fountain/arbour/bulkhead clearances, tree spots.

Plan: replace ONLY the `shell` part of lovecraft.json, built in the same frame from planData(), keep anchors, keep the code fallback. The Meshy diorama a3_lovecraft_house.glb is a style target, not a drop-in. Test day and night, open and closed day, every item above.
