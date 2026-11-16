# Inspect, whisper, busy bubbles, and shop music (Andrew, 2026-11-16)

Spec of what Andrew asked for, plus what exists and a build plan. Nothing here is built yet.

## 1. Tap / click a player or NPC: a small menu
- Tap or click any player or NPC: a small pop-up with **Inspect** and **Whisper**.

### Inspect: the character sheet
- A larger, rotatable view of the character model (drag to turn).
- **NPC:** who they are and what they do (from `design/characters.md`: name, role, where they work, a line about them).
- **Player:** who they are, their dog affection levels (Nala, Dax, Molly), their achievements.

### Whisper: private messages
- To a player or an NPC. Only the sender and receiver ever see it.
- In the chat log: light purple text.
- In the world: a speech balloon with a purple outline, visible only to the two involved.
- **Talking to an NPC directly** = whispering them.
- **Talking to an NPC indirectly:** type their name, then the message (e.g. "Kevin, how are the fish?"). That focuses the NPC on you.
  Once you leave their general vicinity the focus resets.
- No other player can ever see NPC-to-player whispers, or NPCs' replies to them. Players can whisper each other.

### Busy bubble
- A player in a tutorial, reading something, or in a menu shows a small balloon over their head with three dots that bounce in
  sequence, so others can see they are busy.

## 2. Music and sound for the new shops

### What exists (breneland-live/js)
- `music.js`, `music-songs.js`, `music-band.js`, `music-sampler.js`, `music-place.js`: the game's own composed music, played on
  sampled instruments. Songs are picked by place (yard, town, lake, woods, Lovecraft house, game store, fishing, Kevin's boat) and
  by hour (brighter mornings, mellower evenings, sparse late). Crossfades between places like a door closing.
- Game store: counter-talk and high-score songs; D&D back room has its own sound (`dnd-sound.js`). Andrew likes this soundscape.
- Kevin's Tool Crib: his radio (`crib-sound.js`). Boat: `boat-music.js`. Summit Slice party: `mall-staff-party-sound.js`.

### Wanted
- **Wooden buildings creak:** every so often boards creak as people walk around and the building settles. Especially the game store,
  and every new wooden store. Soft, atmospheric, not constant.
- **Peak Threads:** its own song, the same piece re-voiced through the day:
  - morning: lighter;
  - day: standard;
  - evening, as the day wraps up: lo-fi.
- **Belinda's Spa (upstairs):** a different, subtly relaxing and calming piece "with a little spice".
- **Shop ambience** in Peak Threads: hangers sliding, the till, folding, soft footsteps, quiet chatter. Gentle, never intrusive.
- **Summit Slice by day:** pizza-place vibe, re-voiced over the day the same way.
- **Summit Slice party** (Wed, Fri and Sat, 11:30 pm to 5 am; the shop swaps about 15 minutes either side):
  - intense music you can dance to, lo-fi to hi-fi;
  - "musical guest" sets, all kinds of styles;
  - the theme is getting down.
- **Unstable Unicorns area:**
  - The closer you get to the set, the more the normal music fades out and the area's music fades in.
  - Magical, light-hearted, poppy, fun tabletop-card-game music in a fantasy setting, re-voiced by time of day.
  - Real magical sound effects: chimes, shimmer, soft whooshes, sparkles. NOT beeps and boops.
- **Holiday remixes**, Thanksgiving and Christmas only for now: slight remixes of the shop and area songs.

## 3. Build plan (order)
1. **Busy bubble.**
   - The client sends a "busy" flag when a tutorial, a reader or a menu opens.
   - Everyone draws three bouncing dots over that player.
   - Needs a small server relay of the flag; it can ride along with the position updates if the server forwards extra fields.
2. **Tap menu + Inspect, NPCs first.**
   - Raycast on tap or click.
   - Pop-up menu, then a sheet with its own small renderer of the model (rotatable).
   - Facts come from `design/characters.md`, as a JSON export.
3. **Inspect for players.**
   - Needs the player's dog affection and achievements.
   - Their own are local; another player's need a server lookup.
4. **Whisper.**
   - Player to player needs a server message that goes only to the target (`{t:'whisper', to, text}`).
   - The server code is NOT in this repo mirror. Needs the Breneland-Next server, or Andrew adds the relay.
   - Player to NPC can be fully local (only you see it): the purple balloon is drawn only on your screen.
   - The NPC replies via the local LLM (LM Studio) using `design/characters.md`.
5. **Indirect address.**
   - Chat starting with an NPC's name focuses that NPC on you, privately, while you are near.
   - The focus resets when you walk away.
6. **Sound:**
   - creak layer for wooden interiors;
   - Peak Threads day song with morning, day and evening voicings, plus shop ambience;
   - the spa song;
   - Summit Slice day song plus the party set;
   - the Unstable Unicorns proximity crossfade plus song and magic sound effects;
   - holiday variants (a date check in `music.js` and re-voiced instruments).
   - All go through the existing music system, so they share its style and crossfades.

## Open questions for Andrew
- Achievements: which ones exist or should exist for the player sheet?
- Whisper relay: OK to add a server message type in Breneland-Next when we ship?
- Party "musical guests": named in-game acts (a fictional DJ or band), or just varied sets?
