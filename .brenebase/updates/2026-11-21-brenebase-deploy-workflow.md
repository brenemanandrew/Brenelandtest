---
project: brenebase
by: Claude Code, cloud session
date: 2026-11-21
branch: claude/multi-agent-work-router-w9jzlg
title: Deploy workflow for brenebase.fly.dev (run by hand only)
---
## Done
- .github/workflows/brenebase-deploy.yml: run by hand only; creates the app and volume, copies the repo secrets that exist, deploys, checks the site answers
- Test site deploy (fly-deploy.yml) now ignores hub/, .brenebase/ and the Brenebase workflow
- Brenebase refuses to start on Fly without HUB_PASSWORD and HUB_WORKER_TOKEN

## Tested
- Docker image builds (with the sandbox CA added only for the test build) and runs: page 200, API 401 without login, 200 with it, PC installer served, Tailscale binaries present
- Missing-secret refusal on Fly

## Not tested
- The workflow on GitHub Actions and the real Fly deploy
- Real Opus review with Andrew's key (that is the point of the deploy)

## Open
- Workflow must be on main for the Run button to appear (needs Andrew's OK to push it)
- Repo secrets to add: BRENEBASE_FLY_TOKEN, BRENEBASE_PASSWORD, BRENEBASE_PC_KEY, BRENEBASE_ANTHROPIC_KEY

## Settings changed
- New repo secret names (see the workflow header); none set by Claude
