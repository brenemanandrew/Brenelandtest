---
project: brenai
by: Claude (Brenebase session)
date: 2026-11-27
branch: claude/multi-agent-work-router-w9jzlg
title: Brene for VaM - Character panel as a flow, nothing hidden
---
## Done
- Character panel is now a 9-step flow: Who, Start from (a whole look or as is), Body, Face, Skin, Hair, Clothes, Pose, Finish (save look or scene), with Back and Next, numbered steps to jump, and a one-line hint per step.
- Nothing removed: "Show all body/face shapes" lists every morph (60 at a time) besides the simple sliders and search; VaM's own menus untouched.
- Radial Character ring follows the flow (Start, Body, Face, Skin, Hair, Clothes, Pose, Save).
- Fixed a layout risk: tiles now sit in their own grid instead of swapping layout components on one object.
## Tested
- Plugin compile check (C# 5, stand-ins) passed.
## Not tested
- Inside VaM: the flow, Save look (AppearancePresets presetName + StorePreset), the face/body split of all shapes.
## Broken
- None known.
## Open
- Standing rule from Andrew: never remove features, only change how they are presented; prefer flows over menu trees.
## Settings changed
- None.
