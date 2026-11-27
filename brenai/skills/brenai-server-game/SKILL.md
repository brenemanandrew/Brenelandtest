---
name: brenai-server-game
description: Add a game or shared activity to Brenai where the server owns the rules and the language model only words it (pattern used for D&D night, movie night, minigames). Use when building any new activity with state, turns or scores.
---
# Building an activity

## The pattern
1. A rules module (`dnd.mjs` is the model): pure functions over a small state object: `newGame`, `view(g)` for the page, one function per player move. No model calls, no I/O. Add the file to the Dockerfile `COPY` line and `tools/check.sh`.
2. One route in `server.mjs` taking `{ start | say | roll | stop ... }`. State lives on the player's save (`db.dnd`). The route returns `placeView()` with the game's `view` inside it.
3. Wording: `word(prompt, plainLine)` asks her model and falls back to a plain line written from the facts when the model is slow, silent or off format. Give it a time limit (one minute).
4. The page script (`public/dnd.js`): `sync(view)` is called from `setPlace` and turns the mode on and off; it draws the HUD and routes what the player types (`send()` in `index.html` checks `WizraDnd.on` first).
5. The 3D side (`avatar-vrm.js`): a mode function, a set piece group, and a camera takeover (see `brenai-vrm-avatar`).

## Rules learned the hard way
- The server decides everything that has to be true: dice, turns, hit points, what happens. The prompt tells the model the outcome and forbids it to roll, count or decide.
- Never make the page wait for narration to show a result. Return the result at once; fetch the telling with a second call.
- Decide what counts as a move with a rule (`skillOf(text)`, or text starting with I, we, my, let's), so table talk does not trigger a roll.
- Nothing irreversible happens to the relationship from a game except small bond points and a memory at the end.
- Keep the chat readable over the scene: a bottom strip, not a full panel.
- Everyone at a table sits; hold her in her seat.
- Cooldowns and level gates go through `rule(...)` so the Studio can change them, and through `KEY()` so the owner's master key opens them for testing.

## Small games
For toss, tap and timing games no code is needed: the Studio's Minigames section makes them from templates (`public/minigame.js`, `/api/game`).

## Test
Run the whole flow with curl against a local server (start, say, roll, narrate, stop) before touching the page, then one headless render on the live site.
