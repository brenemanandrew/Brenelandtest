---
project: brenai
by: Claude (Brenebase session)
date: 2026-11-27
branch: claude/multi-agent-work-router-w9jzlg
title: Brene for VaM - calm layout (dock only at start, one window at a time)
---
## Done
- Andrew's verdict on the first full screen: too busy. Panels now have kinds: tool (Scene, Glasses, Layout, People), window (Character, Set up scene, Glasses setup, Story, Laptop, Help), dialog (choice, scene picker, Margo's call), chat, dock.
- Start shows only the dock. New dock buttons Tools (all tool panels on/off) and Wizra (her chat). Opening a window closes the other window. Show all brings back tool panels only. Older saved layouts fall back to these defaults.
- Dock order: Menu, Tools, Wizra, Character, Set up scene, Glasses setup, Story, Help, Edit layout. Wizra bar labels shortened. Tours open the tool panels when a step needs them.
- Move VaM menu (Layout panel, radial > Panels): moves VaM's own menu panels (world-space canvases not on an atom and not Brene's) up, down, left, right, closer, further, smaller, bigger, reset; re-applied every frame on top of where VaM puts them; saved with the layout. Shows how many menu parts it found.

## Tested
- Plugin compile check passed.
## Not tested
- In VaM after this change.
## Broken
- None known.
## Open
- Standing rule kept: nothing removed, only presentation changed.
## Settings changed
- Layout file version 2 (visibility of tool and chat panels saved; windows and pop-ups always start closed).
