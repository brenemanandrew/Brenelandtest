# Instructions for a coding agent working on Brenai

Before changing anything, read these two files in this folder, in full:
1. `CODING.md`: the rules, how the code works, recipes for common changes, how to test, and the traps.
2. `HANDOFF.md`: what the game is, who the owner is, and how to work with him.

The rules that matter most, repeated here so they are never missed:
- Run `tools/check.sh` before every commit and only commit if it passes. Chain with `&&`, never `;`.
- Never append a `//` comment to a line that has more code after it. Use `/* ... */` or a line of its own.
- Never use em dashes, anywhere.
- Make small, exact edits. The files have very long lines: search for the exact text you need and change only that. Never rewrite or reformat a whole file.
- Never put passwords, PINs or tokens in a file or a message.
- Her model, outfit models, motion clips and picture pack never go into git.
- Do not read the owner's chat text or her notes about him.
- One change at a time. After each, say what you changed, what you tested, and what you could not test.
- Pushing to `main` deploys the live game within a minute and restarts its server. Do not push unless the owner has asked you to.

## Brenebase updates (required)
After any change to this project, write `.brenebase/updates/<YYYY-MM-DD>-<short-name>.md` and commit it with the work, on the same branch. Brenebase (brenebase.fly.dev) reads these routinely to keep its project notes current.
- Front matter: `project:` (breneland, brenai, work, brenerig, brenebase or valinfor), `by:`, `date:`, `branch:`, `title:`.
- Then bullets under `## Done`, `## Tested`, `## Not tested`, `## Broken`, `## Open`, `## Settings changed`.
- Never put passwords, PINs, tokens or their values in it. Name a secret, never its value.
- No repo to commit to (a claude.ai chat, or Breneland-Next on the PC)? Save the same file in the Google Drive folder `Brenebase/updates` instead.
- Template: `hub/UPDATE-TEMPLATE.md` in brenemanandrew/Brenelandtest.
