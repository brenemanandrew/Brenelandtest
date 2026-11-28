# Brenai: what the VaM Phone needs (provisional)

The VaM plugin now has a Phone (texts and calls with Wizra, Zoe, Belinda, Margo). It talks to the Brene relay, which forwards to Brenai. These are the shapes the relay already sends and reads (`vam/relay/story.mjs`). Until Brenai has them, the relay answers plainly and nothing breaks.

## 1. Calls coming in
A character can call the player. Either form works; both are fine together.
- **Event** in `GET /api/story/state`, or in the answer to `POST /api/story/say` or `/api/story/choose`:
  `events: [{ kind: 'call', who: 'zoe', reason: 'wants to talk about the pizza', id: 'c17' }]`
  - `who`: wizra, zoe, belinda or margo. `reason` (optional): one short line shown under "Zoe is calling".
  - `id` (optional but best): the plugin rings once per id. Without one, an event repeated in the state is only rung again after 30 s.
- **State field** `calling: 'zoe'` in `GET /api/story/state` while she is calling. The plugin rings when it changes to a name; clear it (empty or absent) when the call is answered, declined or given up.

## 2. Texts and calls are different
`POST /api/story/say` now carries `mode`:
- `mode: 'text'` - a text message on the phone (the default).
- `mode: 'call'` - said on a voice call. Replies can be spoken and shorter; Margo's call faces follow her actions (*smiles*, *frowns*).
Everything else is as before: `{ who, text, place, present, mode }` -> `{ text, events?, calling?, unread? }`.

## 3. Reporting what the player did
`POST /api/story/call { who, action }`, action one of:
- `answer` - picked up her call.
- `decline` - turned it down.
- `ignore` - let it ring out (30 s), or ignored it while on another call.
- `end` - hung up (after an answered call, or a call the player made).

The character should remember these (a declined or missed call can come up later: "You didn't pick up last night"). Answer `{ ok: true }`, optionally with `events` (for example she calls straight back). Calls the player makes show up as `say` with `mode: 'call'`, then `end`.

## 4. Optional extras the plugin already reads
- `unread: { zoe: 2 }` in the state: the badge on her contact tile.
- `cast: { zoe: { selfie: 'zoe/selfies/latest.jpg' } }` in the state: shown on her call screen (a JPG or PNG path inside the relay's story folder). Margo uses her call faces instead.

## Relay side (done)
- `POST /story/say` passes `mode` through, and `events`, `calling`, `unread` back.
- `POST /story/call { who, action }` forwards to `/api/story/call`. If Brenai answers 404: `{ ok: false, note }`.
- Tests: `node vam/test/story.test.mjs`.
