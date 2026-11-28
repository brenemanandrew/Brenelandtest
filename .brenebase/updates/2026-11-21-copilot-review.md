---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-21
branch: claude/multi-agent-work-router-w9jzlg
title: Copilot switched to personal Microsoft Copilot; Claude Opus checks complex answers
---
## Done
- Copilot tool now uses personal Microsoft Copilot by copy and paste; work Copilot mode removed for now
- Claude Opus (claude-opus-5-5, high effort) reviews complex Copilot answers before they are shown, with each correction listed (was, now, why) and the original kept
- Review setting on the Tools tab: complex (default), all, off; track record of checked, clean, corrected, unusable

## Tested
- With a stand-in Claude API: a wrong date was corrected and listed; a short rewrite skipped review; review off skipped it; no API key shows "not checked"
- 30 routing and split checks still pass

## Not tested
- A real Claude Opus review (no API key here) and a real Copilot conversation

## Open
- ANTHROPIC_API_KEY on Brenebase is needed for the review
