---
project: brenai
by: Claude (Brenebase session)
date: 2026-11-27
branch: claude/multi-agent-work-router-w9jzlg
title: Brene for VaM - radial menu and Character panel
---
## Done
- Radial menu (`BreneRadial.cs`): hold the menu key and flick to pick, tap to leave it open, right-click or Esc goes back; nested rings for Character, Scene, Glasses, Panels. Own canvas, so it opens with the panels hidden. Key choosable in the plugin settings.
- Character panel (`BreneCharacter.cs`): Body and Face sliders in plain words, each matched to the person's morphs with the real name shown; search over all shapes with clean names; Reset; Skin, Hair, Clothes and Looks as picture tiles from the relay library.
- Library: skin, hair and clothing presets added (and the Looks tab on the page has a Whole look / Skin / Hair / Clothes picker); presets applied through SkinPresets, HairPresets, ClothingPresets.
## Tested
- Plugin compile check (C# 5, stand-ins) passed. `library.test.mjs` 37 passed, `relay.test.mjs` 17 passed. Page picture checked.
## Not tested
- Nothing inside VaM: the radial menu, the Character panel, morph matching on real morph names, preset loading.
## Broken
- None known.
## Open
- Morph name guesses need a first run on Andrew's VaM to tune.
## Settings changed
- New plugin setting "Menu key" (default BackQuote).
