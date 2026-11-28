---
project: brenai
by: Claude (Brenebase session, subagent build)
date: 2026-11-28
branch: claude/multi-agent-work-router-w9jzlg
title: Brene for VaM - Phone, tour at every start, icons and shrink-to-icon, VR comfort for controllers
---
## Done
- Phone (BrenePhone.cs) replaces Wizra's chat and Margo's call window: contacts with badges, texts per person, call screen (Margo's faces, others' selfie or initial), incoming calls with a code-made ring tone, Answer/Decline, call waiting banner (Switch/Ignore). Dock "Phone".
- Relay: /story/say passes mode (call or text) and returns events, calling, unread; new POST /story/call {who, action} to Brenai /api/story/call (404 safe). Spec for the Brenai session: vam/specs/brenai-phone-routes.md.
- Welcome tour opens at every start with a "Don't show this at start" tick box.
- Icons drawn in code (BreneIcons.cs) on dock buttons and title bars; every panel (not dialogs) shrinks to a draggable round chip; saved with the layout.
- VR (controllers over Steam Link, per Andrew): board at arm's length facing him with 4 cm buttons, hover highlight, fingertip poke (slider "Poke tip distance"), glowing hands at the controllers, both-hands gesture opens the radial, Bring board here in the radial, bigger wrist dock.
- Fix after Andrew's report that the wrist phone sits far from his wrist: controller positions now go through the headset camera's own rig (its parent transform is VaM's tracking space, with player height and world scale) instead of VaM's camera target. Fixes the wrist dock, glowing hands, poke and touch reactions together.

## Tested
- compile.sh ok; relay 26, story 39, library 38 passed.
## Not tested
- Nothing run in VaM or the headset. Trigger finger-curl not built (input mapping unverified).
## Broken
- None known.
## Open
- Brenai session: call event / calling state, say mode, /api/story/call (see spec).
- Thumbsticks, buttons and haptics are not reachable from a VaM plugin.
## Settings changed
- New plugin setting "Poke tip distance (m)". Layout file: tourOff, shrunk panels and chip positions.
