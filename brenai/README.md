# Brenai (brenai.fly.dev)

Chat with Wizra. Her brain is **your PC's model** (MN-Violet-Lotus-12B in Bionic, the same setup as the Breneland townsfolk), reached through a bridge you run on the PC: see `bridge/README.md`. Claude (`claude-opus-5-5`) is only a backup when the PC is offline and an `ANTHROPIC_API_KEY` is set. One Node file (`server.mjs`), one page (`public/index.html`), her character in `persona.mjs`.

## What it does
- Layout (Andrew's sketch, 2026-11-17): her avatar top left (tap to expand; the VTuber mounts in `#stage`, which carries `data-talking` and `data-mood`), a brain button on its corner for the settings wheel, her word balloon beside it; the chat area; action buttons; your word balloon and icon bottom right; the chat bar with the mic.
- Chat area: name in colour (you blue, Wizra red), speech in plain text, each action on its own indented purple line in third person ("he grabs the cookies"). Type actions in `*asterisks*`. Balloons show speech only and scroll when long.
- Action buttons (Wave, Poke, High five...) send an action she reacts to. The list is `ACTS` in `public/index.html`.
- Replies are short by default (Reactions > Reply length: short, medium, long). To stop rambling and repeats on the PC model: a length cap, a reminder on each turn, repeat penalties, and the server drops any sentence or action she already used in her last 8 replies.
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

## Her picture
`public/wizra.svg` is a placeholder. Drop in `public/wizra.png` and change the two `wizra.svg` references in `index.html`.
