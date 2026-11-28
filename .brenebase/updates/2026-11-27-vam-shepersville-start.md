---
project: brenai
by: Claude (Brenebase session)
date: 2026-11-27
branch: claude/multi-agent-work-router-w9jzlg
title: Little Shepersville, VaM side started - cast, places, choices, Margo's call, laptop
---
## Done
- Cast in VaM: Wizra, Zoe, Belinda, Margo, each with her own body (any VaM person), voice, lip sync and expressions; chat panel picks who you talk to; messages carry place and who is present. Character flow Finish can assign any of them.
- Relay `story.mjs`: /story/state, say, choose, places, goto, margo, media, writing. Provisional Brenai routes (/api/story/state, say, choose, writing); falls back to Wizra's normal chat until they exist; per-character voice via /api/tts cast.
- Plugin `BreneStory.cs`: story panel with the nine places (each tied to a VaM scene, Go loads it), turning-point choice card, Margo's video call (call faces by mood, phone-style voice), cabin laptop (save on PC with dated copies, sent to Brenai, Tell Margo).
- Margo's pictures copied from the Brenai session's branch as JPG (VaM cannot read WebP) into vam/story/margo.
## Tested
- `story.test.mjs` 21 passed (stand-in Brenai with and without story routes), `relay.test.mjs` 21, `library.test.mjs` 37, plugin compile check passed.
## Not tested
- Real Brenai story routes (not built yet). Anything inside VaM.
## Broken
- None known.
## Open
- Adjust the three Brenai calls in relay/story.mjs to the Brenai session's route spec when it arrives.
- Selfies as writing rewards wait on how Brenai signals them.
- The town scenes and the cast's looks are Andrew's to build (Character flow, Set scene).
## Settings changed
- Relay option `--story` (story folder, default vam/story). Plugin settings "Their voices" and "Cast bodies".
