# How a model gets into the game

Facts about the live game, read from its code at breneland.fly.dev on 2026-11-14 (the Breneland-Next repo was not attached to that session, so check them against the repo first):

- Nearly everything in the world is built by code, not loaded from model files. Trees: `js/world-trees.js` (`addTree` for hand-placed trees, `buildForest` for the instanced woods). Garden: `js/garden-build.js`. Hedges and lawn: `js/lawn.js`. Park: `js/park.js`.
- One model pipeline already exists and is the pattern to copy: `js/props-static.js` loads `public/models/props.json` (made from Blender files by `scripts/export_props.py` and `tools/props-static-merge.mjs`). Shapes are vertex coloured and drawn in the shared toon batch, so they add no draw calls. If the file does not load, each caller builds its old code-made prop. Shapes in it today: street_lamp, post_lantern, dock_lantern, wall_lantern, pendant_lamp, camp_lantern, bus_stop_sign, van_stop_sign, planter_box, planter_brick, planter_pot, bench_plank, bench_park, porch_swing, picnic_table, picnic_table_long, shelter, board.

## The swap, per asset
1. Andrew makes the model in Meshy from the sheet's description and drops the GLB in `models/<phase>/`.
2. Convert: scale to the sheet's size, put the origin at the centre of the base on the ground, face +Z, reduce to the triangle budget, bake the texture to vertex colours (or keep a small texture if the game gets a textured toon batch).
3. Add it to the game's model file under the same shape name the code already asks for, or a new name plus a one line change where the old code-made asset is built. Keep the old code as the fallback.
4. Keep what the game logic owns unchanged: colliders, seats, anchors (lamp light positions), wind sway, seasonal leaf colours, level of detail swaps.
5. Check in game: day and night, near and far, frame rate in the woods.

## Decisions (Andrew, 2026-11-14)
- Trees (Andrew, 2026-11-15, after trying the test site): the Meshy trees lost. The game keeps ALL its own code-made trees. No tree swap.
- Woods (superseded by the line above): only hand-placed trees (yard, street, park) get Meshy models. The instanced woods and their far versions keep the code-made trees for now (T5 fir and T8 stay code-made until revisited).
- Seasons: one model per tree with pale neutral leaves; the game tints them by season as it does today. No separate autumn models.
- Colour: bake Meshy textures to vertex colours so models drop into the existing toon batch. A textured batch for a stronger watercolour wash can come later.

- Water tower (Andrew, 2026-11-14): it is a game, not scenery. Any new look must keep its geometry, size, ladder, colliders and every play spot exactly as water-tower.js has them. Treat the Meshy water tower as a paint/style reference only until the code has been read.

## Rule: never break a game (Andrew, 2026-11-14)
Many places are games or hold games, not just scenery: the water tower, the game store and the rest of the strip mall, the Lovecraft house, the maze, bocce, picnic, firepit, fish shack, rowboats, the garden jobs, the swing. For anything that hosts a game or interaction:
1. Read its code first and list everything the game relies on: interiors, doors, walls, colliders, floors and heights, seats, anchors, triggers, NPC spots, camera spots, hidden or named meshes the code looks up, and anything animated.
2. The new model is a reskin around that list. It never moves, removes or resizes any of it. Interiors stay as they are unless Andrew says otherwise.
3. If the new look cannot fit without changing the game, stop and ask Andrew.
4. Before and after the swap, play each game through in a test build (same steps, screenshots, console errors) and compare. Nothing ships until both match and Andrew says so.
5. Always keep the old code path as the fallback, switchable in one place.
