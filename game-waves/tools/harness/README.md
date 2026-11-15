# Table game harness (game-waves)

One game on the real overlay frame (`breneland-live/js/table-games/overlay.js`, with the game-waves client files laid over the
mirror), its engine and bots running in the page. Seat 0 is You, the rest bots.

- Screenshots: `node game-waves/tools/harness/run.mjs GAME OUTDIR [players] [advance] [seed] [extra-query]`
  e.g. `node game-waves/tools/harness/run.mjs word-weave /tmp/out 3 30 7 set=length:quick`. It writes portrait 390x844, phone 844x390
  and PC 1280x720 at move `advance` and at the end, and prints page errors (exit code 1 if any).
- Play it by hand: `node game-waves/tools/harness/server.mjs 8765` then open `http://127.0.0.1:8765/?game=GAME&players=3`.
- Query: `game`, `players`, `advance` (moves auto-played first, or `end`), `seed`, `level` (the bots), `watch=1` (as a spectator),
  `set=key:value,...` (settings), `rules=1` (open the rules card), `until=STAGE` (after `advance`, play on until seat 0 has a move
  in that view stage, e.g. `until=auction` or `until=offer` for Town Tycoon).
- In the page: `window.__send(move)` sends a move for seat 0, `__step()` one auto move, `__state()`, `__beats`, `__errors`, `__toasts`.
- Engines are served from `game-waves/server/lib/table-games/` at `/engines/`; the UI modules from `game-waves/client/js/table-games/`.
