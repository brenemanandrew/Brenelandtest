# Instructions for a coding agent

This repository holds two things:
- `brenai/`: the companion game at brenai.fly.dev. If your task is about Brenai or Wizra, work in that folder and read `brenai/AGENTS.md` first.
- Everything else (`site/`, `pipeline/`): the Breneland character builder. See `CLAUDE.md`.

Never use em dashes. Never put passwords, PINs or tokens in a file or a message.

## Brenebase updates (required)
After any change to this project, write `.brenebase/updates/<YYYY-MM-DD>-<short-name>.md` and commit it with the work, on the same branch. Brenebase (brenebase.fly.dev) reads these routinely to keep its project notes current.
- Front matter: `project:` (breneland, brenai, work, brenerig, brenebase or valinfor), `by:`, `date:`, `branch:`, `title:`.
- Then bullets under `## Done`, `## Tested`, `## Not tested`, `## Broken`, `## Open`, `## Settings changed`.
- Never put passwords, PINs, tokens or their values in it. Name a secret, never its value.
- No repo to commit to (a claude.ai chat, or Breneland-Next on the PC)? Save the same file in the Google Drive folder `Brenebase/updates` instead.
- Template: `hub/UPDATE-TEMPLATE.md` in brenemanandrew/Brenelandtest.
