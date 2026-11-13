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

## State of the clothes (the open problem)
The 28 live pieces are Meshy scans warped onto the bodies. From a distance they hold up. Close up they still show flat underlayer patches, ragged cut edges, mottled whites and loose silhouettes. Per-piece checker results for her tops (worst view, percent of figure that is underlayer): sweater 4.5, blazer 2.3, peasant 1.8, wrap 1.2, crop tee 0.3. Men's pieces were never run through the checker. A cloth-lifting pass (`LIFT=1` in `fit_wear.py`) threw spikes and is off.

Andrew's verdict: not good enough, and he will not regenerate every garment in Meshy for every iteration.

## Proposed direction (waiting on Andrew to approve): shell clothes
Stop warping scans. Build each garment FROM the body:
1. Take the body triangles listed in the piece's `cover` (the region the garment occupies).
2. Push them out along the body normal by the distance to the fitted scan at that point, clamped (about 4 to 50 mm) and smoothed.
3. Copy skin weights and morph targets straight from the body, so it follows every build and animation with no clipping and no holes by construction.
4. Color from the scan's flat palette (per vertex or a small texture); add a thickened rim at hems, cuffs and necklines.
5. Keep scan geometry only where a shell cannot work: the skirt, hood, lapels, shoe soles.
Inputs already exist for all 28 pieces (`out/wear/*.glb`), so nothing has to be regenerated in Meshy. Prototype on the women's sweater and men's tee first, compare with `piece.mjs`, then run the rest.

## Other open items
- Buzz cut has small pits at the back. Jeans cuffs on her skinny jeans are ragged.
- Outfit tiles for the "None" rows, face and eye shapes from his head model (`in26/head.glb`, not in repo), and the 12 shop accessories are not started.
- He asked for a numbered sheet of all Breneland plant and tree assets plus Meshy cel-shade instructions. Instructions were given in chat. The sheet is not made. The tree code is on his Google Drive (`world-trees.js`).
