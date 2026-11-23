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

Also in this folder:
- `MASTERFILE.md`: everything in one file (rules, architecture, data, every route, features, current state, open work). Section 10 is the current state. Keep it current when you ship something.
- `skills/*/SKILL.md`: seven skills: making a change, headless testing, writing her character, her 3D body, reporting to the owner, assets, and building a server-run activity. Read the one that fits the job before starting.

Standing rule from the owner (2026-11-23): whenever a skill or `MASTERFILE.md` is changed, (1) push it to `main`, (2) tell the Brenebase session ("Multi-agent work distribution system") exactly which files changed, and (3) check that Brenebase has the new version loaded before calling it done. If you cannot confirm step 3, say so plainly in your report.
