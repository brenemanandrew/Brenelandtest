# Brenai: guide for the coding assistant

You are taking over the code of Brenai, a companion game at https://brenai.fly.dev. This file is what you need to change it safely.
`HANDOFF.md` is the general introduction (read its sections 1 and 2 for who the owner is and how to work with him). `README.md` has one section per feature and names the functions involved. Read the relevant README section before touching a feature.

## 0. Non-negotiable rules
1. **Run `brenai/tools/check.sh` before every commit, chained with `&&`.** Example: `./brenai/tools/check.sh && git add -A && git commit -m "..." && git push origin HEAD:main`. Never use `;` between the check and the commit.
2. **Never append a `//` comment to a line that has more code after it.** Lines are long, and the comment swallows the rest of the line; `node --check` often still passes. Use `/* ... */`, or put the comment on its own line.
3. **No em dashes** (U+2014) anywhere: code, comments, docs, commit messages, replies. Check: `grep -c $'—' <files>` prints 0.
4. **No secrets in the repo or in chat:** no passwords, PINs, tokens. Ask the owner when one is needed.
5. **Licensed assets never go into git:** her model, outfit models, motion clips, the picture pack. They live on the server volume only.
6. **Do not read the owner's chat text or her notes about him.** When you must inspect a save, print counts, timestamps and `who`, never `text`.
7. **Never claim something works without evidence.** After a visual change, look at a screenshot. After a deploy, fetch the live file and confirm your change is in it and it parses.
8. Keep things tasteful. A sexual animation was declined before; do not build one. Cameras never look at her from below.
9. Do not create a pull request unless asked. Do not touch the owner's other game (Breneland-Next).

## 1. Shape of the project
Plain Node 22 (`node:http`, ESM) and plain browser modules. No framework, no bundler, no TypeScript, no build step. Dependencies: `ws`, `web-push`, `@anthropic-ai/sdk` (unused backup). three.js and three-vrm are vendored under `public/vendor/` and loaded through an import map.

```
brenai/
  server.mjs        the whole server (about 1300 long lines)
  persona.mjs       her instructions: PERSONA (who she is) and STATE_BLOCK (rules that always apply)
  away.mjs          leaving, where to, how long, the state she returns in, call scenes
  pics.mjs          picking and describing pictures
  movies.mjs        films as timed beats
  bridge/           runs on the owner's PC: WebSocket to the server, HTTP to his local model, voice
  public/
    index.html      the game: all UI and logic in one inline classic script
    avatar.js       body controller (moods, gestures read from text); renderer-agnostic
    avatar-vrm.js   the 3D renderer (about 1100 long lines)
    places.js mapkit.js props.js    rooms, furniture catalogue, modelled props
    dev.html        the Studio (owner tools)
    mocap.html mocap.js             motion capture
    tongue.js fineface.js bodyfix.js hang.js intro.js facecam.js sound.js fitpip.js uiedit.js sw.js
  tools/check.sh    parse check
  tools/picpack/    picture pack generator (shots2.cjs = shot list, gen2.cjs = renderer, paint.js = painted backdrops)
  tools/clipconv.mjs  Mixamo FBX to the game's clip format
  Dockerfile fly.toml
```
A new top-level server file must be added to the `COPY` line of the `Dockerfile`. `public/` and `bridge/` are copied whole.

## 2. Code style
The code is written densely: very long lines, many statements per line, short names, a comment explaining intent above or beside a block. Match it. Make surgical edits with exact string replacement and assert that the string you replace occurs exactly once. Do not reformat, wrap or "clean up" a file: diffs must stay small and reviewable.

Comments explain why, in plain words. Keep that habit.

## 3. Server: how a request flows
- `handle(req, res)` routes everything. Static files come from `public/`.
- Site password first (`authed(req)`), then the player: a signed cookie maps to a player; `als.run(player, ...)` puts that player in AsyncLocalStorage.
- **`db` is a Proxy.** Reading or writing `db.x` goes to the current player's save, except for keys in `SHARED_KEYS`, which go to the shared file. So code just says `db`. Outside a request (timers), wrap work in `als.run(u, () => ...)`.
- `save()` writes the current player's file (and the shared file). Call it after changing `db`.
- `isOwner()` gates anything that changes the game for everyone. There is a list of owner-only paths near the top of the `/api/` block; add new shared-writing routes to it.
- `busy` is a global flag: one model call at a time. Set it before calling the model and clear it in `finally`. A stuck `busy` blocks all chat.
- The model is reached with `reply(text, onDelta)`, which goes to the PC bridge (`brainJob`), with a 3 minute timeout. `brain.served`, `brain.failed`, `brain.badAt`, `brain.okAt` track health; `/api/brain` reports it.

### Files on the volume (`DATA_DIR`, `/data` in production)
`users/<id>.json` (one per player), `shared.json`, `avatar.vrm`, `anims.json`, `outfits/*.vrm`, `pack/manifest.json` + `pack/*.webp`, `inbox/*.fbx`, `inbox.json`.

### Things in a player's save worth knowing
`log` (what is shown: `{ who: 'me'|'her'|'sys', text, at, pre?, hidden?, pic? }`), `history` (what the model sees), `sheet` (her character sheet for this player: `rapport`, `bond`, `romLevel`, `path`, likes...), `settings`, `away` (she is out: `{ where, until, ... }`), `glow` (state she came back in), `place` and `solo` (where the two of them are), `movie`, `dates`, `sentPics`, `profile` (her notes: private).

### Routes
All under `/api/`: `state`, `chat`, `settings`, `login`, `pin`, `pin/out`, `pin/word`, `pin/recover`, `owner`, `intro`, `intro/start`, `followup`, `unsend`, `rewind`, `reset`, `touch`, `hearts`, `hang`, `visit`, `plan`, `shop`, `movie`, `event`, `away`, `depart`, `return`, `call/start`, `call/say`, `call/end`, `tts`, `pic/<id>`, `pack` and `pack/<file>`, `outfits`, `outfit/slot`, `outfit/<file>`, `avatar`, `anims`, `anims/clip`, `dev`, `brain`, `disk`, `inbox`, `push`, `weather`.
`/api/state` is what the page loads first; `placeView()` is the part of it about where they are, and many routes return it so the page can call `setPlace(d)`.

Two ways in without a player login, both narrow: the header `x-brain-token` (the PC's token) for the outfit routes and `/api/disk`; and `/api/inbox?code=...` for FBX uploads while the owner has the inbox open.

## 4. Client: the game page (`public/index.html`)
One inline classic script, so its top-level `const`s are visible from the console and from Playwright by name (`avatar`, `visitInfo`, `cine`, `settings`...), but are not properties of `window`.
- `$ = id => document.getElementById(id)`, `el(tag, props, ...kids)`, `api(path, body)`.
- Chat: `send()`, `addLine(who, text)`, `typeOut(body, text)`, `fill(el, text)`, `split(text, who)` (turns her text into speech and action pieces, and story characters into pieces with `c`), `speaker` (her voice), `voice` (the mic).
- Place: `visitInfo`, `setPlace(d)`, `syncPlace()`; `openFly()` is the house wheel.
- Body classes drive the layout: `fp` (first person in a room), `calling`, `cine` (movie night), `solo`, `big`, `hasroom`.
- `brenaiDev.avatar` exposes the avatar for tests.

## 5. Client: her body
- `avatar.js` owns state and decides *what* she does: `act(text)` reads actions and emoji from her reply and queues gestures (`GEST`, `EMOJI_GEST`); `doGesture(name, seconds)`.
- `avatar-vrm.js` decides *how it looks*. Key parts:
  - `GESTURE`: a table of functions of time returning bone rotations `{ boneName: [x, y, z] }` plus channels `_head`, `_face`, `_eyes`, `_tongue`, `_hipY`.
  - `set(bone, x, y, z)` writes a normalized VRM bone. Arms: the right upper arm hangs at z = +1.3 and raises with negative z; the left is mirrored. Positive y on the right arm swings it forward.
  - `CLIPS` and `playClip(name, weight, t)`: recorded motion. Clip format: `{ dur, fps, n, bones: { name: [x,y,z,w per frame] }, hips: [x,y,z per frame], face?: { key: [value per frame] } }`.
  - `ERRAND`: things she gets up and does (fetch a book, pace, yoga).
  - Cameras that take over: heart game, `hangCamera` (one-on-one), `movieCamera` (movie night), each setting `fp.locked`.
  - `takeSnap(spec)`: renders a picture. `spec` fields: `pose`, `gest`, `clip`+`t`, `cam` ('', 'half', 'full'), `scene` (a room, a built-in backdrop, or 'custom' with `window.WIZRA_BG`), `face`, `faceW`, `blush`, `turn`, `arm` ('L'|'R': a phone selfie), `view`, `set`, `hide`, `roll`, `fov`, `tongue`.
  - `relight`, weather, power cuts, `quality()` (adaptive detail).
- Model-specific helpers find things on her model by name at load: `tongue.js` (her mouth, from the "aa" shape), `fineface.js` (VRoid `Fcl_*` shapes).

## 6. Recipes
**A new gesture:** add an entry to `GESTURE` in `avatar-vrm.js`; add a pattern to `GEST` in `avatar.js` so her text triggers it (and to `EMOJI_GEST` if an emoji should); add it to `POSED` in `pics.mjs` if it should be a requestable photo pose; add it to the `POSES` list in `dev.html`. Then render it and look.

**A new rule for how she behaves:** one sentence in `STATE_BLOCK` in `persona.mjs`. Not in `PERSONA`, which the Studio can override.

**A new route:** add it in `server.mjs` next to similar ones; use `readBody(req)` and `json(res, code, obj)`; add it to the owner-only list if it writes shared data; call `save()`.

**A new picture for her pack:** add a row to the level's list in `tools/picpack/shots2.cjs` (and a `KIND` if the shot is new), then run `gen2.cjs` against the live site with a logged-in cookie jar, check the image, and POST the manifest and files to `/api/pack`. Each picture has `lvl` and is only sent at that level. Uploading keeps files of pictures already sent.

**New motion clips:** convert FBX with `tools/clipconv.mjs`, fetch the current `/api/anims`, merge, POST the whole set back. Reference a clip by name in `CLIPS`.

**A new outfit moment:** add the name through `/api/outfits` (`situations`), and teach `situationNow()` in `server.mjs` when it is worn.

**A new prop or room:** `props.js` (models), `mapkit.js` (catalogue entry, footprint), rooms are data edited in the Studio.

## 7. Testing
There is no test suite. Test by running it.

- **Local server:** `PORT=8098 DATA_DIR=<scratch dir> APP_PASSWORD=<any> BRENAI_BRAIN_TOKEN=<any> node server.mjs`. Test switches read from the environment: `VISIT_TEST`, `WANDER_TEST`, `PIC_TEST`, `PIC_TEST_CHAT`, `CALL_TEST_ANSWER`, `CALL_TEST_RING`, `AWAY_TEST_LIE`, `AWAY_SPEED`.
- **A model to talk to:** the bridge needs an OpenAI-style chat endpoint (`LM_URL`). For tests, a tiny mock server that returns a fixed reply is enough.
- **Headless browser:** Playwright with Chromium and software GL: `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Add `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` for camera or mic. Login in tests: fill `#pw`, click `#loginForm button`, fill `#pin`, click `#pinGo`.
- **Page hooks:** `window.WIZRA_STILL` (stops idle motion, set it in an init script), `window.WIZRA_CAM`, `window.WIZRA_CLIP`, `window.WIZRA_FIX`; `brenaiDev.avatar.gesture/weather/power/snapshot/movieMode/hang...`; on the mocap page `window.mocapFeed(landmarks)`, `mocapFace`, `mocapHands`, `mocapTongueProbe`, `mocapDbg`.
- Screenshots can hang when the page is busy rendering; give them a timeout, or drive the page with `evaluate` and take one screenshot at the end.
- Her model and clips are not in the repo. Without them the page shows a drawn fallback avatar, and anything 3D cannot be tested locally. Options: test against the live site with a logged-in cookie, or ask the owner for the files.
- Prefer measuring to guessing. When a pose or a camera looks wrong, print the numbers (bone rotations, positions) rather than trying sign flips blindly.

## 8. Deploying
- Push to `main`: `.github/workflows/brenai-deploy.yml` deploys to Fly in about a minute.
- **Every deploy restarts the server.** In-memory state is lost (a call in progress, `busy`). The PC bridge reconnects by itself. Do not deploy while a long job is using the live site.
- After deploying, fetch the changed file from the live site, check your change is there, and run `node --check` on it.
- The volume is 3 GB. `/api/disk` (owner) reports free space. `.github/workflows/brenai-volume.yml` grows it, run by hand. A volume cannot shrink.

## 9. Traps that have already bitten
- A `//` comment mid-line (rule 2). Four separate bugs.
- A failing check followed by `;` instead of `&&` put a broken page live.
- Changing only `PERSONA` when the Studio has an override: the change never reaches her. Use `STATE_BLOCK`.
- A stale page: the client can hold old state for hours. Server-side guards beat client-side ones.
- Pointer capture on a full-size view swallowing clicks meant for buttons laid over it. Check `e.target`.
- Capping frame time made her walk in slow motion at low frame rates. Use real elapsed time.
- MediaPipe reports confident positions for body parts that are outside the picture. Trust a point only if it is inside the frame (`framed()` in `mocap.js`).
- Placing a camera, then posing: order matters in `takeSnap`. Pose, update the model, place the camera, then apply still-only cheats.
- three-vrm copies rotations from normalized bones to raw bones in `vrm.update`. Scale or hide the **raw** bone, rotate the **normalized** one.
- Her hair is black. Do not use "dark pixels" to detect an empty background.

## 10. What is unfinished
See section 10 of `HANDOFF.md` for the list. The largest items: the Mixamo batch waiting to be converted and wired in (lounging and sitting clips would also fix the movie night pose), the stand-in player on the movie couch, self-collision in the main game (written, off), and room clipping that was reported but not investigated.
