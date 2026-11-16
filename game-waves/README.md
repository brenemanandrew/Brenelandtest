# Game waves: handoff to the PC project (Breneland-Next)

Five new table games, built and tested here against the live client mirror and a copy of the real server base.
NOT shipped. Do not deploy until Andrew says so.

| Game | Wave | id | Seats |
|---|---|---|---|
| Word Weave (word game, 15x15 board) | 11 | `word-weave` | 2-4 |
| The Missing Pie (who-took-it mystery) | 12 | `missing-pie` | 3-6 |
| Town Tycoon (buy streets, build, collect rent) | 12 | `town-tycoon` | 2-4 |
| Hearthfield (gather, build lanes, cottages and halls, trade) | 13 | `hearthfield` | 3-4 |
| Pillow Forts (claim the house with pillow crews) | 13 | `pillow-forts` | 2-6 |

## Copy into Breneland-Next

1. Server engines: `server/lib/table-games/*.js` -> `lib/table-games/` (each game's engine and `-bot.js`, plus
   `word-weave-core.js`, `word-weave-words.js` and `hearthfield-board.js`).
2. Server patch: apply `server/patches/table-games-index-check.patch` to `lib/table-games/index.js`. It lets a game with
   `check()` (Word Weave) accept moves that cannot be listed, for people and bots. Mexican Train is unaffected.
3. Client: `client/js/table-games/*` -> `public/js/table-games/` (replaces `index.js` and `tg-look.js`; adds `tg-games.js`,
   `generic-3d.js`, `tg-kit3d.js`, the five `*-ui.js` and the five `*-3d.js` world-table pieces: `word-weave`, `missing-pie`,
   `town-tycoon`, `hearthfield`, `pillow-forts`). Mexican Train's path in `index.js` is unchanged.
4. `games.json` `tableGames`: add `{ "id": "word-weave", "name": "Word Weave" }`, `{ "id": "missing-pie", "name": "The Missing Pie" }`,
   `{ "id": "town-tycoon", "name": "Town Tycoon" }`, `{ "id": "hearthfield", "name": "Hearthfield" }`,
   `{ "id": "pillow-forts", "name": "Pillow Forts" }` (plus `copies` / `blurb` as wanted).
5. Credits: `data/CREDITS.md` (ENABLE word list, public domain; LDNOOBW blocklist, CC BY 4.0) into the game's credits.
   The word list itself is already built into `word-weave-words.js`; `data/` is only its source.
6. Optional: call Word Weave's word lookup once at server boot so the first move does not pay the ~120 ms build.

## Checks (run here)

- `node tools/<id>-test.mjs` per game: 300+ bot games, no leaks, replay, bot strength. All pass.
- `node tools/server-sim.mjs GAME [players] [games] [path/to/index.js]`: whole games through the real server base (patched).
  Word Weave, Missing Pie and Town Tycoon all finish; Word Weave moves pass through `check()` with no refusals.
  Hearthfield (3 players) and Pillow Forts (4 players), 2 games each, finish with no failures.
- `node tools/tg-achievements-test.mjs`: the table-games achievements (see below). All pass.
- `node tools/harness/run.mjs GAME OUTDIR [players] [advance]`: screenshots at phone upright, phone sideways and PC.

## Achievements

1. Server: `server/lib/tg-achievements.js` -> `lib/tg-achievements.js` (replaces it; every existing achievement and how it is
   earned is unchanged, `tg-first-win` is now titled "Table Winner" instead of "Lowest Score Wins", same id).
2. Client: `client/js/achievements.js` -> `public/js/achievements.js` (the live file plus medallion pictures for the new icons).
3. The engines' beats carry two new public fields used here: Word Weave `place.tripleWord`, The Missing Pie `accuse.round`.
   Hearthfield and Pillow Forts needed none (their achievements read beats they already send).

New ones (people only, never bots; once each; games with bots count):

| id | Title | Earned by |
|---|---|---|
| `ww-full-weave` | Full Weave | all 7 tiles in one Word Weave turn |
| `ww-big-word` | Word Wizard | one word worth 50+ |
| `ww-triple` | Triple Treat | a new tile on a Triple Word square |
| `ww-last-tile` | Empty Rack | going out with your last tile to end the game |
| `mp-solved` | Pie Detective | a right accusation in The Missing Pie |
| `mp-quick` | Quick Crumbs | solved by round 6 |
| `mp-stumper` | Stumped the Table | an ask nobody could answer |
| `tt-pair` | Matching Set | both streets of a colour pair in Town Tycoon |
| `tt-shop` | Open for Business | a shop built on a street |
| `tt-big-rent` | Rent Day | a rent of B500+ paid to you |
| `tt-last` | Last One Standing | won a full game as the last player left |
| `hf-hall` | Grand Hall | a cottage grown into a hall in Hearthfield |
| `hf-parade` | Lead the Parade | winning the Grand Parade badge (longest lane) |
| `hf-keeper` | Critter Keeper | winning the Critter Keeper badge (3+ Raccoon Wranglers played) |
| `hf-harvest` | Bumper Harvest | 5 or more cards to you from one roll |
| `pf-region` | The Whole Floor | taking the last area of a region in Pillow Forts |
| `pf-flop` | Flopped Out | taking another crew's very last area |
| `pf-underdog` | Little Pillow, Big Win | winning a fight with 1 pillow thrown (area of 2) against 3+ defenders |
| `pf-last` | Last Fort Standing | won a full game as the last crew left |

Town Tycoon's colour pairs are listed in `tg-achievements.js` (`TT_PAIRS`); if the board changes, update it (the test checks it
against `GROUP_SPACES`). Check: `node tools/tg-achievements-test.mjs`: real bot games of all five (some seats marked as people,
each game's grants compared with an independent reading of its states), a few Pillow Forts games started from a set-up position
for its rare moments (`pf-underdog`, `pf-last`, and no `pf-last` in a quick game), plus stub Mexican Train beats. All pass.

## Not done



