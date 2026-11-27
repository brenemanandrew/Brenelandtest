---
project: brenai
by: Claude (Brenebase session)
date: 2026-11-27
branch: claude/multi-agent-work-router-w9jzlg
title: Brene Library for Virt-a-Mate - visual Hub, scenes, looks and poses
---
## Done
- `vam/relay/library.mjs` + `library.html`: a visual library page at `http://127.0.0.1:8767/library` (phone with `--lan` and a printed key).
- Scenes, Looks, Poses from the VaM folder, packages included (reads the .var index and thumbnails directly). Search, favourites, recent, Mine, Packages.
- Load a scene or apply a look or pose to a chosen person in VaM through the plugin (commands over the relay, results back to the page).
- VaM Hub browser: big tiles, sort, type filter, detail, Install with missing dependencies into AddonPackages, then a VaM rescan. Only hub.virtamate.com downloads, only real zip packages.
- Plugin reports the scene's people and runs the library's commands.
## Tested
- `node vam/test/library.test.mjs`: 35 passed (made-up VaM folder, stand-in Hub, command round trip), with phone and PC pictures checked.
- Real Hub API list and detail through the relay. `relay.test.mjs` 17 passed, plugin compile check passed.
## Not tested
- Inside VaM: Load, RescanPackages, AppearancePresets/PosePresets loading. A real Hub download into a real VaM folder.
## Broken
- None known.
## Open
- Paid and external Hub items are not installable from the page.
## Settings changed
- Optional relay options `--vam`, `VAM_DIR`, `--lan`.
