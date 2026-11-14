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

## Things that need a decision in the new project
- Trees in the woods are instanced by the thousand with far versions of a few dozen triangles. A Meshy tree needs a near model AND a very low far model, or the woods keep their code-made trees and only hand-placed trees are swapped.
- Leaf colour changes by season in code (one grey-ish leaf texture tinted by the game is the simplest way to keep that).
- Vertex colours or textures: the current batch is vertex coloured. Watercolour wash is easier with a small texture.
