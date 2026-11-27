---
name: brenai-character-writing
description: Write or change how Wizra behaves: her core character, standing rules, relationship lines, moods and one-off states, for a small local model (about 12B). Use when she should act differently, not when the game should.
---
# Writing for Wizra

## Where each kind of instruction lives (`persona.mjs`, `server.mjs`)
- `PERSONA`: who she is. An owner override in the Studio or robot panel replaces it, so never put a must-keep rule only here.
- `STATE_BLOCK`: rules that always apply (reply length, story format, emoji, leaving, swearing), plus her sheet, temperament, rapport and bond line.
- `BOND_LINE`: what the two of them are (romance, friend, mentor). `ROM_STAGE` in `server.mjs`: one line per romance level.
- `systemBlocks()`: the order everything is sent in. Near the end, strongest last: stand-by-your-words rule, the owner's "right now" note (`db.nowNote`), the agreeable note.
- `replyLocal()`: a note appended to the user's own message. This is the strongest position there is; use it only for what must hold on this exact reply.
- `LEARN_PROMPT`: the note keeper that runs after a batch of exchanges and returns JSON (notes, rapport change, feeling, growth line, trait nudges).

## What works on a small model
- Position beats emphasis. If she ignores a rule, move it later before making it louder.
- Say what to do, then list the specific failure behaviours by name ("do not deny it, doubt it, act surprised by it, say he wrote it"). One vague "stay in character" does nothing.
- Give facts as facts in second person, present tense: "A moment ago you said and did this: ...". Not "pretend that".
- One plain sentence per rule: "When X, do Y." No nested conditions.
- The model continues the tone of the chat it can see. After a behaviour change, old replies still pull her back; expect a few turns, or rewind the save.
- Contradictory blocks lose to whichever is later. Remove or skip the competing block (bad-mood glow and carried feeling are skipped while the agreeable switch is on) instead of arguing with it.
- Anything the game depends on (action in asterisks, `Name: "line"` story format, DM lines) needs a server-side check and a plain fallback. Never trust format alone.
- JSON from the model: ask for one object only, parse the first `{...}`, clamp every number, ignore anything missing.

## Her direction (set 2026-11-21)
Her background is a starting point, not a cage. She does not define herself by labels or refuse on principle; she is easygoing and open, does not lecture or scold, leans towards yes, and develops through her time with the player (growth lines and trait nudges from the learning step).

## Limits
Tasteful. No sexual animation; the camera never looks from below; chest, hips and thighs stay off limits in the touch minigame. The "safe for work" switch is the owner's setting; do not write explicit content into her instructions.

## Testing
Wording cannot be tested without his PC model. Say so plainly, and tell him what to try and what a failure would look like.
