# Rigger

Draw a skeleton over a model and get a rigged model back. One file, `rigger.html`: double-click it, it runs in the browser with no internet.
The same file is served by Brenai at `/rig.html`.

## Using it
1. **Load model**: a `.glb` (rigged or not; a skeleton it already has is ignored). **Turn** and **Flip** fix a model that faces the wrong way: it should face you in the Front view.
2. Pick a starting skeleton: **Real human**, **Anime** or **Super deformed**. It is fitted to the model: the top of the head, the hands and the feet are found from the model's outline.
3. Put the joints where they belong:
   - **Front**: a joint only moves across the picture. Its depth stays where it is, as if a hard sheet stood behind the character.
   - **Side**: a joint only moves forward, back, up and down.
   - **Free**: drag to turn the view (shift-drag slides it); joints move flat to the screen.
   - **Draw a limb**: pick the limb, then draw it as one line from its top to its end. The joints are spread along the line.
   - **Left and right mirror**, **The rest of the limb comes along**, and **Centre in the body when let go** (the joint is put midway between the front and back of the flesh it sits in) are on to start with.
   - Scroll to zoom; drag empty space to slide the view.
4. **Attach the mesh**, **Try a pose** (four test poses, then back), **Save rigged model**. **Save skeleton** keeps just the joint positions as a `.json` (drop it on the page, or Load skeleton, to use it again).

The saved `.glb` has bones named `Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase` and the same on the right. Brenai's photo studio reads those (Place, My model).

## How the mesh is attached
The body is filled with small cubes (about 88 along its longest side). For each bone, the distance to every cube is measured through the body, cube to cube, never across open air, so a hand hanging beside a thigh does not follow the leg. Each point of the surface follows the four bones nearest to it in that sense. Parts the filling cannot reach (loose shells, hair cards) fall back to straight-line distance.

Limits: no fingers, toes as one piece, no face bones. Weights are not smoothed or painted; a model with an open or very thin surface fills badly. For the cleanest result, bring the saved skeleton into Blender and use its automatic weights.

## Building
`src/main.js` and `src/page.html` are the source. `build.sh` packs them with three.js into `rigger.html`:

    mkdir /tmp/rigbuild && cd /tmp/rigbuild && npm i three@0.187 esbuild && sh /path/to/pipeline/rigger/build.sh

Then copy `rigger.html` to `brenai/public/rig.html`.

Tested 2026-11-24 with `pipeline/out/base-plus-q3.glb` in a headless browser: the skeleton fitted itself, the four test poses bent the body sensibly, and the saved file loaded in the photo studio with 22 body parts matched.
