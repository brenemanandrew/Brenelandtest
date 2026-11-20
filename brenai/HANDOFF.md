# Brenai: handoff for a new editor

Read this first. It tells you what the game is, where everything lives, what you may change, and how not to break it.
`README.md` has one section per feature and is the detailed reference. `WISHLIST.md` is the list of ideas not built yet.

Two readers are expected:
- **The design editor (Violet):** decides what should change and writes content: her personality, rules, reactions, stories, picture ideas, events, rooms. Sections 1 to 5 are yours.
- **The coding assistant:** changes the code. All sections are yours, and sections 6 to 10 matter most.

## 1. What Brenai is
A companion game at https://brenai.fly.dev. The player talks with **Wizra**: 22, goth, plays D&D, college student. She has a 3D body, a voice, a dorm, a schedule, moods, memory of the player, and a relationship that grows through five romance levels (0 to 4). The owner and main player is **Andrew**.

Her words come from a language model running on Andrew's PC (through a small bridge program). The game supplies everything around the words: her body, her rooms, what she remembers, where she is, what she is wearing, the pictures she sends.

## 2. How to work with Andrew
- **Never use em dashes.** Not in replies, not in files. Use commas, colons or full stops.
- Answer first, and keep it short. He usually reads on his phone.
- Accuracy over agreement. No flattery. Never say something is done, fixed or live without checking. Say what was done, what was tested, and what was not.
- If you are running out of usage, stop, hand over what is finished, and say why.
- **Privacy:** do not read his chat with her, or her notes about him. If you must look at a save, use counts, timestamps and who spoke, never the text.
- **Tasteful:** a sexual animation request was declined earlier and removed. Do not rebuild it. The camera never looks from below. In the one-on-one touch minigame her chest, hips and thighs are off limits.
- Do not ship anything to his other game (Breneland-Next, breneland.fly.dev) unless he says so.
- Never write passwords, PINs or tokens into the repo or into a chat. If you need one, ask him.

## 3. What can be changed without touching code
Most of her character is data, edited in the **Studio** (`/dev.html`, owner only) and saved on the server:

| What | Where in the Studio | Notes |
|---|---|---|
| Her personality sliders, story, likes, secrets | Character and rules | Takes effect on her next reply |
| Her core character text | Character and rules, Core character | The full instruction text she is given. Empty puts the original back |
| Game rules (points per level, how often she sends pictures, and so on) | Character and rules, Game rules | Numbers only |
| Reactions (a phrase the player says, paired with a pose and an emoji) | Character and rules, Reactions | |
| Outfits per level and moment | Character and rules, Outfits | 55 models are loaded: 5 levels by 11 moments |
| Scripted events | Events | "At 9pm in her dorm she walks to the window and says..." |
| Rooms and furniture | Maps | Built from a catalogue of props |
| Screen layout | Layout | Separate for phone and PC |

If a change fits one of these, make it there. Do not ask for code.

## 4. Writing for her (for the design editor)
Her instructions live in `persona.mjs`. Two parts:
- `PERSONA`: who she is. The Studio can override this text.
- `STATE_BLOCK`: rules that always apply (reply length, emoji, stories, when she may leave). Change behaviour rules here, because a Studio override does not replace them.

Conventions she follows, which the game depends on:
- An action goes in asterisks: `*pulls her hood up*`. Everything else is spoken.
- In a story, each character gets their own line: `Grum: "Who goes there?"` and `Grum: *lowers his axe*`. Lines with no name are her narrating.
- She may send a single emoji instead of describing an action. The game turns it into the gesture.
- She only leaves for things that fit the time of day.

When you want her to behave differently, write the rule as one plain sentence in her voice of instruction ("When X, do Y"), and give it to the coding assistant to place in `STATE_BLOCK`.

## 5. Asking for a code change (for the design editor)
Give the coding assistant:
1. What the player should see or be able to do, in one or two sentences.
2. Where in the game it happens (chat, her room, movie night, Studio, mocap page).
3. What must not change.
4. How to tell it worked.

Do not describe how to code it. One change per request.

## 6. Layout of the code
Everything is in `brenai/`. No build step, no framework: plain Node and plain browser modules.

| File | What it is |
|---|---|
| `server.mjs` | The whole server: saves, logins, chat, her coming and going, pictures, outfits, all `/api/...` routes |
| `persona.mjs` | Her instructions (see section 4) |
| `away.mjs` | Detecting that she is leaving, where to, for how long, and what state she comes back in |
| `pics.mjs` | Which picture she sends: live selfies, the picture pack, requests for a specific pose |
| `movies.mjs` | Films for movie night, as timed beats she reacts to |
| `bridge/wizra-bridge.mjs` | Runs on Andrew's PC: connects the server to his local model and voice |
| `public/index.html` | The game page: all its UI and logic in one inline script |
| `public/avatar.js` | Controller for her body: moods, gestures read from her text, state. Same for any renderer |
| `public/avatar-vrm.js` | The 3D renderer: her model, poses, gestures, cameras, lighting, weather, taking pictures |
| `public/places.js`, `mapkit.js`, `props.js` | Rooms, the furniture catalogue, the modelled props |
| `public/dev.html` | The Studio |
| `public/mocap.html`, `mocap.js` | Motion capture: camera, video and picture import, pose by hand, saving clips |
| `public/tongue.js`, `fineface.js`, `bodyfix.js` | Her tongue, the finer face shapes, self-collision |
| `public/hang.js`, `intro.js`, `facecam.js`, `sound.js`, `fitpip.js` | One-on-one minigame, first-meeting flow, reading the player's face, sounds, outfit preview |
| `tools/check.sh` | Parses every script. Run before every commit |
| `tools/picpack/` | Makes her picture pack: `shots2.cjs` lists the shots, `gen2.cjs` renders them |
| `tools/clipconv.mjs` | Turns Mixamo FBX motion files into the game's clip format |

## 7. Rules for changing code
- **Run `brenai/tools/check.sh` and only commit if it passes.** Chain with `&&`, never `;`. A broken page was once pushed live because of a `;`.
- **Never put a `//` comment after code on a line that continues.** Lines here are long and a `//` swallows the rest. Use `/* */`, or put the comment on its own line. This has caused four bugs.
- The code style is dense: long lines, many statements per line. Match it. Make small, exact edits. Do not reformat files.
- A new server file must be added to the `COPY` line in `Dockerfile`. `public/` and `bridge/` are copied whole.
- Licensed and large assets stay **out of git**: her model, the outfit models, motion clips, the picture pack. They live only on the server's data volume (`/data`).
- Search for em dashes before committing (the character U+2014): `grep -c $'\u2014' <files>` should print 0.
- Add a short section to `README.md` for every feature you add.

## 8. How data is stored
- One save file per player (`/data/users/<id>.json`), chosen by the player's PIN. Code just says `db`; which save that is depends on whose request is being handled.
- Things shared by everybody (`/data/shared.json`): Studio settings, outfits, rules, core character text, owners.
- **Owners** may use the Studio, mocap and anything that changes the game for everyone. Check with `isOwner()`.
- Big files on the volume: `avatar.vrm`, `anims.json` (motion clips), `outfits/`, `pack/` (pictures), `inbox/` (incoming motion files).

## 9. Running, testing, deploying
- **Local:** `PORT=8098 DATA_DIR=<a scratch folder> APP_PASSWORD=<any> BRENAI_BRAIN_TOKEN=<any> node server.mjs`. Without her model file and clips the page falls back to a simple drawn avatar.
- **Deploy:** pushing to `main` runs `.github/workflows/brenai-deploy.yml`, which deploys to Fly. It takes about a minute. Check the live file contains your change before saying it is live.
- **Every deploy restarts the server.** The PC bridge reconnects by itself. Anything held in memory (a call in progress, the inbox code) is lost.
- **Headless testing:** Playwright with Chromium and software rendering works. Useful hooks in the page: `window.WIZRA_STILL` (no idle motion), `brenaiDev.avatar.*` (gesture, weather, snapshot, movieMode and more), `window.mocapFeed(landmarks)` and `window.mocapDbg` on the mocap page. Always look at a screenshot of anything visual before calling it done.
- **Storage:** the data volume is 3 GB. `/api/disk` reports free space. `.github/workflows/brenai-volume.yml` grows it by hand.

## 10. State of things
Working and live: chat, voice, her 3D body and rooms, coming and going, calls, pictures by level, outfits by level and moment, the Studio, motion capture (camera, video, picture, face, fingers, tongue), movie night as a film, stories with character voices, weather, notifications.

Known gaps and open items:
- **Her PC model sometimes stops answering** while the bridge stays connected. The status dot turns amber. The fix is on the PC: load the model and its local server again.
- **Movie night:** the player on the couch is a simple stand-in, not a real model. Her lounging pose and her walking over to switch the TV on are not built.
- **Self-collision in the main game** is written (`bodyfix.js`) but switched off behind `window.WIZRA_FIX`, because it was never checked visually there.
- **Mixamo batch:** 79 clips were chosen and a script was given to Andrew to fetch them into `/data/inbox`. They still need converting to her skeleton and wiring in. The converter is `tools/clipconv.mjs` (`node clipconv.mjs <folder of FBX> <out folder>`, needs the `three` package); the result is posted to `/api/anims` as `{ clips: { name: clip } }`, the whole set each time, so fetch the current set first and merge.
- **Mocap on a real camera** is largely untested: jitter guards, finger and tongue tracking were tuned on made-up data and photos.
- **Room clipping** in windows and furniture was reported but not looked at.
- Parked on purpose: two players at once.

When in doubt about a feature, search `README.md` for its section, then read the code it names.
