# Brenai (brenai.fly.dev)

Chat with Wizra. Her brain is **your PC's model** (MN-Violet-Lotus-12B in Bionic, the same setup as the Breneland townsfolk), reached through a bridge you run on the PC: see `bridge/README.md`. Claude (`claude-opus-5-5`) is only a backup when the PC is offline and an `ANTHROPIC_API_KEY` is set. One Node file (`server.mjs`), one page (`public/index.html`), her character in `persona.mjs`.

## What it does
- Her picture top left with the chat window; you at the bottom. Everything goes in the log; spoken text (anything outside `*asterisks*`) also pops up as a bubble over the speaker's head.
- Tap her picture for the settings wheel: Emotion, Reactions, Temperature, SFW, Bleep, Character (birthday, backstory, likes, dislikes, rapport, cussing), Hidden likes.
- She learns you: every 6 of your messages a side call rewrites her private notes on how you talk, moves rapport up or down, marks secret likes she admitted, can grow a new secret like from a good moment, and can raise her cussing one step (only if allowed, rapport 60+, and you cuss yourself).
- Bleep only changes what is shown; the real text is kept, so turning it off shows the original.
- Temperature is a real sampling temperature on the PC model (0.3 to 1.2). On the Claude backup it only steers her instructions.
- Context: on the PC model, as much recent chat as fits the loaded context (`CONTEXT_TOKENS`, 32k); older messages drop out but her notes, rapport and secrets carry on. On the Claude backup, everything up to 600k tokens.
- Data lives in `/data/brenai.json` on a 1 GB Fly volume. The circle button top right starts a new conversation and keeps what she learned.

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
