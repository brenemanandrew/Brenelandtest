# Brenai (brenai.fly.dev)

Chat with Wizra. Her brain is **your PC's model** (MN-Violet-Lotus-12B in Bionic, the same setup as the Breneland townsfolk), reached through a bridge you run on the PC: see `bridge/README.md`. Claude (`claude-opus-5-5`) is only a backup when the PC is offline and an `ANTHROPIC_API_KEY` is set. One Node file (`server.mjs`), one page (`public/index.html`), her character in `persona.mjs`.

## What it does
- Layout (Andrew's second sketch, 2026-11-17): her avatar top left (arrow button expands it, brain button opens the settings wheel) with her word balloon beside it; the chat area; your portrait over the chat area's bottom right corner (the chat text is masked out of that corner and stops above it) with your word balloon to its left; the chat bar with mic and send. Phone and PC sizes come from media queries at the end of the `<style>` block.
- Chat area: each message is a round still picture of the speaker (hers is a snapshot of the current avatar), the spoken text beside it, and each action in its own white-outlined strip in third person ("he grabs the cookies"). Type actions in `*asterisks*`. Balloons show speech only and scroll when long.
- Action wheel: the hand button on the corner of your portrait fans out icon buttons (Wave, Poke, High five...). Each sends an action she reacts to. The pencil edits them (emoji icon, name, what you do); they are saved on the server.
- Replies are short by default (Reactions > Reply length: short, medium, long). To stop rambling and repeats on the PC model: a length cap, a reminder on each turn, repeat penalties, and the server drops any sentence or action she already used in her last 8 replies.
- Her voice is Kokoro on the PC (the bridge runs `kokoro-js` on the CPU; `start-wizra.ps1` installs it once; 28 voices, picked on Wheel > Voice, same on every device). If the PC voice is not running, the device's built-in voices are used.
- Voice conversation: she speaks her replies out loud with the browser's built-in voices (spoken words only, never actions). The mic is held while she talks and listens again after; with "headphones" on it keeps listening and talking over her cuts her off. Voice, speed and pitch are per device (Wheel > Voice).
- Talk to text is on by default (Chrome, Edge, Safari): it listens, and once you stop talking for 2.5 s (adjustable) it sends. The mic button by the text box turns it off; typing holds that message back.
- Tap her picture for the settings wheel: Emotion, Reactions, Temperature, SFW, Bleep, Character (birthday, backstory, likes, dislikes, rapport, cussing), Hidden likes, Talk to text.
- She learns you: every 6 of your messages a side call rewrites her private notes on how you talk, moves rapport up or down, marks secret likes she admitted, can grow a new secret like from a good moment, and can raise her cussing one step (only if allowed, rapport 60+, and you cuss yourself).
- Bleep only changes what is shown; the real text is kept, so turning it off shows the original.
- Temperature is a real sampling temperature on the PC model (0.3 to 1.2). On the Claude backup it only steers her instructions.
- Context: on the PC model, as much recent chat as fits the loaded context (`CONTEXT_TOKENS`, 32k); older messages drop out but her notes, rapport and secrets carry on. On the Claude backup, everything up to 600k tokens.
- Data lives in `/data/brenai.json` on a 1 GB Fly volume. New conversation (at the bottom of the wheel) starts a fresh log and keeps what she learned.

## First deploy (Andrew, from the PC with flyctl)
```
cd brenai
fly apps create brenai
fly volumes create brenai_data -a brenai -r iad -s 1 --yes
fly secrets set -a brenai BRENAI_BRAIN_TOKEN=long-random-secret APP_PASSWORD=pick-one
fly deploy --ha=false
```
Or from the phone: add repo secrets `BRENAI_BRAIN_TOKEN` and `BRENAI_PASSWORD` (and `ANTHROPIC_API_KEY` only if you want the Claude backup) in GitHub, then rerun "Brenai Deploy" in Actions (it creates the app and volume and copies the keys). Pushes to `main` that touch `brenai/` deploy through `.github/workflows/brenai-deploy.yml` if the repo has the `FLY_API_TOKEN` secret (`fly tokens create deploy -a brenai`).

## Settings (fly.toml [env] or secrets)
`CONTEXT_TOKENS`, `REPLY_TOKENS`, `BRENAI_BRAIN_TOKEN`, `USER_NAME`, `MODEL`/`EFFORT` (Claude backup), `COMPACT_AT`, `LEARN_EVERY`, `APP_PASSWORD` (empty = no login; do not leave it empty on Fly, it spends your API credit).

## Local run
`npm install && ANTHROPIC_API_KEY=... node server.mjs` then http://localhost:8080

## Coming and going
`away.mjs` holds the rules. When her reply says she is leaving right now (a goodbye, "gotta run", walking out in an action; not a future plan), the server marks her out for a real stretch of time that depends on where she said she was going (bathroom a few minutes, class about an hour and a half, bed until morning). While she is out: the avatar walks to the door and the chair is empty, an "Out" note shows with a "Call her back" button, and anything typed waits for her. When her time is up the page asks the server to bring her back, and she says something as she walks in. About 38% of the time a respectable excuse (class, study group, work) was a cover story: she sneaks in and for the next hour it shows (tipsy, high, groggy, hyper or upset) in her face, body and the way she talks, while her prompt tells her to deny it badly. Honest outings can show too. `AWAY_SPEED` and `AWAY_TEST_LIE` are test switches.

Plans: `detectPlan` reads times she mentions ("class starts at seven", "back around 9 or 10"). The server keeps the plan, shows it beside her, has her say goodbye and go about ten minutes before the start, and uses the stated return time. She is not punctual: returns drift a few minutes early to half an hour late, later when the outing is a cover. What she is really doing is decided when she leaves (`away.out`).

Video call: while she is out the note has a phone button. It opens a phone on screen (`#call`), rings, and she may or may not pick up (rarely from a real class; she texts back instead). On a call nothing is written: speech recognition sends what you say to `/api/call/say`, her reply is spoken. The avatar is drawn in call mode (`call()` in `avatar-vrm.js`): her room is hidden and a canvas-painted backdrop of where she really is goes behind her (classroom, library, cafe, gamestore, bar, rooftop, bedroom, car, street), with the after-effect state on her face and body. Her prompt gets `callNote`: where she is, and if her story was a cover, to keep the camera tight and deny it. A goodbye from her ends the call; either way the phone shows "Call ended" and returns to the main screen. Saying she is on her way brings her return forward to a few minutes. Call turns are kept in history but hidden from the chat; only a "Video call" line shows.

Replies are decided on the server first (trimmed, de-duplicated, speech tags like "she says softly," dropped) and then typed out by the page, so nothing rearranges after it appears.

## Look
Fonts are hosted in `public/fonts` (SIL Open Font License): Fredoka for the interface, Patrick Hand for what is said, Bangers for actions and labels. When she is out a wooden sign on a rope hangs over her window with the time she said she would be back and the phone button to call her. Pages left open reload themselves when a new version is deployed (`build` in `/api/brain`). Her PC voice is requested ahead of time (first sentence while the model is still writing, the rest when the reply is final) and the typing waits briefly so words and voice start together. The "twilight" theme (end of the `<style>` block in `public/index.html`) sits on top of the base layout: gradient sky, white speech bubbles, glassy panels, and a settings wheel of coloured icon bubbles (`ICON` in the script).

## Her avatar
`public/avatar.js` draws her as an animated SVG puppet: blinking, breathing, eyes that follow your finger, a mouth that moves while her reply streams, a face per mood, passing expressions picked from her words and actions, and touch reactions (tap face = poke, tap nose = boop, tap head = pat, stroke hair = pet, fast swipe = swat, tap hoodie, four quick taps = annoyed). Actions you do in the chat (typed or buttons) land on her too. Touches are silent: they never show in the chat, but `/api/touch` queues them and they ride in front of your next message as an action only she sees, so she can react or let them build up. The puppet also keeps its own reserve (pokes and swats make her grumpy for a few minutes, pats and pets make her happy). `public/avatar-vrm.js` draws a 3D VRM model instead (three.js and three-vrm, vendored in `public/vendor/`), driven by the same controller, so moods, talking and touch all carry over. The model is posed leaning back in an armchair with her feet on a low table (pose and furniture are built in code in `avatar-vrm.js`, sized to the model). In the enlarged view the mouse wheel or a pinch zooms from her face out to her whole body. Getting up is two stages (feet off the table and down, sit upright, then rise in front of the chair and step out past the armrest); the walk has hip sway, foot roll and bent arms. Tap to direct (enlarged view): a tap that misses her is ray-cast against tagged room objects (`pick` / `direct` in `avatar-vrm.js`): bookshelf, counter, chair, book, phone, mug, lamp, or a spot on the floor she walks to. These go to her silently like touches. Her mouth follows the loudness of the Kokoro clip (read from the WAV in `index.html`). Room lighting follows the viewer's clock, with a lamp that comes on at night. Her room has a bookshelf and a counter with a kettle, and she runs errands on a step-by-step plan (`ERRAND` in `avatar-vrm.js`): fetch a book from the shelf and come back to read it or set it on the table, put it back, or get a drink and come back to sip it. Actions in her replies such as *goes to the bookshelf and grabs a book* or *gets herself a fresh coffee* start them. She has a routine: left alone she reads her book, checks her phone, sips from her mug, or gets up, walks a lap behind the chair and sits back down (props are simple shapes that rest on the furniture and go to her hands). Talking to her makes her look up, lower the book, or stop and turn to you. The chat tells her what you saw her doing, and actions in her replies (*gets up*, *picks up her book*, *sits back down*) start those activities. She moves: about 25 gestures (wave, nod, shrug, stretch, yawn, laugh, sigh, dance, look away, slump, wiggle feet...) play when the matching action appears in her reply, her mood shows in her posture as well as her face, touches move her body, and she fidgets on her own when idle. Wheel > Avatar uploads or replaces the `.vrm` (stored as `/data/avatar.vrm`, served only behind the login, never in this repo) and switches between it and the cartoon, live. The page only uses `mount`, `setMood`, `setThinking`, `talk`, `feel`, `react` (documented at the top of the file), so the VTuber avatar replaces it by offering the same calls.

## Getting together (the life-sim part)
- At 90 relationship points (her sheet's rapport; `VISIT_AT` in server.mjs) the house button on her picture opens up: **Invite her over** (your house) or **Go to her dorm**. She makes up her mind first (usually yes; no if she is upset or groggy) and answers in her own words. She can also bring it up herself; then a card asks if you want to go.
- Once together the stage fills the screen and you see through your own eyes: drag to look, tap the floor (or WASD and arrow keys on a PC) to walk, tap the couch or her bed to sit, tap the TV to switch it on. Her bookshelf, kettle, book, phone and mug still work by tapping. Chat as usual; **Chat log** shows the log, **Head home** ends the visit. If she leaves for somewhere, the visit ends.
- The rooms are in `public/places.js` (cel-shaded: toon materials, outlines, painted world outside the windows that follows the time of day). Her dorm is built around the furniture she already used; your house reuses the same anchor points so her routine works in both.
- Server: `db.place` ('' / 'dorm' / 'house'), `POST /api/visit`, `visit` on `/api/chat`, a place note in her prompt. Test switches: `VISIT_TEST=1` (skip the points gate), `VISIT_TEST_ANSWER=yes|no`.
- Needs her 3D model; with the cartoon avatar the button just says so.


## What you two become (romance, friends, mentor)
- Nobody picks it from a menu. Each lean adds points to `sheet.bond`: the learning step reads which way you leaned in recent talk (worth double while you are together in person), and the three round buttons down the left edge during a visit offer three "moments" each (flirt, hang out, guide), worth 2 points.
- Once one is clearly ahead (5+ points and 2 clear of the next) it becomes `sheet.path` and a line in her prompt (`BOND_LINE` in persona.mjs) sets how she relates to you. Her Character menu shows the three scores and can pin a path by hand.
- Her Character menu is a card (picture, birthday, heart meter with the cussing and visit marks) with everything else folded away.
- Test hooks in the 3D view: `WIZRA_CAM` (fixed camera), `WIZRA_YOU` (where you stand), `WIZRA_LEGS`, `WIZRA_TABLE`.

## Recorded motion (Mixamo clips)
- `GET/POST /api/anims` serves and stores `anims.json` on the volume: clips already converted for her skeleton (rotations for the VRM humanoid bones at 30 fps). The source FBX files and the converted clips stay out of the repo (licensed animation data).
- `avatar-vrm.js` lays them over the posed skeleton with `playClip`: `walking` (her walk), `idle` (standing), `talking` (hands moving when she talks on her feet and on calls), `texting_and_walking` (pacing), `female_laying_pose` (lying on her dorm bed: tap is not needed, she does it on her own or when her reply says so), `kiss` and `jump` (gestures, on her feet). With no clips stored, the hand-made motion is used.
- To add clips: convert Mixamo "FBX Binary, without skin" files to that JSON shape and POST `{ clips: { name: clip } }` (the whole set each time). `window.WIZRA_CLIP = 'name'` previews one.
- Second pass: `female_sitting_pose`, `_1`, `_2` are whole-body ways of sitting in her chair or on the couch (`SEATED` in avatar-vrm.js: curl, hair, knee), and `female_laying_pose_1` is a second way of lying on the bed.

## Sound
- `public/sound.js` makes all of it in the browser with Web Audio: no audio files. Music is written bar by bar from chord charts (`TRACKS`, `STYLE`): four lo-fi tracks for the chat room, three quiet jazz tracks at your house, three game tracks at her dorm (8-bit, tavern, dungeon), plus a romance theme and a mentor theme that take over for a while after a moment of that kind and join the rotation once that is what you two are.
- Around you: cars passing at your house; birds, far traffic and now and then her roommate through the wall at her dorm.
- Effects: typing (yours and hers), a sound per emoji that pops over her, footsteps, sitting, TV, lamp, door, pouring, phone dial, ringing, connect and hang up. The 3D view asks for them with a `wizra-sound` window event.
- Volume for music and effects is under her settings, Voice. Music drops while she is speaking and stops on a call. Sound starts after the first tap or key press (browser rule).

## She calls you
- While she is out she may video call you: decided when she leaves (`leaveNow`), about 2% at no rapport up to 18% at 100 (a bit more on the romance path), never when she is somewhere she is hiding, and only on outings of 20 minutes or more. At most one per outing.
- The phone on her "out" sign shakes with action lines and rings for about 50 seconds (`ringNow`, `ringing` in `/api/away`). Tap it to pick up; otherwise it is logged as a missed call and she knows when she is back.
- Test switch: `CALL_TEST_RING=1` makes her call a few seconds after leaving.
