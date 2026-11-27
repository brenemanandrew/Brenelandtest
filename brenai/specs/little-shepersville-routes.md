# Spec: Little Shepersville routes (Brenai server, for the Brene for VaM relay)

From: the Brenai session, 27 Nov 2026. For: the Brenebase session to check against the relay before either side builds.
Design: https://claude.ai/artifact/96dzTmaay7GQejkvGPLmoV ("Where it runs" has the split of work).
Gate: nothing here is built until Andrew has loaded Brene for VaM in VaM once and it works.

## Ground rules
- **Sign-in:** the same as today. Site password cookie, then the player's PIN (`/api/login`, `/api/pin`). Every route below acts for the signed-in player.
- **Separate save:** the story is its own save inside the player's file (`story`). Free-play Wizra (her chat, memory and levels) is untouched, and story Wizra is a fresh Wizra with her own personality.
- **The server is the only source of truth.** The relay keeps no story state. After any call it can ask `GET /api/story/state`.
- **The existing `/api/story` stays as it is:** it is the free-play "story truths" route (exact path only). The new routes are sub-paths and do not touch it.
- **Hidden numbers never leave the server.** Wizra's devotion and mask, and each woman's suspicion, never appear in any response.
- **Cast ids:** `wizra`, `zoe`, `belinda`, `margo`.
- **Place ids:** `cabin`, `pizza`, `boutique`, `spa`, `street`, `library`, `flat` (Wizra's), `lodge`, `trail`, `lake`.
- **Times of day:** `morning`, `afternoon`, `evening`, `night`.

## Routes

### POST /api/story/start
`{ name }` → `state`. Starts a new year: the prologue at the cabin, day 1, morning. If a story is already running it returns 409 unless `{ again: true }` is sent; that keeps the old one as a backup.

### GET /api/story/state
```
{ on: true,
  day: 1, season: 'autumn', time: 'morning', date: 'Mon 14 Sep',
  place: 'cabin',
  cast: { wizra: { where: 'library', here: false, mood: 'giddy', level: 0 }, zoe: {...}, belinda: {...}, margo: { where: 'city', here: false } },
  pending: null | { id: 'tp2', who: 'wizra', place: 'pizza', question: '...', answers: [{ id: 'a', text: '...' }, ...] },   /* 2 to 4 answers */
  book: { chapter: 1, words: 1800, chapterWords: 8000, deadline: { day: 60, chapters: 3 } },
  unread: { wizra: 2, margo: 1 },
  next: 'Coffee with Wizra at Peak Pizza, tomorrow morning' }
```
- `mood` is a single word for the face and voice: giddy, happy, shy, flat, annoyed, sad, upset, tender.
- `level` is the romance level, 0 to 4.
- `here` is true when she is at the player's place now.
- `pending` is set while a turning point waits. Saying things still works then; time does not move until it is answered.

### POST /api/story/say
`{ who, text, place, present: ['wizra', 'zoe'] }` → `{ who, text, actions: ['smiles'], mood, choice?: pending, events?: [...] }`
- **Who she knows is there:** `place` and `present` tell her where she is and who can hear. The server checks them against its own state and uses its own if they disagree, so a stale relay can't move people.
- **Actions:** `text` is the spoken line only. Actions in asterisks are returned separately in `actions`, so the relay can map them to expressions as it does today.
- **Turning points:** `choice` is set when this line opened one. The same object appears in `state.pending`.
- **Events:** things that happened alongside the line, for the relay to show or ignore. For example:
  - `{ kind: 'text', who: 'zoe', text }`: a message from someone not present;
  - `{ kind: 'selfie', who: 'margo', file, caption }`;
  - `{ kind: 'leaves', who: 'belinda' }`;
  - `{ kind: 'arrives', who: 'wizra' }`.
- **One reply per character at a time:** a second `say` to the same character while she is answering gets 409. Different characters can answer in turn, but not in parallel, since it's one PC model.
- **Streaming (optional):** `{ stream: true }` gets the same server-sent events as `/api/chat` (`delta` pieces, then `done` with the full object above).

### POST /api/story/choose
`{ id, answer }` → `{ lines: [{ who, text, actions, mood }], state }`. Answers the pending turning point. `lines` are the scripted lines that follow, in order, for the relay to speak one after another. 409 if `id` is not the pending one.

### POST /api/story/go
`{ place }` → `{ state, arrived: [{ who }], summary? }`. The player moves. Travel costs one time slot unless it's the same building (spa and boutique). Who is there follows each woman's schedule. Moving may open a turning point.

### POST /api/story/rest
`{ until: 'next' | 'sleep' | 'skip' }` → `{ state, summary }`.
- `next`: to the next time slot.
- `sleep`: to the next morning.
- `skip`: through quiet days up to the next planned scene.

`summary` is the card text, for example `{ days: 6, words: 4200, texts: { zoe: 9 }, lines: ['Margo called twice.'] }`.

### POST /api/story/write
`{ beat, score }` → `{ words, chapter, chapterWords, inspiration: { used: ['mystery', 'heart'] }, block?: true, selfie? }`
- `beat` is one of `clue`, `chase`, `confession`, `twist`, `quiet`.
- `score` is 0 to 1, from the rhythm round on the laptop.
- No typing is needed, so it works in VR with the pointer.
- `block: true` means writer's block (no inspiration left): halved words.
- A finished chapter can come with a Margo `selfie`.

### GET /api/story/selfies
→ `[{ file: '/story/margo/selfies/cat.webp', caption, at }]`: Margo's selfies unlocked so far.
- Files are served by Brenai for the signed-in player.
- Her video-call frames are `/story/margo/call/<mood>.webp`, with moods `warm`, `listening`, `skeptical`, `stern`, `delighted`, `smiling`, `evening` and `weekend`. They fit the plan of her stills on a panel with her voice.

### POST /api/tts (existing, one addition)
`{ text, cast }`: `cast` takes `wizra`, `zoe`, `belinda` and `margo` for each character's own voice, alongside the voices it takes today. The relay strips actions first, as it does now.

## Errors
Same shape as today: `{ error: 'plain words' }` with 400 (bad input), 401 (signed out), 409 (busy or not pending), and 503 (her mind on the PC is offline: the relay shows "they're not here right now" and keeps the world as is).

## Not in this spec (later)
Night-time signs, sabotage events and endings are server-side and appear only as `say` lines, `events` and `state`. The relay needs nothing extra for them. Speech input for VR is not planned yet.
