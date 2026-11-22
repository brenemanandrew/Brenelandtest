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
- VRoid spring bones (hair, skirt, coat) ship with no gravity and, for skirts, no colliders. Adding colliders at runtime: create `VRMSpringBoneCollider` with a capsule or plane shape, parent it to a raw bone, add a group to each joint's `colliderGroups`, and call `collider.updateWorldMatrix(true, false)` yourself every frame before `vrm.update`, because the manager only refreshes colliders it loaded. Detect "seated" from thigh direction, not hip height.
- A cloth change can be correct in numbers and invisible on screen: the flare of a hem is in the mesh. Always compare renders.
- `springBoneManager.reset()` after any teleport or camera cut.
- Still-picture cheats (roll, fov, hiding a limb) belong in `takeSnap` only.
- Never from below, nothing sexual. See the limits in `MASTERFILE.md`.

## Testing
3D cannot be judged from code. Use the `brenai-headless-test` skill: `?wear=`, `WIZRA_STILL`, `WIZRA_T`, side-by-side renders.
