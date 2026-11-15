# Game waves: the shared spec for new table games (Wave 11 word game, Wave 12 mystery + property)

Branch `claude/game-waves`. Everything new lives under `game-waves/`. `breneland-live/` is a read-only mirror of the live client:
never edit it. The real project (Breneland-Next, with the server) is on Andrew's PC and NOT here; we hand these files over.

Rules from Andrew: never use em dashes (use hyphens) in code, comments or docs. Comments short and plain. Games must be
ORIGINAL: own names, boards, art, wording (no trademarked names: no Scrabble, Clue/Cluedo, Monopoly, no copied board layouts,
no copied card texts). Kid-friendly (Breneland is warm, funny, all ages). Reference for the reference implementation:
`/tmp/claude-0/-home-user-Brenelandtest/9f90e9d8-583b-5a76-89c2-8cd85bf4cb82/scratchpad/ref/lib/table-games/`
(`index.js` = the real server base, `mexican-train.js` + `mexican-train-bot.js` = the reference engine). READ THEM FIRST.

## 1. Engine (server, pure ES module, one file + its bot)

`game-waves/server/lib/table-games/<id>.js` and `<id>-bot.js`. No imports except its own siblings (relative). Runs in Node 20
(loaded as a data: URL by the server, so no fs, no require, no top-level await, no node builtins) and in the browser.
Default export:

```js
{ id, name, seats: [min, max], settings, newGame, legalMoves, apply, view, score, bot, check? }
```

- `settings`: `[{ key, kind: 'choice' | 'toggle', label, default, options?: [{ value, label, maxSeats? }] }]`.
- `newGame({ players, settings, seed })` -> plain JSON state (players is an array of `{ name, bot, kind }`; use its length).
  Seeded (copy mulberry32 + seed32 from mexican-train.js; rng state kept IN the state so a save replays).
- `legalMoves(state, seat)` -> `[move]`, each `{ type, ... }` plain JSON. The server checks a sent move by
  `JSON.stringify(m) === JSON.stringify(sent)` against this list, so keys must be built in a fixed order.
  Out-of-turn moves are allowed if the game needs them (e.g. showing a card). Return `[]` when the seat has nothing to do.
- `check(state, seat, move)` (OPTIONAL, only for games whose moves cannot be listed, i.e. the word game): returns `null` if the
  move is legal or a short player-facing reason string. When present the server uses it instead of list membership (we hand
  over a small patch to index.js for this). Such a game still lists the simple moves (pass, exchange...) in legalMoves and a
  template `{ type: 'place' }` entry may be listed so the client knows placing is open.
- `apply(state, seat, move)` -> `{ state, beats }`, pure (clone what changes). Throw `err.illegal = true` on an illegal move.
- `view(state, seat|null)` -> what that seat may see; seat null = spectator / passer-by. MUST hide secrets (other hands,
  the bag/deck order, the mystery solution). Include `phase` ('play' | 'roundEnd' | 'over'), `turn` (engine seat whose turn
  it is, -1 if none), `n`, `seat` and `moves` (legalMoves for that seat, [] for null).
- `score(state)` -> `{ totals, order, winners, done }` (done true when the game is over). Lowest-wins or highest-wins is
  the game's choice but `winners` must be explicit.
- `bot(view, level, rng)` -> one of `view.moves` (or a legal move for check() games), or null. Levels `easy | normal | hard`.
  A bot sees ONLY its view. Deterministic for the same view when rng is not used (see viewRng in the MT bot).
- Beats `{ kind, dwell, ...data }` hold nothing secret (they are broadcast to everyone). Use `turn`, `place`, `draw`, `roundEnd`,
  `gameOver` (with `winners`, `totals`) where they fit, plus the game's own kinds. Private info (e.g. which card was shown)
  goes only into the receiving seat's `view` (e.g. `view.lastShown`).
- Phase 'roundEnd' needs a `{ type: 'next' }` legal move (the server's runner sends it); avoid roundEnd unless needed.
- The server's turn timer, when time is up, plays the first of: draw/pass, play, end, else moves[0]. Give every game a
  sensible `pass`-like or `end` move when a turn can be ended, and make moves[0] safe.
- The server's runner auto-sends a person's only move if it is a single `draw` or `pass` after ~2 s: name moves accordingly
  (e.g. a forced dice roll can be `roll`, not auto-sent; that is fine, the timer covers it).

## 2. Engine tests (Node, no deps)

`game-waves/tools/<id>-test.mjs`: imports the engine, plays at least 300 full bot games (mixed levels, every seat count, both
settings), asserting: every applied move came from legalMoves (or passes check), view(null) and view(other seat) leak no
secret, beats contain no secret, games always finish within a move cap, score().done at the end, the same seed + moves
replays to the same state, hard beats easy over many games (report the win rates). Print a short summary. Also a few
hand-made rule checks. Run with `node game-waves/tools/<id>-test.mjs`.

## 3. Client UI module (browser, one file per game)

`game-waves/client/js/table-games/<id>-ui.js`, an ES module next to the mirror's `mt-ui.js` (so `import { el } from '../util.js'`
works). The shared client `index.js` (being refactored on this branch) keeps Mexican Train's path as it is and, for any other
game, calls the module's default export:

```js
export default {
  id: '<id>',
  lid: 'words for 2 to 4',           // the box lid's second line in the store cabinet
  tip: 'Drag letters onto the board, then Play.', // first-time tip, one line
  // draw the board region and the hand region (plain DOM + canvas, flat 2D art in Breneland's look). Called on every change.
  // s: { T (the public table), v (your seat's view if seated, else the public view), me (your engine seat or null),
  //      moves (your legal moves, [] if watching), seated (bool), ui (a plain object kept per open table for your local
  //      selection state; reset when the table changes), send(move), toast(text), rerender() }
  render(board, hand, s) {},
  buttons(s) -> [{ id, icon (inline SVG string, static), label, word?, hot?, key?, run?() , move? }], // move: sent as is
  chip(T, v, k) -> { count?, score?, extra? (array of elements) } | null,   // the players strip, engine seat k
  pill(T, v) -> string | null,                                                // e.g. 'Bag 42' or 'Round 3/7'
  describe(T, v, beat, me) -> string | null,   // the slip line for a beat ("Pips played QUILT for 34")
  roundPanel?(T, beat, me) -> HTMLElement,    // shown on beat kind 'roundEnd'
  overPanel(T, result, me) -> HTMLElement,     // the end card (T.result: { totals, winners, counted })
  rulesCard() -> HTMLElement,                   // how to play, short, with small pictures/icons
  setupLine?(settings, n) -> string,           // under the host settings
  onKey?(code, s) -> bool,                      // keyboard (code = KeyboardEvent.code); true = handled
  moments?(beat, c),                            // sounds: c.play(name, delayMs) with names from tg-sound.js SOUNDS
                                                //   (tg-tile, tg-lift, tg-back, tg-draw, tg-deal, tg-yourturn, tg-tick,
                                                //   tg-tally, tg-fanfare, tg-cheer, tg-stamp, tg-ring, tg-answer);
                                                //   c.eye (overlay only, may be null): eye.turn(), eye.stamp(text, sub),
                                                //   eye.ribbon(text), eye.confetti(); c.me = your engine seat or null
  css: `...`,                                   // the module's own CSS (injected once), every selector under .tg-<id>
}
```

Look: Breneland's style: ink outline `#2b2340` 2-3 px, warm palette (felt `#2f6b4f`, wood `#9a6538` / `#6e4224`, cream
`#fff8ec` / `#fbf6ea`, gold `#ffd34d`, red `#e0463c`, seat colours in `breneland-live/js/table-games/dominoes.js`
SEAT_COLORS), font Fredoka (already loaded by the game), chunky readable shapes, icons over words, nothing tiny. It must fit
the board region at phone sizes (board region about 360 x 300 px upright, 700 x 260 px sideways) and PC (about 900 x 420).
Interaction: real mouse and real touch (pointer events), tap-then-tap always works, drag where it feels natural. Every
interactive thing a button with an aria-label. Never put player-typed text into innerHTML (use textContent).

## 4. Harness check (headless)

`game-waves/tools/harness/` serves a page that mounts a fake frame (board + hand + buttons regions sized like the real
layouts), runs the engine and its bots in the page, and renders your UI module through the same calls. Screenshot it with
the preinstalled Playwright/Chromium (`require('playwright')`, `chromium.launch()`, deviceScaleFactor 1) at 390x844, 844x390
and 1280x720, mid-game and at game over. Look at the pictures and fix what reads badly.
