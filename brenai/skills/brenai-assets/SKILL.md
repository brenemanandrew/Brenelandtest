---
name: brenai-assets
description: Handle Brenai's large and licensed assets: her VRM model, outfit models by level and moment, motion clips, the picture pack, and motion capture conversion. Use when adding, replacing or generating any of these.
---
# Assets

## Where they live
Only on the Fly volume `/data` of app `brenai` (3 GB): `avatar.vrm`, `outfits/` (5 romance levels by 11 moments), `anims.json`, `pack/` (pictures plus manifest), `inbox/`, `backups/`. Never in git. `/api/disk` reports free space; `.github/workflows/brenai-volume.yml` grows the volume by hand.

## Routes (owner cookie, or `x-brain-token` for outfit routes)
- `/api/avatar` her base model. `/api/outfits` lists situations and slots; `/api/outfit/slot` assigns a file to `level|situation`; `/api/outfit/<file>` serves one.
- `/api/anims` GET returns all clips; POST replaces the WHOLE set, so fetch, merge, then post. `/api/anims/clip` for one.
- `/api/pack` GET summary; POST adds pictures and keeps files already sent to players.
- `/api/inbox` a one-time upload door for files fetched in his browser (for example Mixamo FBX).

## Outfits
Which outfit shows is `outfitNow()`: romance level plus the moment from `situationNow()` (place and clock). An empty slot falls back to the same moment at a lower level, then Daily, then the base model.

## Pictures
`tools/picpack/shots2.cjs` lists the shots per level; `gen2.cjs` renders them through the live site with `?wear=` and resumes after an interruption. A picture must only be sent at its own level, never after the player has passed it (`lvl` filter in `pics.mjs`). Look at a contact sheet of every batch before uploading: broken poses, hands through bodies, black gaps behind her.

## Motion
- `tools/clipconv.mjs <folder of FBX> <out>` converts Mixamo FBX to the game's clip format (needs the `three` package).
- Mocap page (`mocap.html`): camera, video or picture in, clips out. Guards against flipping: visibility gating, joint limits, jump filter, swap guard.

## Rules
- He made the models (VRoid); marketplace items in them are licensed to him, which is why they stay off git.
- Do not deploy while a long render job is using the live site: every deploy restarts the server.
