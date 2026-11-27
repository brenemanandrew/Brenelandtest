---
project: brenai
by: Claude (Brenebase session)
date: 2026-11-27
branch: claude/multi-agent-work-router-w9jzlg
title: Brene for VaM - Wizra's body, voice, lip sync; Build Wizra tutorial
---
## Done
- Relay: her voice from Brenai's own `/api/tts` (signed in as the player), made in the background per reply, served at `/voice?id=`; *actions* are not voiced.
- Plugin (`BreneWizra.cs`): pick any VaM person as Wizra's body; her voice plays from the head; lip sync from the voice's loudness; expressions from her actions (smile, frown, surprise) that ease off; eyes look at the player.
- Character flow Finish gets "Make her Wizra"; the character tutorial is now "Build Wizra", using her description from Brenai's persona (about 5'4", black hair, pale skin, hourglass, goth style), ending with talking to her.
## Tested
- `relay.test.mjs` 21 passed (voice through a stand-in Brenai). Plugin compile check (C# 5, stand-ins) passed.
## Not tested
- Real brenai.fly.dev chat and voice through the relay. Anything inside VaM: audio loading, lip sync and expression morph names, eye lookMode, the Build Wizra tour.
## Broken
- None known.
## Open
- Scene awareness (telling her what is happening in VaM) not built.
## Settings changed
- New plugin settings "Wizra's voice" and "Wizra's body (person)".
