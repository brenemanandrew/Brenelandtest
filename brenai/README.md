# Brenai (brenai.fly.dev)

Chat with Wizra, a persona running on Claude (`claude-opus-5-5`, effort `low`). One Node file (`server.mjs`), one page (`public/index.html`), her character in `persona.mjs`.

## What it does
- Her picture top left with the chat window; you at the bottom. Everything goes in the log; spoken text (anything outside `*asterisks*`) also pops up as a bubble over the speaker's head.
- Tap her picture for the settings wheel: Emotion, Reactions, Temperature, SFW, Bleep, Character (birthday, backstory, likes, dislikes, rapport, cussing), Hidden likes.
- She learns you: every 6 of your messages a side call rewrites her private notes on how you talk, moves rapport up or down, marks secret likes she admitted, can grow a new secret like from a good moment, and can raise her cussing one step (only if allowed, rapport 60+, and you cuss yourself).
- Bleep only changes what is shown; the real text is kept, so turning it off shows the original.
- Temperature is done through her instructions. Current Claude models reject a raw sampling temperature.
- Context: the whole conversation is sent each time (prompt-cached); past 600k tokens the oldest part is summarized server-side (`COMPACT_AT`).
- Refusal fallback is on (`fallbacks: "default"`): if the model declines, the API retries on another model in the same call.
- Data lives in `/data/brenai.json` on a 1 GB Fly volume. The circle button top right starts a new conversation and keeps what she learned.

## First deploy (Andrew, from the PC with flyctl)
```
cd brenai
fly apps create brenai
fly volumes create brenai_data -a brenai -r iad -s 1 --yes
fly secrets set -a brenai ANTHROPIC_API_KEY=sk-ant-... APP_PASSWORD=pick-one
fly deploy --ha=false
```
After that, pushes to `main` that touch `brenai/` deploy through `.github/workflows/brenai-deploy.yml` if the repo has the `FLY_API_TOKEN` secret (`fly tokens create deploy -a brenai`).

## Settings (fly.toml [env] or secrets)
`MODEL`, `EFFORT` (low/medium/high), `USER_NAME`, `COMPACT_AT`, `LEARN_EVERY`, `APP_PASSWORD` (empty = no login; do not leave it empty on Fly, it spends your API credit).

## Local run
`npm install && ANTHROPIC_API_KEY=... node server.mjs` then http://localhost:8080

## Her picture
`public/wizra.svg` is a placeholder. Drop in `public/wizra.png` and change the two `wizra.svg` references in `index.html`.
