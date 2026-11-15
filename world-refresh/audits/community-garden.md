# Community garden audit (breneland-live/js, read 2026-11-15)

Block: x -55.3..-42.0, z -40.2..-18.2 (13.3 x 22 m), slot centre (-48.65, -29.2); u = metres east, v = metres south (road north).
South gate (rose arch) centre u 0, v 11: 2 m gap, posts at u +-1.08 (colliders 0.2). North (cart) gate u 0.7, v -11: 2.4 m gap, posts u +-1.25 (0.18).
East side is the yard's fence at x -42 (no opening).

Jobs (garden.js) read PLAN.beds, BED, PLAN.feeder, PLAN.compost, PLAN.board. Hard-coded and NOT in PLAN: GARDEN_SPOTS (layout.js:411-417:
Joyce's spot, cart, chair, 7 work spots), cart route (joyce-day.js:253-264, along x = cart.u, needs cartGate.u == cart.u), park trail end
(layout.js:361, south gate u 0), visiting NPCs stand at v 6.4 in the aisle, the oak YARD_TREES[0] at (-53.5, -34.5) inside the block,
flat ground / grass keep-out / place region from the block size. Joyce walks straight lines between stops (no obstacle check).

Pure decoration (safe to restyle or move, colliders follow): butt, can, crate, sack, scarecrow, shed + tools, bench, barrow, compost2
(keep beside compost: one shared collider), lantern, trug, sunflowers, herb pots, sign, rose arch look, fence look, paths, stones, bricks.
Job-tied: bed positions and sizes, carrot-row gaps (weeds), tomato stakes and tilled ridges (pick/seeds), compost bay 1 (holds the heap),
chair and seat.

Decision: keep the footprint, gates, beds and every spot; make it read as one hand-built place by rebuilding the frame (fence, arch, shed,
compost bays) as one matching set. Moving beds would need the work spots, path numbers and NPC lines edited together.
