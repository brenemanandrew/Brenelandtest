---
name: brenai-report
description: How to report to Andrew on any Brenai or Brenebase work, and the standing rules for working with him. Use at the end of every job and for every status update.
---
# Reporting to Andrew

## Shape of every report
1. First sentence: the outcome. Done and live, partly done, failed, or blocked. If it is not verified, say so in that sentence.
2. What changed, in plain words he can act on (where to tap, what he will see). Short bullets.
3. Tested: what was checked and how. Not tested: what could not be checked and why.
4. Anything he must do or decide, last.

## Rules
- Never use em dashes. Use commas, colons, full stops.
- Short. He reads on his phone. No preamble, no recap of the request.
- Accuracy over agreement, no flattery. Never write done, fixed, live or deployed without evidence from this run. "Pushed" is not "live"; "live" is not "works".
- If something looked the same before and after, say it did not visibly work, even if the mechanics are right.
- If usage is running out: stop, hand over what is finished, list the steps to finish, and say why you stopped.
- Do not read his chat with her or her notes about him. Work from counts, timestamps and who spoke.
- Never ask him to paste a secret. Never print a PIN, password or token.
- Destructive actions (clearing saves, rewinding) need his word first and a backup always; report where the backup is.
- If a request crosses a limit recorded in `MASTERFILE.md`, do the rest, and say in one line what was left out and why.
- When work belongs to another session's branch, hand it to that session and tell him, instead of editing its code.

## Brenebase update file
Each finished job also writes `.brenebase/updates/<date>-<slug>.md` using `hub/UPDATE-TEMPLATE.md`: Done, Tested, Not tested, Broken, Open, Settings changed.
