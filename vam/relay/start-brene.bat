@echo off
rem Starts the Brene relay for the VaM plugin. Leave this window open while you use VaM.
rem Wizra from brenai.fly.dev needs BRENAI_PIN (and BRENAI_PASSWORD if the game has one) set in Windows' environment variables.
rem Without BRENAI_PIN she runs on LM Studio on this PC instead.
cd /d "%~dp0"
rem Node.js is needed, version 22 or newer. Say so plainly if it is missing.
where node >nul 2>nul || (echo Node.js is not installed on this PC. Get version 22 or newer from nodejs.org, then run this again. & pause & exit /b 1)
node brene-relay.mjs %*
pause
