---
name: brenai-headless-test
description: Test Brenai without a person at the screen: a local server for routes, and headless Chromium against the local or live site for anything visual (her 3D body, cameras, panels). Use before saying any Brenai change works.
---
# Testing Brenai headlessly

## Local server (routes, panels, no model)
```
PORT=8098 DATA_DIR=<scratch>/data APP_PASSWORD=pw BRENAI_BRAIN_TOKEN=<16+ chars> node server.mjs
```
- Log in once with curl and keep the cookie jar: `/api/login` with the password, then `/api/pin` with `{pin, name, create:true}`. The first PIN becomes owner.
- No model is connected locally: `/api/chat` returns an offline error, D&D and similar routes fall back to plain text. That is enough to test game logic.
- To see her body locally, copy a VRM to `<scratch>/data/avatar.vrm`. Motion clips will be missing.

## Headless browser
Playwright is preinstalled; `require('playwright')` and `chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })`.
- Load cookies from the curl jar (strip the `#HttpOnly_` prefix, split on tabs).
- Wait for her: `typeof avatar !== 'undefined' && avatar.canVisit && avatar.canVisit()`. `window.avatar` is NOT defined; use `typeof avatar`.
- First load after a deploy can take minutes. Give `goto` and the wait generous timeouts. Screenshots can hang: pass `{ timeout: 60000 }`.
- Long runs: start with `nohup ... &`, write a done-file, poll with `until [ -f done ]; do sleep 5; done`.

## Hooks in the page
- `window.WIZRA_STILL = 1` (set in `addInitScript`): no idle motion; also exposes `window.WIZRA_T = { fp, vrm }` so a test can place the first-person camera (`fp.x, fp.z, fp.yaw, fp.pitch, fp.sit = { h }`) and read bones.
- `?wear=<outfit file>` loads one outfit model.
- `brenaiDev.avatar.*` (gesture, weather, snapshot, movieMode, dndMode ...), `window.WIZRA_DND_T` (hold the D&D surprise at a time), `window.WIZRA_CLOTH` (cloth tuning or `{off:1}`), `WizraGames.start(def, preview)`, `WizraDnd.sync(view)`, `WizraRobot.open()`, mocap page: `window.mocapFeed`, `mocapFace`, `mocapHands`, `mocapDbg`.
- To drive the game from a test: `fetch('/api/...', {method:'POST', ...})` inside `page.evaluate`, then `setPlace(d, true)`.

## Method
- For a visual change, render before and after from the same camera and paste them side by side. If they look the same, the change did not work, whatever the numbers say.
- Also read numbers from the scene (bone world positions, element states) so a claim does not rest on a picture alone.
- Hide the chat with CSS when it covers what you are checking.
- Always put the test save back: stop games, leave places, switch the key off.
- Never read a real player's chat text or her notes about him. Use counts, timestamps and who spoke.
