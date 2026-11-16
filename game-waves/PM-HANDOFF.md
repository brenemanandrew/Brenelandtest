# Breneland: merge handoff for the master project manager (prepared 2026-11-16)

Two cloud sessions worked on Breneland in repo `brenemanandrew/Brenelandtest`. NOTHING here is on the live game
(breneland.fly.dev / Breneland-Next). Ship only when Andrew says so. The real project (server + client) is on the PC
(F:\Projects\Breneland-Next), so every change below has to be copied in there.

| Session | What | Branch | Test site |
|---|---|---|---|
| Game Waves (this one) | Table games waves 11-13, unicorn area follow-ups | `claude/game-waves`, plus commits on `claude/here-zudse5` | games: none (harness only); unicorn work: brenelandtest-refresh.fly.dev |
| Here (World Refresh) | New world models, staff, terrain, stores | `claude/here-zudse5` | https://brenelandtest-refresh.fly.dev |

## 1. Table games (branch `claude/game-waves`, folder `game-waves/`)

Install steps: `game-waves/README.md` (files to copy, one small server patch, games.json entries, achievements, credits).

| Game | Wave | id | Seats | Kind |
|---|---|---|---|---|
| Word Weave | 11 | `word-weave` | 2-4 | word game, own 15x15 board, ENABLE word list minus a blocklist |
| The Missing Pie | 12 | `missing-pie` | 3-6 | who-took-the-pie mystery |
| Town Tycoon | 12 | `town-tycoon` | 2-4 | property game, auctions and trades |
| Hearthfield | 13 | `hearthfield` | 3-4 | settlers game, Rascal the raccoon |
| Pillow Forts | 13 | `pillow-forts` | 2-6 | conquest game in a giant house, pillow fights |

- Every game: engine + bot (easy/normal/hard) + phone/PC UI + 3D table pieces + rules card + sounds; all names, boards
  and wording original.
- Shared: `tg-games.js` (game registry), generic and per-game 3D, a changed `index.js` (Mexican Train path unchanged),
  server patch `table-games-index-check.patch` (lets Word Weave's free-form moves through `check()`).
- Achievements: 19 new across the five games (plus the 7 existing kept), server `lib/tg-achievements.js`, client
  medallions in `public/js/achievements.js`.
- Tests (all pass here): 300-480 bot games per game (legal moves, no leaks, replay, bot strength), each game run through
  a copy of the real server's table-games loop with no refused moves, headless screenshots at phone and PC sizes.
- Not done: Wave 14 (mahjong). Not tested on the real server.

## 2. World Refresh test game (branch `claude/here-zudse5`, built by `world-refresh/tools/make_testgame.py`)

Done by the Here session (see `world-refresh/STATUS.md` and the branch log):
- Garden, props, street lamps, benches, picnic tables, shelter, woods floor, town clock tower, hedges, shore rocks.
- Nala and Dax as Meshy models on the game's dog rig. Accessories in Peak Threads. People with more natural proportions.
- Terrain reshaped in Blender, yard fence, houses with porches and yards, vibrant visual pass, lake reflections.
- Staff (Belinda, Mina, Zoe, Asha): new outfits, heels, faces, staff editor page.
- Unstable Unicorns diorama (rainbow arch, portal, stone path on a hill).
- Strip mall / store concepts (Peak Threads, Belinda's Spa) in progress.

Done by this session on the same branch (2026-11-16, Andrew's requests):
- Old Unstable Unicorns lawn removed (plaza, sign, bunting, balloons, old unicorns, ring path); park trail runs on to
  the diorama's stone path; floating name over the portal. `?oldworld` shows the old lawn.
- Diorama repaired (rainbow front and doorway tops had been cut away): `tools/unicorns_fix_model.py`, `patch_diorama_fix.py`.
- New toy-like unicorns (Sprinkles, Moonpie, Clover, Noodle, Bean) on the lawn: `tools/unicorn-toy.js`, `patch_unicorns_new.py`.
- Tess and Rudy roam town and play catch, tag, jump rope, hide-and-seek and rock-paper-scissors at seven spots, in sync
  for everyone: `tools/kids-roam.js`, `patch_kids_roam.py`.

Known issue: the test build logs 12 NaN geometry errors from Belinda's heels (`waitress_outfits.py` / `mpfb_fixes.py`
sandals/heels); the source model is clean.

## 3. To merge into the game proper (when Andrew says go)

1. Table games: follow `game-waves/README.md` on the PC project; run the game tests; deploy.
2. World refresh: the test game is the live client plus patches applied by `make_testgame.py` and the `patch_*.py`
   scripts. Port those patches into Breneland-Next's `public/js` and models (the patches are exact-string edits, so they
   map one to one), keeping the `?oldworld` style switches out of the live build.
3. Update the master docs in Drive (progress, plan) and upload.
