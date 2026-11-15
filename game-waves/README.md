# Game waves: handoff to the PC project (Breneland-Next)

Three new table games, built and tested here against the live client mirror and a copy of the real server base.
NOT shipped. Do not deploy until Andrew says so.

| Game | Wave | id | Seats |
|---|---|---|---|
| Word Weave (word game, 15x15 board) | 11 | `word-weave` | 2-4 |
| The Missing Pie (who-took-it mystery) | 12 | `missing-pie` | 3-6 |
| Town Tycoon (buy streets, build, collect rent) | 12 | `town-tycoon` | 2-4 |

## Copy into Breneland-Next

1. Server engines: `server/lib/table-games/*.js` -> `lib/table-games/`.
2. Server patch: apply `server/patches/table-games-index-check.patch` to `lib/table-games/index.js`. It lets a game with
   `check()` (Word Weave) accept moves that cannot be listed, for people and bots. Mexican Train is unaffected.
3. Client: `client/js/table-games/*` -> `public/js/table-games/` (replaces `index.js` and `tg-look.js`; adds `tg-games.js`,
   `generic-3d.js` and the three `*-ui.js`). Mexican Train's path in `index.js` is unchanged.
4. `games.json` `tableGames`: add `{ "id": "word-weave", "name": "Word Weave" }`, `{ "id": "missing-pie", "name": "The Missing Pie" }`,
   `{ "id": "town-tycoon", "name": "Town Tycoon" }` (plus `copies` / `blurb` as wanted).
5. Credits: `data/CREDITS.md` (ENABLE word list, public domain; LDNOOBW blocklist, CC BY 4.0) into the game's credits.
   The word list itself is already built into `word-weave-words.js`; `data/` is only its source.
6. Optional: call Word Weave's word lookup once at server boot so the first move does not pay the ~120 ms build.

## Checks (run here)

- `node tools/<id>-test.mjs` per game: 300+ bot games, no leaks, replay, bot strength. All pass.
- `node tools/server-sim.mjs GAME [players] [games] [path/to/index.js]`: whole games through the real server base (patched).
  Word Weave, Missing Pie and Town Tycoon all finish; Word Weave moves pass through `check()` with no refusals.
- `node tools/harness/run.mjs GAME OUTDIR [players] [advance]`: screenshots at phone upright, phone sideways and PC.

## Not done

- Server-side achievements for the new games.
- Real 3D pieces: on the world table they show a generic board slab and pawns (`generic-3d.js`).
- Town Tycoon: no auctions or trades.
- Word Weave: no rack drag-to-reorder (Shuffle works); blank-tile play not checked end to end in the UI.
