# Breneland World Refresh

A clean start (2026-11-14). Scope: make the game world look better with Meshy models, while keeping the love and care of the original world's look. The characters in the live game are close enough and are NOT part of this project.

Target look: `reference/concept-sheet.png`, panel 4 "Scenery & Environment Study" (porch, Breneland sign, garden beds, stone path, street lamp, hound, modular garden beds).

## What this project does
Replace existing game assets with Meshy models that have high visual impact and joy and are quick to swap in. One for one: same footprint, same spot, same job in the game.

## Order of work
1. Plants and trees - `sheets/01-plants-trees.md`
2. Small props - `sheets/02-small-props.md`
3. Larger props - `sheets/03-large-props.md`
4. Set pieces and game areas - `sheets/04-set-pieces.md`

Each sheet lists every asset to replace, what it is in the game today, its size and triangle budget, and the exact Meshy description to paste.

## Rules
- Style: `STYLE.md`. Cel shaded, simple Animal Crossing style textures, slightly watercoloured like the concept art. Every Meshy prompt starts with the style block from that file.
- How a model gets into the game: `SWAP.md`.
- Nothing ships to the live game (breneland.fly.dev, repo Breneland-Next) until Andrew says so.
- Writing for Andrew: never use em dashes, answer first and short, no claims without evidence.

## Where things are
- `reference/` - the concept sheet. Add more reference images here.
- `sheets/` - the four asset sheets.
- `models/` - Meshy exports go here, in a folder per phase (`models/01-plants-trees/oak.glb`).
- `KICKOFF.md` - the text to start the new conversation with.
- The older character builder work in this repo (`pipeline/`, `site/`, root `CLAUDE.md`) is kept for reference only. It is not part of this project.
