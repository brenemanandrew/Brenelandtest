# Wizra's brain: your PC

Wizra runs on the same model as the Breneland townsfolk: **MN-Violet-Lotus-12B in Bionic** (formerly LM Studio) on your PC
(RTX 5060 Ti 16 GB). brenai.fly.dev can't reach your PC, so this bridge connects out to it, picks up her replies to write,
asks Bionic, and streams the words back. It works exactly like `tools/npc-brain-bridge.mjs` for the town, and both bridges can
run at the same time on the one loaded model. When this bridge is off, the page shows "offline" under her picture (or
"Claude" if you also gave Brenai an Anthropic key as a backup).

## Once
1. Pick a long random secret (password manager). Put it in two places:
   - GitHub repo secret `BRENAI_BRAIN_TOKEN` (Settings > Secrets and variables > Actions), then rerun "Brenai Deploy" in Actions.
     (Or from the PC: `fly secrets set -a brenai BRENAI_BRAIN_TOKEN=<secret>`.)
   - On the PC, PowerShell: `setx BRENAI_BRAIN_TOKEN "<secret>"`, then open a new PowerShell.
2. Get the files (Node 22+ needed, you have it for the town bridge). This downloads them from the site into `C:\Users\<you>\Brenai`:
   ```
   $d = "$env:USERPROFILE\Brenai"; New-Item -ItemType Directory -Force $d | Out-Null; cd $d; foreach ($f in 'wizra-bridge.mjs','start-wizra.ps1') { Invoke-WebRequest "https://brenai.fly.dev/bridge/$f" -OutFile $f }; dir
   ```

## Each time
```
cd "$env:USERPROFILE\Brenai"; powershell -ExecutionPolicy Bypass -File .\start-wizra.ps1
```
It loads the model with a **32k context** (her long memory; the town only needs 8k, and 32k fits on your card: about 7 GB model
plus about 5 GB of context), starts Bionic's server on port 1234 and runs the bridge. The status line should say
`Wizra brain: connected`. Leave the window open while you chat. If the town bridge is already running, start it again in its own
window after this (the model reloads once).

Already have the model loaded and the server running? Just: `node wizra-bridge.mjs`

## Settings
- Temperature: the slider on her wheel is a real temperature now (0.3 to 1.2, middle 0.75). `setx WIZRA_TEMP 0.7` forces one.
- `WIZRA_MIN_P` (0.05) and `WIZRA_REPEAT_PENALTY` (1.08) as for the town. Your `LM_TEMP` setting is ignored here on purpose so the slider works.
- Bigger memory: `setx WIZRA_CONTEXT 49152` before starting, and set the Fly env `CONTEXT_TOKENS` to the same number. Past what
  fits, the oldest messages drop out of what she sees; her notes about you, rapport and secrets carry on regardless.

## Checks
- https://brenai.fly.dev/api/brain says `"online": true` when the bridge is connected.
- "token was refused": the PC and Fly secrets don't match. "Bionic did not answer": load the model / start its server.
- Privacy: the bridge never prints or saves what you say. The chat log lives only on the Brenai Fly volume.
