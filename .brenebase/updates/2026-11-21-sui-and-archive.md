---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-21
branch: claude/multi-agent-work-router-w9jzlg
title: SUI read from the WoW AddOns folder; Home KVM, IFP TV panel and OptiPlex cleanup archived
---
## Done
- SUI card reads SUI.toc (title, notes, version, game version) plus optional README and CHANGELOG from the WoW AddOns folder through the PC worker; update files there too
- WoW AddOns folder added to the worker's readable folders
- Home KVM, IFP TV panel and OptiPlex PC cleanup recorded as archived projects: shown folded on the Projects tab, never matched unless tagged (KVM, IFP, OptiPlex). Drive files untouched

## Tested
- .toc parsing; archived projects not matched by keywords; KVM tag still reaches its card; 35 checks pass

## Not tested
- Reading the real AddOns folder on the PC

## Open
- Confirm the AddOns path (default is the retail install under Program Files (x86))
