# World Refresh handover (cloud session, branch claude/here-zudse5 of brenemanandrew/Brenelandtest, commit a9394ba)

Andrew approved this handover on 2026-11-16. Nothing here has been deployed. Please merge on a branch, run the suites, and deploy
under your usual rules.

## Base
- NOT based on a Breneland-Next commit. The base is `breneland-live/`: a copy of what breneland.fly.dev served on 2026-11-14 (the
  delivered client only, no server).
- All game changes are made by `world-refresh/tools/make_testgame.py`. It copies the mirror and patches files by exact string
  anchors. Every patch `assert`s that its anchor exists, so rerunning it against a newer client tree shows exactly where the code has
  moved.

## What is in this folder
- **`game/`**: every file of the built test game that differs from the mirror (40 changed, 91 new), at client-root paths (the
  mirror's root = what Fly serves, `public/` in Breneland-Next).
- **`patches/`**: unified diffs (mirror -> test game) for the 22 changed JS files. Use these to merge onto main v267 instead of
  overwriting. Some are big because they touch long single lines: `dogs.js`, `main.js`, `layout.js`, `world-trees.js`.
- **`world-refresh/`**: the tools (`make_testgame.py`, `mpfb_fixes.py`, `waitress_outfits.py`, `staff-shape.js`, `staff-editor.html`,
  `unicorn-fx.js`, `props_swap.py`, test server), the Blender scripts, the design docs, the concept renders, `models/staff-looks.json`.
- **`CHANGELOG.txt`**: every commit, newest first.

## What changed (by area)
1. **World props (Meshy refresh):**
   - 62 new models in `models/refresh/`, loaded by `js/refresh-models.js`, `props-static.js` and `models/props.json`
     (`props-old.json` is the previous set).
   - Plants, trees, small and large props, the yard split-rail fence variant, garden soft paths, the park-north trail and flagstones.
   - Files: `world.js`, `world-trees.js`, `world-town.js`, `terrain.js`, `layout.js`, `park.js`, `garden-build.js`, `gates.js`,
     `lawn.js`.
2. **Lake reflections** (`world.js`; `?noreflect` turns off) and **light shafts in Strickler Woods** (`world.js`, by the game's own
   clock; `?noshafts` turns off).
3. **Unstable Unicorns area:**
   - The diorama on a built hill (`terrain.js` uniHill), the table removed, free balloons.
   - The rainbow name, the sweep, the sparkles, the portal vortex and the mirrors (new `js/unicorn-fx.js`).
   - Play prompt at the portal via `promptAt`, confirmed live: Play goes to the Unstable Unicorns table site.
   - Files: `areas.js`, `unicorn.js`, `main.js`.
4. **Mall staff (MPFB):**
   - Changed `models/mpfb/{asha,zoe}_{day,night}`, `belinda` and `mina` (.json/.bin/.webp), plus new `*_orig` variants (the
     original outfits).
   - Waitress uniforms, Zoe's tied top and shorts, Asha's short sleeves, high heels and sandals, the chin box fix, hands, glutes,
     joined caps, Belinda's straps, bust and thong, Mina's tucked blouse. Mina's long skirt follows her legs when sitting.
   - Looks file: `models/staff-looks.json` (Andrew's), applied by `js/mpfb-characters.js` with new `js/staff-shape.js` (face and body
     sliders, Belinda's cloth skirt, bust jiggle).
   - Staff editor page: `staff-editor.html`.
   - Overlaps with your MPFB fidelity work (18bd) and mall-staff code.
5. **Strip mall:** concept touches in `strip-mall.js`: Belinda's Spa neon, globe lights, Summit Slice marquee bulbs and pizza badge
   (`?noconcept` turns off). This is an interim step: the v2 store designs replace the strip mall later.
6. **Game store restyle** after Andrew's sheet (`game-store-build.js`; `?oldstore` gives the old look):
   - Plaster and timber framing, a stone base, a pitched mossy roof.
   - Owl post, bench, lanterns, flower boxes.
   - Wood loft walls.
   - A new hanging dragon (same group, strings and sway).
   - A wooden back door with a window (same BACK ROOM lettering).
   - Same footprint, colliders, windows, doors and routines.
   - The D&D back room's code is untouched.
7. **Other:**
   - `dogs.js`, `nala-model.js` (Nala), `kids-roam.js`, `human.js`, `npcs.js`, `toon.js` (outline/vibrance pass), `batch.js`, and
     `clothing-catalog.js` with `models/clothes.json` (Meshy hats, sunglasses, a satchel in Peak Threads).
   - `vendor/three/jsm/...` (GLTFLoader, BufferGeometryUtils, SkeletonUtils) is new; check whether you already ship these elsewhere.

## Test-only, do NOT ship
- **`main.js` test hooks:** `window.__pl`, `window.__areas`, and the pinned screenshot camera `window.__cam` (also in
  `world-trees.js`). They are harmless, but remove them.
- **Test pages:** `unicorn_test.html`, `acc_test.html`. `staff-editor.html` is a tool for Andrew; keep it only if he wants it on the
  live site.

## How it was tested
- `make_testgame.py` builds clean; changed files pass `node --check`.
- Headless Chromium (swiftshader) through the real game flow: the guest login, the walk-in, then teleported spots.
  - Renders of every area changed.
  - Staff in walk, dance and sit.
  - The unicorn portal prompt.
  - Reflections and light shafts by day and dawn.
  - The game store outside and in.
- No automated suites: they are not in the mirror. Please run yours.
- **Known and pre-existing:** about 28 "computeBoundingSphere NaN" console warnings, the same with `?oldstore`, so not from these
  changes.

## Design docs for upcoming work (not built)
- `world-refresh/design/stores-v2.md`: Peak Threads + Belinda's Spa and Summit Slice + Summit Lounge as standalone buildings;
  spa face editor; party schedule.
- `world-refresh/design/characters.md`: master character sheet for LLM-voiced NPCs; memory and familiarity; privacy rules.
- `world-refresh/design/social-and-sound.md`: inspect, whisper (needs a server message type at ship: Andrew OK'd it), busy bubbles,
  shop music and sound.
