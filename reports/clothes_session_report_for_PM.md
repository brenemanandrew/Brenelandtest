# Report for the Breneland master project manager (clothes session, cloud)

Source: the Brenelandtest character-builder clothes conversation (session_01AhHjg5WP8pbHVq6BMcJDa2). Nothing was deployed to Breneland-Next or breneland.fly.dev.

## Andrew's goal and exact decisions
- Goal: clothes in the character builder that hold up close (old warped Meshy scans showed holes, ragged edges, mottled colour).
- Skirts must show legs: a skirt hangs as one tube from the waist, legs move inside it.
- Clothes need real shape definition, not painted on.
- Keep scanned shoes.
- Skirts in hip, knee and ankle lengths; knee is the default he liked.
- Simplified chunky cel-shaded shapes, not elaborate.
- Body builds are FIXED: four buttons (Thin, Average, Athletic, Plus) replace the Build and Muscle sliders. Random picks one of the four. Live on brenelandtest.fly.dev.
- He makes garments in Meshy on our four build models (pipeline/out/bodies_f/), garment only, no mannequin, untextured; we colour them. Waist-length tops when worn with skirts.
- Tops keep their own designed shape (shoulders, puffs); skin that would show is hidden rather than bending the shirt to the body (KEEP=1).
- Never ship to the main game until he says so.

## Done
- pipeline/scripts/fit_clean.py fits one clean Meshy garment to each of the four builds; the three non-base fits are the build morph targets (no builder change). Tops, skirts (LEN=hip|knee|ankle), shoes, colour rules for untextured scans.
- Fall outfit fitted on all four builds: waist-length rust blouse with cream Peter Pan collar and buttons, brown A-line knee skirt, burgundy mountain boots. Render: pipeline/out/fall_outfit_keepshape.png. Rebuild: pipeline/scripts/build_fall_outfit.sh.
- Test site only (brenelandtest.fly.dev): Fly deploy fixed, room lowered 7 cm (she stood in the floor), four body buttons, shell versions of her sweater, skinny jeans, knee skirt and his tee and jeans.

## Still open (in order)
1. Spiky edges on the cream collar and buttons.
2. Small holes low on the A-line skirt sides.
3. Blouse ragged side hem and faint patches at the waist sides.
4. Stockings built from her legs; colour not chosen (plum, charcoal or mustard).
5. Add the new pieces to the builder, run piece.mjs checks, deploy to the TEST site when Andrew says.
6. More garments from Andrew. His body's four build models not exported yet.
A follow-up cloud session was created for these: "Breneland clothes: clean Meshy garments, next steps" (session_01AhHjg43MAJgqPcFrqp3CTY).

## Files
All in brenemanandrew/Brenelandtest, branch ccr-e9652ea0-qfv6ad. Hand-off commit e4992abc25a1939a7ab1c9a3e50b033ad168b9ed. CLAUDE.md sections "Current direction" and "Next steps" hold the full hand-off. Key paths: pipeline/scripts/fit_clean.py, build_fall_outfit.sh, export_bodies.py, pipeline/in_clean/*.npz, pipeline/out/clean/*.glb, pipeline/out/bodies_f/*.glb, pipeline/jstest/mkroot.sh, shellrev.mjs, preview PNGs in pipeline/out/.
