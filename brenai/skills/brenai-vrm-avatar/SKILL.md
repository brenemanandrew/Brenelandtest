---
name: brenai-vrm-avatar
description: Work on Wizra's 3D body in public/avatar-vrm.js (three.js with @pixiv/three-vrm): poses, gestures, seating, camera takeovers, pictures, spring bones and cloth. Use for anything about how she looks or moves on screen.
---
# Her 3D body

## Map of `avatar-vrm.js`
- `rt`: her runtime state. `rt.act` is `sit`, `up`, `sitdown`, `gone` or a lying or other pose; `rt.stand` 0 to 1 blends seated to standing; `rt.steps` is the walking plan; `rt.nextAt`, `rt.legsAt`, `rt.armsAt` time her idle whims.
- Seated pose is built at the scene origin; standing uses `rt.x, rt.z, rt.yaw`. `vrm.scene.position` is set every frame in the main loop.
- Gestures come from her text through `avatar.js` (`avatar.act(text)`, `avatar.gesture(name, seconds)`).
- Camera takeovers set `fp.locked` and run after the pose each frame: `heartCamera`, `hangCamera`, `movieCamera`, `dndCamera`. Each owns the camera completely while on.
- `takeSnap(spec)` renders a picture: pose, gesture, clip and time, camera, scene, face, arm, roll, fov, hide.
- Props and rooms: `places.js`, `mapkit.js`, `props.js`. A small set piece (the D&D table) is a `THREE.Group` built once and shown or hidden.

## Lessons
- To hold her somewhere (a stool, a couch), do not fight the walking code with position alone. Each frame: set `rt.act = 'sit'`, clear `rt.steps`, push `rt.nextAt` and `rt.legsAt` far ahead, then override `vrm.scene.position.x/z` and `rotation.y` after the main pose. A held position with a live walking plan gives walking on the spot.
- Seat a character facing partly the player and partly the table; offset the scene by `hip.z` so the hips, not the origin, land on the seat.
- Put the player's camera at the same eye height as seated characters (about 1.16 m) and look at the person who should be centred.
- Skirts and coat tails are simulated by `public/bonecloth.js`, not by the model's spring bones: points with weight tied along and across the strips, colliding with thigh and shin capsules, the seat and the floor; bones are then turned to follow. Detect "seated" from thigh direction, not hip height. Seated, cloth caught under a thigh must come out on top, or it ends up beneath her.
- Before touching cloth on an outfit, check what its mesh is actually attached to (read skin weights from the VRM). Most coats and tunics here have their tail skinned to hips and thighs, with VRoid's CoatSkirt bones sitting unused at shin height. Moving bones nothing is attached to changes nothing on screen, however right the numbers look. For those, make bones at load, add them to the skeleton (`new THREE.Skeleton([...old.bones, ...new], [...old.boneInverses, ...inverses])`, `mesh.bind`), and re-weight the tail vertices.
- To make a body heavier or slimmer on every outfit, move rest-shape vertices out from the bone they hang on, weighted by skin weights (`setBuild`). Scaling bones shears limbs when joints bend.
- If a library object you add at runtime seems ignored (a collider), check whether the library only updates objects it loaded itself.
- A cloth change can be correct in numbers and invisible on screen: the flare of a hem is in the mesh. Always compare renders.
- `springBoneManager.reset()` after any teleport or camera cut.
- Still-picture cheats (roll, fov, hiding a limb) belong in `takeSnap` only.
- Never from below, nothing sexual. See the limits in `MASTERFILE.md`.

## Testing
3D cannot be judged from code. Use the `brenai-headless-test` skill: `?wear=`, `WIZRA_STILL`, `WIZRA_T`, side-by-side renders.
