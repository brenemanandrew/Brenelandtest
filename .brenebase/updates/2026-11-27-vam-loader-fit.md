---
project: brenai
by: Claude (Brenebase session)
date: 2026-11-27
branch: claude/multi-agent-work-router-w9jzlg
title: Brene for VaM - loader scene and "Fit VaM menu" (Andrew's first install)
---
## Done
- `vam/Saves/scene/Brene/Brene Loader.json`: an empty scene with Brene as a scene plugin, so Brene loads from the scene browser when VaM's menu (Add Plugin) is off the top of the screen.
- "Fit VaM menu" setting plus "VaM menu smaller / bigger" buttons: widen the desktop camera's field of view so VaM's own menu fits.
- Zip for Andrew updated (START-HERE explains both).
## Tested
- Plugin compile check passed; loader scene is valid JSON.
## Not tested
- Whether VaM accepts the minimal loader scene, and whether VaM's menu shrinks with the field of view.
## Broken
- Andrew's VaM main menu runs off the top of his screen (VaM's own UI); Add Plugin is hidden there.
## Open
- First real load of Brene in VaM still pending.
## Settings changed
- New plugin setting "Fit VaM menu (wider view)".
