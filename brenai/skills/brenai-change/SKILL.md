---
name: brenai-change
description: Make a code change to Brenai (the Wizra companion game in brenai/ of brenemanandrew/Brenelandtest) safely, from edit to live. Use for any feature, fix or tweak to server.mjs, persona.mjs, the page scripts or the Studio.
---
# Changing Brenai code

## Before editing
1. Read `brenai/MASTERFILE.md` sections 2 to 5 once per session. `README.md` has one section per feature: search it for the feature, then read the code it names.
2. Find the exact place with a search. Files are dense (long lines, many statements per line). Never reformat; make small exact replacements and assert each one matched exactly once.
3. Check whether the change is data, not code: personality, rules, reactions, outfits, events, rooms and layout are edited in the Studio (`/dev.html`) or the robot panel.

## Rules that have each caused a real bug
- Never put a `//` comment after code on a line that continues. Use `/* */`.
- A new server file goes on the `COPY` line in `brenai/Dockerfile` and in `tools/check.sh`.
- No em dashes anywhere. Check: `grep -c "$(printf '\342\200\224')" <files>` must print 0.
- Licensed or large assets (models, clips, pictures) never go in git. They live on the Fly volume `/data`.
- Never write a PIN, password or token into a file.
- Most routes return `placeView()`; a new flag for the page goes there, and the page must copy it into `visitInfo` inside `setPlace`.
- Owner-only routes check `isOwner()`.
- Anything the model must obey goes near the END of `systemBlocks()`; a 12B model weighs the end most. Something it must obey right now goes beside the user's message in `replyLocal()`.
- A route must never wait on the model before answering the page with something the page is animating (the D&D die did, and spun forever). Answer at once, fetch the wording after, with a time limit and a plain fallback.

## Ship
```
./brenai/tools/check.sh >/dev/null && git add -A && git commit -m "..." && git push origin HEAD:<work branch> && git push origin HEAD:main
```
Chain with `&&`, never `;`. Pushing to `main` deploys to Fly in about a minute and restarts the server, so do not deploy while a long job is using the live site. If the push is rejected, fetch and merge `origin/main`, run the check again, push again.

## Prove it
Poll the live site until the served file contains a string unique to the change, then exercise it (see the `brenai-headless-test` skill). Add a short section to `README.md` for every new feature. Report with the `brenai-report` skill.
