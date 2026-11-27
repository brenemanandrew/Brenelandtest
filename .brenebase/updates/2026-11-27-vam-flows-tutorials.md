---
project: brenai
by: Claude (Brenebase session)
date: 2026-11-27
branch: claude/multi-agent-work-router-w9jzlg
title: Brene for VaM - scene and glasses flows, tutorials
---
## Done
- Reusable flow panel (`BreneFlow.cs`): numbered steps, one-line hint, live green/orange check, Back/Next.
- "Set up a scene" flow (Start, People, Pose, Lights, View, Play & save) and "Glasses setup" flow (Relay, Glasses, Straight ahead, Directions, 3D, Hands) with live checks.
- Tutorials (`BreneCoach.cs`, `BreneGuides.cs`): spotlight tour with cards and "try it" steps that wait for the action. Welcome on first start, plus Make a character, Set up a scene, Glasses, Library, Layout in a Help panel. Dock gained Set up scene, Glasses setup, Help.
- Library page: first-visit spotlight tour and a ? button to replay it.
## Tested
- Plugin compile check (C# 5, stand-ins) passed. `library.test.mjs` 39 passed (tour starts on first visit, finishes and stays closed), `relay.test.mjs` 17 passed. Tour pictures checked on a phone size.
## Not tested
- Anything inside VaM: flows, tutorial spotlight placement, AddAtomByType by name, light settings names.
## Broken
- None known.
## Open
- Match the tutorial's look to the Game Maker's if Andrew sends a screenshot (that app is not in reachable repos).
## Settings changed
- Layout file now stores whether the Welcome tour was seen.
