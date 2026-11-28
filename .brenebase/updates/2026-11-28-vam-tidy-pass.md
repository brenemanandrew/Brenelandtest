---
project: brenai
by: Claude (Brenebase session, Fable subagent for the pass)
date: 2026-11-28
branch: claude/multi-agent-work-router-w9jzlg
title: Brene for VaM - QoL and bug-fix pass
---
## Done
- Relay: odd addresses and oversized bodies no longer crash or hang; one shared Brenai sign-in; expired sign-in retried once; story polling backs off after errors; command ids survive a relay restart; Hub downloads stream to disk; a second relay says it is already running.
- Plugin: real voice error text, one WAV download, old voice clips freed, two messages in flight handled, cut WAVs safe; menu key ignored while typing; closing the plugin undoes Fit VaM menu and Move VaM menu; Reset layout keeps the tour seen; thumbnails freed with their tiles; null guards in radial, glasses, flows, VR, reactions.
- Consolidated: one JSON request helper, one picture-tile builder and loader (LoadImage in one place), layout helpers replacing about 45 copies.
- QoL: one plain relay-down message, clearer errors, start-brene.bat says when Node.js is missing, panels pulled back on screen whenever sizes change, per-frame errors reported three times not every frame, double-load warning.
## Tested
- compile.sh ok; relay.test 26, story.test 30, library.test 38 passed (8 new checks).
## Not tested
- In VaM. New and unseen there: EventSystem.currentSelectedGameObject, InputField.isFocused, the PicOwner component.
## Broken
- None known.
## Open
- Two copies of Brene (session plugin plus Brene Loader) fight; use one. Story polling keeps the Fly machine awake while VaM runs. Move VaM menu moves any non-atom world UI, maybe other plugins'. Empty turning points never show.
## Settings changed
- None.
