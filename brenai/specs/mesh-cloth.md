# Spec: mesh cloth for Wizra's clothes (VaM-like movement in the browser)

From: the Brenebase session, at Andrew's request (2026-11-27). For: the Brenai coding session.
Goal in Andrew's words: VaM clothing is much more dynamic. Bring that feel to Brenai without VaM's assets.

## Where it stands (read first)
- `public/bonecloth.js` already turns skirt bones (and made-up strips for coat tails and bell sleeves) into one weighted sheet that rests on thighs, shins, seat and floor. Keep it. It gives the big motion and is the fallback.
- What it cannot do, and VaM's cloth does:
  - Folds and ripples between strips. A skirt is about 12 strips, so the hem bends in 12 straight panels.
  - Flutter: small fast movement when she turns, walks or sits down quickly.
  - Cloth pushed by her hands, forearms and the player's touches.
  - Wrinkles that come and go as the cloth bunches on her lap.
- Why VaM looks better: every vertex region of a garment is a simulated point (position-based dynamics on the GPU), with per-garment weight, stiffness and pinning. The look comes from the simulation, not the asset, so no VaM or DAZ files are needed or allowed. Brenai's own outfits only.

## What to build: a mesh cloth layer on top of bone cloth
New file `public/meshcloth.js`, used by `avatar-vrm.js` right after `boneCloth`'s tick.

1. **Pick the moving region at load.** Per garment mesh:
   - vertices weighted to skirt bones or bone-cloth strips (skirts, coat tails, bell sleeves);
   - optionally hoodie hems and loose sleeves (vertices more than about 3 cm off the nearest body capsule).
   - Everything else stays skinned as now.
2. **Build a light proxy.**
   - Cluster those vertices into particles on a grid of about 2 to 3 cm (vertices in the same cell share a particle).
   - Connect particles that share mesh edges (stretch), plus particles two steps apart (bending).
   - Store each vertex's 2 or 3 nearest particles with weights.
3. **Simulate every frame** (position-based dynamics, fixed step about 1/90 s, 4 to 8 iterations):
   - **Target:** where the vertex would be with skinning plus bone cloth. Each particle is pulled to its target with a pin weight that runs from 1 at the waistband or cuff to a small value at the hem. This keeps the cut and lets the hem move.
   - **Gravity and drag:** values per garment.
   - **Stretch and bending:** per garment (light silk vs heavy denim).
   - **Collisions:** reuse bone cloth's capsules (thighs, shins, seat, floor, furniture) and add hips, torso, forearms and hands. Push particles out, with a little friction.
   - **Inertia:** from the hips' movement, so turning and walking make the hem swing and flutter. Clamp it so a camera cut or teleport does not throw the cloth; `reset()` as bone cloth has.
4. **Write it back on the GPU.**
   - Put particle offsets (simulated minus target) in a small float `DataTexture`.
   - In the garment material, `onBeforeCompile` adds after `#include <skinning_vertex>`: read the vertex's 2 or 3 particles and add the weighted offset in the mesh's space.
   - The CPU only handles particles, never vertices.
   - Normals: recompute from the offset neighbours in the shader, or accept slightly flat lighting at first and say so.
5. **Budgets** (auto-pick by device; drop a level if the frame gets slow):
   - **Phone:** at most 400 particles over all garments, 4 iterations.
   - **PC:** at most 1,500 particles, 8 iterations.
   - **Later, optional:** WebGPU compute for full garments on desktop Chrome or Edge, with phones keeping the CPU path.
   - **Auto off:** if the frame budget is missed for 2 seconds, fall back to bone cloth alone and log it in `/api/clientlog`.
6. **Things that move the cloth:**
   - walking, sitting down and getting up, turning;
   - her gestures (her hands and forearms are capsules);
   - the player's touches: a tap or stroke on her skirt or hoodie gives a small push at that point;
   - photo studio Grab mode: the grabbed point drags cloth near it;
   - optional wind outdoors (a slow gust term), off indoors.
7. **Settings per garment.** In the outfit config (`/api/outfits`, per slot), add `cloth: { weight, stiff, bend, drag, pin, hem }`:
   - start from presets: light skirt, pleated skirt, hoodie hem, coat, bell sleeve;
   - show a small panel in the Studio (`dev.html`) with live sliders;
   - tune without a deploy using `window.WIZRA_CLOTH.mesh = { off, max, iters, ... }`, like bone cloth's switches.
8. **Pictures:** `takeSnap` settles the mesh cloth too (a few hundred silent steps), the same way bone cloth is settled now. The picture pack was rendered before bone cloth and is already marked for re-rendering; do it once, after this lands.

## Tests (headless, `tools/`)
- **Settles:** after 10 s idle standing, no NaN, and average particle speed under 1 mm per frame.
- **No poke-through:**
  - Seated in the armchair, no skirt particle inside a thigh, shin or seat capsule after settling. Measure the deepest one.
  - Standing, none inside the hips or legs.
- **Moves:** after a quick 90 degree turn, the hem's peak offset is at least 2 cm and back under 0.5 cm within 2 s. This proves the flutter exists and dies down.
- **Touch:** a tap on the skirt moves the nearest particles at least 1 cm.
- **Budget:** cloth time per frame on the headless runner, scaled to a phone estimate; report the number. Auto-off triggers when forced over budget.
- **Fallback:** with `mesh.off`, the output matches today's bone cloth exactly (same bone transforms).
- **Pictures for Andrew:** standing, mid-walk, sitting in the armchair, photo studio orbit, each with mesh cloth off and on, at phone and PC size. Open them before reporting.

## Order of work
1. Skirts only (they have the most to gain): proxy, sim, GPU write-back, tests, pictures.
2. Coat tails and bell sleeves (the strips bone cloth already makes).
3. Hoodie hems and loose sleeves.
4. Touch, Grab mode, wind.
5. Per-garment settings and the Studio panel.
6. Optional WebGPU path.

## Rules
- Brenai's own outfits only. No VaM, DAZ or Hub assets (licences forbid it).
- Bone cloth stays as the base and the fallback; nothing that works today gets removed.
- Phone first: it has to hold its frame rate on Andrew's phone, or switch itself off.
- The usual Brenai rules: one change at a time, say what was tested and not, update `MASTERFILE.md` (bone cloth section and section 10), push only when Andrew says, and tell the Brenebase session which docs changed.
