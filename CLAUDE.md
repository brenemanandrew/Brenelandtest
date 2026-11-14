# Breneland character builder (test environment)

Andrew's modular character creator for his Three.js game Breneland. This repo is the test build plus the whole asset pipeline, moved here from a long chat session on 2026-11-13.

## Working with Andrew
- Never use em dashes. Use hyphens.
- Answer first, short. He usually reads on his phone.
- Accuracy over agreement, no flattery. Never say something is done, fixed or deployed without evidence. Report what was done, what was tested, what is blocked.
- If usage is running out, stop, hand over what is finished, and say why.
- Do NOT ship anything to the main game (Breneland-Next, breneland.fly.dev) until he says so. When he does: send the data to the project master, update it, upload to Drive, deploy if possible.
- A sexual animation request was declined earlier and removed. Do not rebuild it.

## Layout
- `site/` - the deployed static app. `index.html` plus `hair/`, `models/`, `cloth/` data files (base64 GLB in small JS files, loaded on demand).
- `Dockerfile`, `nginx.conf`, `fly.toml`, `.github/workflows/fly-deploy.yml` - Fly deploy on push to `main`. Both runs so far FAILED at `flyctl deploy`. Likely missing repo secret `FLY_API_TOKEN` or an app-name mismatch. Unresolved.
- `pipeline/` - everything that builds `site/`:
  - `poser/index.html` - the builder source (one file, Three.js r181 from CDN). `<!--MODELS-->` is filled by the build.
  - `scripts/build.py` - builds `poser/index_embedded.html` and the data files, and a test copy in `/home/claude/ptest`.
  - `scripts/fit_wear.py KEY SLOT m|f` - fits one scanned garment to a body. Needs the decimated scans `out/cl-KEY-dec.glb`, which are NOT in the repo (550 MB). The fitted results in `out/wear/*.glb` are.
  - `scripts/snug_hair.py`, `conform_hair.py` - pull hairstyles onto each body's skull (`out/hairfinal` -> `out/hairalt`).
  - `scripts/expose.py`, `hair_gap.py` - measurements (skin not behind cloth, hair distance off the skull).
  - `jstest/` - headless render checks (puppeteer-core + Chrome, swiftshader). `piece.mjs` + `psheet.py` is the per-piece checker: six close views per piece and the percent of the figure showing underlayer. `rev.mjs`/`revc.mjs` + `sheet.py` render whole outfits. `hrev.mjs` + `hsheet.py` render hair. `flow.mjs` runs the real walk-in.
  - `out/` - bodies (`base-plus-q3.glb` female runtime, `base-plus-build.glb` female fitting body, `male-build-s.glb` male runtime, `male-body-final.glb` male fitting body), room, hair, beards, fitted clothes. `out/wear_hold/` has two pieces held back as broken (women's wide-leg trousers, chunky loafers).
- Run `pipeline/setup.sh` once in a fresh workspace. Scripts use fixed `/home/claude/...` paths.
- After a build, copy `poser/index_embedded.html` to `site/index.html` and `poser/{hair,models,cloth}` into `site/`.

## How the builder works (short)
- Two rigs: `plus` (Female) and `male`, same 66-bone Mixamo skeleton. Build slider drives body morph targets. Female rig lifts shoulders 4 cm at load (`shoulderLift`); clothes have that baked in.
- Flow: dressing room intro, pick identity, walk to mirror, then Face, Hair, Body, Outfit, Voice, Finish. Option tiles are small renders of the character alone.
- Clothes are SkinnedMeshes on the body's bones with the body's morph names. Each carries `extras.cover` (body verts it hides) and `extras.under` (a flat color). Hidden skin is redrawn in that color as an "underlayer", so a hole in the cloth never shows skin. Tops are stencil-drawn over bottoms.
- Hair: each style has a copy per body (`hairAlt`), loaded raw.

## Current direction (2026-11-14): clean Meshy garments fitted per build
- Body builds are FIXED: Body step has four buttons (Thin, Average, Athletic, Plus). No in-between builds. Live on brenelandtest.fly.dev.
- Andrew makes garments in Meshy on the build models (`pipeline/out/bodies_f/body_female_*.glb`, made by `scripts/export_bodies.py`). Garment only: no mannequin, no body, untextured. We color them.
- `scripts/fit_clean.py IN.npz SLOT_KEY f` fits one garment to each of the 4 builds. Base build (her: plus) is the mesh; the other 3 fits are stored as the builds' morph targets, so each build wears its own exact fit and the builder needs no change. Inputs: decimated scans in `pipeline/in_clean/*.npz` (`scripts/decimate_clean.py IN.glb OUT.npz 60000`, needs `pip install fast-simplification scipy`).
  - Tops: sized/placed under the shoulders (height fixed from the average build, width per build), sleeves laid along the arms. `KEEP=1` (Andrew's choice): the garment keeps its designed shape (shoulders, puffs); skin that would show is hidden instead of bending the cloth. The inner wall of Meshy's solid cloth is dropped (it showed through as blotches).
  - Skirts: one tube from the waist, A-line, legs show and move inside (Andrew's rule). `LEN=hip|knee|ankle`.
  - Shoes: pair set on the feet, sole on the floor, toe bends.
  - Colour for untextured scans: `BASE`, `ACCENT` (+ `ACIRC`/`ABOX` regions in scan units from a front view), `SOLE`.
- Fall outfit (waist blouse, brown A-line knee skirt, burgundy mountain boots): `scripts/build_fall_outfit.sh` -> `out/clean/`. Renders: `out/fall_outfit_keepshape.png`.
- Render checks: `jstest/mkroot.sh ROOT slot_key=glb ...` makes a test copy of site/ with pieces swapped in, then `node jstest/shellrev.mjs ROOT plus OUTFIT_JSON TAG OUTDIR BUILD` (BUILD 100 plus, 0 average, -100 thin; `MUS=100` with 0 for athletic). New pieces are rendered under existing slot keys (e.g. top_f_wrap) until added to the builder's WEAR lists.

## Next steps (in order)
Done 2026-11-14: (1) collar/button colour edges are cut along the region line (clean curves), (2) skirt side holes fixed, plus Andrew's markups: shoulders/upper back/upper sleeves sit on her (`HUG`, tops of shoulders closer with `HUGCTOP`), forearm puff reduced and cuff in to the wrist (`SLEEVEK`), sleeves 6 cm shorter (`SLEEVESHORT`), less flare at the skirt front (`FRONTK`). All in `scripts/build_fall_outfit.sh`. Back collar: `NECKCUT=0.85` cuts everything above the base of the neck at the sides and back (on every build, shoulder lift included); front collar untouched. Renders: `out/fall_outfit_markup_fixes.png` (before/after), `out/fall_outfit_v5.png`, `out/fall_blouse_neck_v5.png`.
Custom cameras for shellrev: `SHOTS='[["stand",0,[tx,ty,tz],[cx,cy,cz],"close"],...]'`.
1. Blouse: ragged side hem and ragged cuff edges, NOT fixed. Cause: Meshy made the blouse with arms down, so the torso side under the arm is fused to the sleeve; laying the sleeves along the arms opens gaps with ragged edges and crumpled faces. Tried (env-gated in fit_clean.py, all off by default, none helped enough): INALL (inward faces on any build), SIDEFIX (outside from the trunk under the arms), PATCH (side panels from her skin), CRUMPLE (folded faces), HANDCUT/HANDW (wrist). Better fix: Meshy garment made with the arms out (A-pose), or a body-built torso with the scan's sleeves and collar.
   Option 2 tried (Andrew's pick): `BODYTORSO=1` in fit_clean.py builds the blouse body from her skin (offset = distance to the scan torso, `BTMIN/BTMAX/BTIN/BTSM`, hem `HEMY`, neck `BTNECK`, arm `BTARM`) and keeps the scan's sleeves/collar/buttons. First result `out/fall_blouse_bodytorso_try1.png` is WORSE than v5: blotchy shading on the panel, collar broken into white bits, a skin V at the back neck, panel covers the lowest button, hem still jagged, cuff shards unchanged. Not in build_fall_outfit.sh. To do: collar must sit on the panel (lift accents off the panel, not the skin; skip ACCDROP), neckline from the scan's neck edge, flat offset (no per-point distance) for even shading.
2. Plum tights: `scripts/stockings.py legs_f_tights_plum` -> `out/clean/legs_f_tights_plum.glb`. New 4th slot `legs` ("Legwear") added to the builder (poser/index.html and site/index.html: WEAR, SLOTS, featDefault, plus rig wear list, outfit tiles; drawn by depth only, no stencil, bias 0.5 mm). Render-checked on all 4 builds with skirt and boots: `out/fall_outfit_plum_tights.png`, `out/plum_tights_legs_close.png`. Small darker patches at the knees. `site/cloth/legs_f_tights_plum.js` is not made yet (step 4).
3. Collar clipping: `COLLIFT=0.004` (collar 4 mm out) + `ACCDROP` fixed the lower collar edge and the back band. Left: a few small dark triangles at the top of the collar near the neck (Average, Athletic, Plus); light-grey bits at the back neckline corners on Plus. 8 mm lift and recolouring nearby faces were tried and looked worse.
4. Add the new pieces to the builder (WEAR lists, cloth/*.js via build.py), run `piece.mjs` checks, then deploy (push to main deploys to Fly) only when Andrew says.
5. More garments from Andrew; prompt template for Meshy is in the chat: simple chunky cel-shade shapes, garment only, waist-length tops when worn with skirts.

## Older work (kept for reference)
- `scripts/shell_wear.py` / `skirt_wear.py`: shell clothes built from the body. Good for tight things (skinny jeans, stockings); lost details on designed garments. Live on the site now: her sweater, skinny jeans, knee skirt, his tee and jeans. 14 more shells in `out/shell/` were NOT deployed (worse than scans).
- The original 28 warped scans are in `out/wear/` (still live for the other pieces).
- Fly deploy works (workflow creates the app if missing). Dressing room lowered 7 cm so she stands on the floor.
- Buzz cut pits at the back; outfit tiles for None rows; face shapes from his head model; 12 shop accessories; plant/tree sheet: not started.
