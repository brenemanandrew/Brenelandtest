---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-21
branch: claude/multi-agent-work-router-w9jzlg
title: Brenebase built: routing, split jobs, project cards, update files, PC agent, Copilot
---
## Done
- Router with 8 tools and modes, autonomy levels, keep-local split for private text
- Split jobs: code part to Claude Code with neutral slots, art and story elsewhere, merge manifest, merge and file checks on the PC
- Project cards for Breneland, Brenai, Arden work tools, Brenerig, Brenebase and Valinfor (placeholder), with notes read hourly from each project's own files
- Update files: .brenebase/updates in repos, Brenebase/updates on Drive, direct posts, and Brenebase's own Claude Code jobs
- PC agent (model, Wizra bridge, town bridge, worker) over Tailscale with a polling fallback, and jumpstart when a job needs the PC
- Copilot tool for SFW, non-sensitive, non-coding work, automatic with COPILOT_TOKEN or by copy and paste
- Update rule added to CLAUDE.md / AGENTS.md in Brenelandtest, brenai, ardenot and Brenerig (on branches, not main)

## Tested
- 30 routing and split checks pass (node hub/test.mjs)
- End to end with stand-ins: split to merge, PC agent by polling and through a stand-in Tailscale proxy, jumpstart, project sync, update parsing and hints, Copilot fit check and copy-and-paste flow

## Not tested
- Real Claude Code, real Tailscale on Fly, real lms on the PC, the Windows installer, a real Meshy job, real Claude API and GitHub Models calls

## Broken
- None known

## Open
- Deploy to brenebase.fly.dev (needs Andrew's OK)
- Valinfor: what it is and where it lives
- Confirm the Breneland Drive file paths under G:\My Drive
- Arden-hub is public and its README states the default PIN; set a PIN hash or make it private
- Arden-hub and Breneland-Next need the update rule added by hand (no write access from here)

## Settings changed
- fly.toml app = brenebase, volume brenebase_data, machine always on
