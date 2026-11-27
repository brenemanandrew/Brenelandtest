@echo off
rem Starts the Brene relay for the VaM plugin. Leave this window open while you use VaM.
rem Wizra from brenai.fly.dev needs BRENAI_PIN (and BRENAI_PASSWORD if the game has one) set in Windows' environment variables.
rem Without BRENAI_PIN she runs on LM Studio on this PC instead.
cd /d "%~dp0"
node brene-relay.mjs %*
pause
